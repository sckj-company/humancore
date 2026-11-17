<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPayment;
use App\Models\Tenant;
use App\Services\SaaS\BillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class PlatformBillingController extends BaseController
{
    public function __construct(private readonly BillingService $billingService) {}

    public function invoices(Request $request): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $invoices = SubscriptionInvoice::query()
            ->with([
                'tenant:id,name,slug,tax_id,email,billing_email',
                'plan:id,name,slug',
                'payments' => fn ($q) => $q->latest('id'),
            ])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('tenant_id'), fn ($q) => $q->where('tenant_id', $request->integer('tenant_id')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(function ($sub) use ($term) {
                    $sub->where('invoice_number', 'like', "%{$term}%")
                        ->orWhereHas('tenant', fn ($tq) => $tq->where('name', 'like', "%{$term}%"));
                });
            })
            ->latest('id')
            ->paginate($request->integer('per_page', 20));

        $summary = [
            'open_total' => (float) SubscriptionInvoice::query()->whereIn('status', ['open', 'overdue'])->sum('total_amount'),
            'under_review_count' => SubscriptionInvoice::query()->where('status', 'under_review')->count(),
            'paid_this_month' => (float) SubscriptionInvoice::query()
                ->where('status', 'paid')
                ->whereYear('paid_at', now()->year)
                ->whereMonth('paid_at', now()->month)
                ->sum('total_amount'),
            'pending_payments_count' => SubscriptionPayment::query()->where('status', 'pending')->count(),
        ];

        return $this->success([
            'summary' => $summary,
            'invoices' => $invoices,
        ]);
    }

    public function generateInvoice(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $data = $request->validate([
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $subscription = $tenant->latestSubscription()->first();
        if (! $subscription) {
            return $this->error('Esta empresa não possui subscrição ativa para faturar.', 422);
        }

        $invoice = $this->billingService->generateInvoice($subscription, $request->user(), $data['notes'] ?? null);

        return $this->success($invoice->load(['tenant:id,name,slug', 'plan:id,name']), 'Fatura gerada com sucesso.', 201);
    }

    public function payments(Request $request): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $payments = SubscriptionPayment::query()
            ->with([
                'tenant:id,name,slug,tax_id',
                'invoice:id,invoice_number,total_amount,currency,status,due_date',
                'submitter:id,name,email',
                'reviewer:id,name,email',
            ])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest('id')
            ->paginate($request->integer('per_page', 20));

        return $this->paginated($payments);
    }

    public function approvePayment(Request $request, SubscriptionPayment $payment): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $data = $request->validate([
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $approved = $this->billingService->approvePayment($payment, $request->user(), $data['notes'] ?? null);

        return $this->success($approved->load('invoice'), 'Pagamento aprovado e subscrição renovada com sucesso.');
    }

    public function rejectPayment(Request $request, SubscriptionPayment $payment): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $rejected = $this->billingService->rejectPayment($payment, $request->user(), $data['reason']);

        return $this->success($rejected->load('invoice'), 'Comprovativo rejeitado com sucesso.');
    }

    public function downloadProof(Request $request, SubscriptionPayment $payment): BinaryFileResponse
    {
        $this->authorizePlatformAdmin($request);

        $path = $this->billingService->downloadProofPath($payment);
        abort_if(! $path, 404, 'Comprovativo não encontrado.');

        return response()->download($path, $payment->proof_original_name ?: basename($path));
    }

    public function runLifecycle(Request $request): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $result = $this->billingService->processLifecycle();

        return $this->success($result, 'Ciclo de subscrições processado.');
    }

    private function authorizePlatformAdmin(Request $request): void
    {
        $user = $request->user();
        if (! $user || (! $user->hasRole('super-admin') && ! $user->can('manage_platform'))) {
            abort(403, 'Acesso restrito à gestão global da plataforma.');
        }
    }
}
