<?php

namespace App\Services\SaaS;

use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPayment;
use App\Models\TenantRelationship;
use App\Models\TenantSubscription;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class BillingService
{
    public function __construct(
        private readonly PlanEntitlementService $entitlementService,
        private readonly TenantProvisioningService $provisioningService,
    ) {}

    /**
     * Gera fatura para uma subscrição.
     * Regra de negócio: empresas geridas não são faturadas diretamente;
     * a cobrança é feita exclusivamente à Empresa Gestora ou empresa independente.
     */
    public function generateInvoice(TenantSubscription $subscription, ?User $actor = null, ?string $notes = null): SubscriptionInvoice
    {
        $tenant = $subscription->tenant()->firstOrFail();

        $isManaged = TenantRelationship::query()
            ->where('managed_tenant_id', $tenant->id)
            ->where('status', 'active')
            ->exists();

        if ($isManaged) {
            throw ValidationException::withMessages([
                'tenant_id' => ['Empresas geridas não recebem faturação direta; a faturação é emitida apenas para a Empresa Gestora.'],
            ]);
        }

        $plan = $subscription->plan()->firstOrFail();
        $entitlements = $this->entitlementService->resolve($tenant, true);
        $usage = $entitlements['usage'] ?? [];

        $baseAmount = $subscription->effectiveBasePrice();
        $lineItems = [
            [
                'description' => "Subscrição {$plan->name} ({$subscription->effectiveBillingCycle()})",
                'quantity' => 1,
                'unit_price' => $baseAmount,
                'amount' => $baseAmount,
            ],
        ];

        $overageAmount = 0.0;
        $pricingModel = $plan->pricing_model ?? 'flat';

        if (in_array($pricingModel, ['per_employee', 'hybrid'], true) && (float) $plan->extra_employee_price > 0) {
            $usedEmployees = (int) ($usage['employees'] ?? 0);
            $extraEmployees = max(0, $usedEmployees - (int) $plan->included_employees);
            if ($extraEmployees > 0) {
                $empCharge = round($extraEmployees * (float) $plan->extra_employee_price, 2);
                $overageAmount += $empCharge;
                $lineItems[] = [
                    'description' => "Funcionários adicionais ({$extraEmployees} x {$plan->extra_employee_price} {$plan->currency})",
                    'quantity' => $extraEmployees,
                    'unit_price' => (float) $plan->extra_employee_price,
                    'amount' => $empCharge,
                ];
            }
        }

        if (in_array($pricingModel, ['per_managed_tenant', 'hybrid'], true) && (float) $plan->extra_managed_tenant_price > 0) {
            $usedManaged = (int) ($usage['managed_tenants'] ?? 0);
            $extraManaged = max(0, $usedManaged - (int) $plan->included_managed_tenants);
            if ($extraManaged > 0) {
                $mgrCharge = round($extraManaged * (float) $plan->extra_managed_tenant_price, 2);
                $overageAmount += $mgrCharge;
                $lineItems[] = [
                    'description' => "Empresas geridas adicionais ({$extraManaged} x {$plan->extra_managed_tenant_price} {$plan->currency})",
                    'quantity' => $extraManaged,
                    'unit_price' => (float) $plan->extra_managed_tenant_price,
                    'amount' => $mgrCharge,
                ];
            }
        }

        $total = round($baseAmount + $overageAmount, 2);
        $periodStart = now()->startOfDay();
        $periodEnd = $this->provisioningService->calculateEndsAt(
            $periodStart,
            $subscription->effectiveBillingCycle(),
            $plan->custom_cycle_days,
        );

        return SubscriptionInvoice::query()->create([
            'invoice_number' => $this->nextInvoiceNumber(),
            'tenant_id' => $tenant->id,
            'subscription_id' => $subscription->id,
            'plan_id' => $plan->id,
            'period_start' => $periodStart->toDateString(),
            'period_end' => $periodEnd?->toDateString(),
            'due_date' => now()->addDays(max(1, (int) $plan->grace_period_days))->toDateString(),
            'currency' => $plan->currency,
            'subtotal' => $baseAmount,
            'overage_amount' => $overageAmount,
            'discount_amount' => 0,
            'total_amount' => $total,
            'line_items' => $lineItems,
            'status' => $total <= 0 ? 'paid' : 'open',
            'paid_at' => $total <= 0 ? now() : null,
            'notes' => $notes,
            'created_by' => $actor?->id,
        ]);
    }

    /**
     * Submete um comprovativo de pagamento manual (transferência / referência) para revisão do SuperAdmin.
     *
     * @param  array<string, mixed>  $data
     */
    public function submitPaymentProof(
        SubscriptionInvoice $invoice,
        User $submitter,
        array $data,
        ?UploadedFile $proofFile = null,
    ): SubscriptionPayment {
        if (in_array($invoice->status, ['paid', 'void'], true)) {
            throw ValidationException::withMessages([
                'invoice_id' => ['Esta fatura já se encontra liquidada ou anulada.'],
            ]);
        }

        $proofPath = null;
        $proofOriginalName = null;

        if ($proofFile) {
            $proofOriginalName = $proofFile->getClientOriginalName();
            $proofPath = $proofFile->store("saas/payment-proofs/tenant-{$invoice->tenant_id}", 'local');
        }

        return DB::transaction(function () use ($invoice, $submitter, $data, $proofPath, $proofOriginalName): SubscriptionPayment {
            $payment = SubscriptionPayment::query()->create([
                'invoice_id' => $invoice->id,
                'tenant_id' => $invoice->tenant_id,
                'amount' => $data['amount'] ?? $invoice->total_amount,
                'currency' => $invoice->currency,
                'payment_method' => $data['payment_method'] ?? 'bank_transfer',
                'reference_code' => $data['reference_code'] ?? null,
                'payment_date' => $data['payment_date'] ?? now()->toDateString(),
                'proof_file_path' => $proofPath,
                'proof_original_name' => $proofOriginalName,
                'status' => 'pending',
                'notes' => $data['notes'] ?? null,
                'submitted_by' => $submitter->id,
            ]);

            $invoice->update(['status' => 'under_review']);

            return $payment;
        });
    }

    public function approvePayment(SubscriptionPayment $payment, User $reviewer, ?string $notes = null): SubscriptionPayment
    {
        if ($payment->status !== 'pending') {
            throw ValidationException::withMessages([
                'payment' => ['Apenas pagamentos pendentes podem ser aprovados.'],
            ]);
        }

        return DB::transaction(function () use ($payment, $reviewer, $notes): SubscriptionPayment {
            $payment->update([
                'status' => 'approved',
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'notes' => $notes ?? $payment->notes,
            ]);

            $invoice = $payment->invoice()->firstOrFail();
            $invoice->update([
                'status' => 'paid',
                'paid_at' => now(),
            ]);

            $subscription = $invoice->subscription()->with('plan')->firstOrFail();
            $baseStart = $subscription->ends_at && $subscription->ends_at->isFuture()
                ? $subscription->ends_at
                : now();
            $newEnd = $this->provisioningService->calculateEndsAt(
                $baseStart,
                $subscription->effectiveBillingCycle(),
                $subscription->plan?->custom_cycle_days,
            );

            $subscription->update([
                'status' => 'active',
                'ends_at' => $newEnd,
                'grace_until' => null,
            ]);

            $invoice->tenant()->update(['status' => 'active']);
            $this->entitlementService->clearCacheForTenant($invoice->tenant_id);

            return $payment->fresh();
        });
    }

    public function rejectPayment(SubscriptionPayment $payment, User $reviewer, string $reason): SubscriptionPayment
    {
        if ($payment->status !== 'pending') {
            throw ValidationException::withMessages([
                'payment' => ['Apenas pagamentos pendentes podem ser rejeitados.'],
            ]);
        }

        return DB::transaction(function () use ($payment, $reviewer, $reason): SubscriptionPayment {
            $payment->update([
                'status' => 'rejected',
                'reviewed_by' => $reviewer->id,
                'reviewed_at' => now(),
                'rejection_reason' => $reason,
            ]);

            $invoice = $payment->invoice()->firstOrFail();
            $hasOtherPending = $invoice->payments()->where('status', 'pending')->exists();
            if (! $hasOtherPending && $invoice->status === 'under_review') {
                $invoice->update([
                    'status' => $invoice->due_date->isPast() ? 'overdue' : 'open',
                ]);
            }

            return $payment->fresh();
        });
    }

    /**
     * Verifica subscrições vencidas e aplica período de tolerância / suspensão automática.
     *
     * @return array{grace_entered: int, suspended: int}
     */
    public function processLifecycle(): array
    {
        $graceEntered = 0;
        $suspended = 0;

        $expiredActive = TenantSubscription::query()
            ->with('plan')
            ->where('status', 'active')
            ->whereNotNull('ends_at')
            ->where('ends_at', '<', now())
            ->get();

        foreach ($expiredActive as $sub) {
            $graceDays = (int) ($sub->plan?->grace_period_days ?? 0);
            if ($graceDays > 0) {
                $sub->update([
                    'status' => 'grace_period',
                    'grace_until' => $sub->ends_at->copy()->addDays($graceDays),
                ]);
                $graceEntered++;
            } else {
                $sub->update(['status' => 'suspended']);
                $suspended++;
            }
            $this->entitlementService->clearCacheForTenant($sub->tenant_id);
        }

        $expiredGrace = TenantSubscription::query()
            ->where('status', 'grace_period')
            ->whereNotNull('grace_until')
            ->where('grace_until', '<', now())
            ->get();

        foreach ($expiredGrace as $sub) {
            $sub->update(['status' => 'suspended']);
            $suspended++;
            $this->entitlementService->clearCacheForTenant($sub->tenant_id);
        }

        return [
            'grace_entered' => $graceEntered,
            'suspended' => $suspended,
        ];
    }

    public function downloadProofPath(SubscriptionPayment $payment): ?string
    {
        if (! $payment->proof_file_path || ! Storage::disk('local')->exists($payment->proof_file_path)) {
            return null;
        }

        return Storage::disk('local')->path($payment->proof_file_path);
    }

    private function nextInvoiceNumber(): string
    {
        $prefix = 'HC-'.now()->format('Ym').'-';
        $count = SubscriptionInvoice::query()
            ->where('invoice_number', 'like', $prefix.'%')
            ->count() + 1;

        return $prefix.str_pad((string) $count, 4, '0', STR_PAD_LEFT);
    }
}
