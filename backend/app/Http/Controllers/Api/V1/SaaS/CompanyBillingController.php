<?php

namespace App\Http\Controllers\Api\V1\SaaS;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPayment;
use App\Services\SaaS\BillingService;
use App\Services\SaaS\PlanEntitlementService;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class CompanyBillingController extends BaseController
{
    public function __construct(
        private readonly TenantManager $tenantManager,
        private readonly PlanEntitlementService $entitlementService,
        private readonly BillingService $billingService,
    ) {}

    public function subscription(): JsonResponse
    {
        $tenant = $this->tenantManager->requireTenant();

        return $this->success($this->entitlementService->resolve($tenant, true));
    }

    public function invoices(Request $request): JsonResponse
    {
        $tenant = $this->tenantManager->requireTenant();
        $entitlements = $this->entitlementService->resolve($tenant);

        if ($entitlements['is_managed'] ?? false) {
            return $this->success([
                'billed_to_manager' => true,
                'manager_tenant' => $entitlements['manager_tenant'],
                'invoices' => [],
            ]);
        }

        $invoices = SubscriptionInvoice::query()
            ->where('tenant_id', $tenant->id)
            ->with(['plan:id,name,slug', 'payments' => fn ($q) => $q->latest('id')])
            ->latest('id')
            ->get();

        return $this->success([
            'billed_to_manager' => false,
            'manager_tenant' => null,
            'invoices' => $invoices,
        ]);
    }

    public function submitPayment(Request $request, SubscriptionInvoice $invoice): JsonResponse
    {
        $tenant = $this->tenantManager->requireTenant();
        if ((int) $invoice->tenant_id !== (int) $tenant->id) {
            return $this->error('Fatura não pertence à empresa ativa.', 403);
        }

        $user = $request->user();
        if (! $user->hasRole('admin') && ! $user->hasRole('super-admin') && ! $user->can('configure_setting')) {
            return $this->error('Sem permissão para submeter comprovativos de faturação.', 403);
        }

        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'payment_method' => ['required', 'in:bank_transfer,multicaixa_reference,cash,gpo,other'],
            'reference_code' => ['nullable', 'string', 'max:120'],
            'payment_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'proof_file' => ['nullable', 'file', 'mimes:pdf,jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $payment = $this->billingService->submitPaymentProof(
            $invoice,
            $user,
            $data,
            $request->file('proof_file'),
        );

        return $this->success($payment, 'Comprovativo enviado para validação do administrador da plataforma.', 201);
    }

    public function downloadProof(Request $request, SubscriptionPayment $payment): BinaryFileResponse
    {
        $tenant = $this->tenantManager->requireTenant();
        if ((int) $payment->tenant_id !== (int) $tenant->id && ! $request->user()->hasRole('super-admin')) {
            abort(403, 'Sem permissão para aceder a este comprovativo.');
        }

        $path = $this->billingService->downloadProofPath($payment);
        abort_if(! $path, 404, 'Comprovativo não encontrado.');

        return response()->download($path, $payment->proof_original_name ?: basename($path));
    }
}
