<?php

namespace App\Services\SaaS;

use App\Models\LeaveType;
use App\Models\Plan;
use App\Models\SalaryComponent;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class TenantProvisioningService
{
    /**
     * Cria uma nova empresa com os dados padrão de Angola (férias e componentes salariais),
     * utilizador administrador opcional e subscrição inicial opcional.
     *
     * @param  array<string, mixed>  $tenantData
     * @param  array<string, mixed>  $options
     */
    public function createTenant(array $tenantData, array $options = []): Tenant
    {
        $tenantData['currency'] = $tenantData['currency'] ?? 'AOA';
        $tenantData['locale'] = $tenantData['locale'] ?? 'pt';
        $tenantData['timezone'] = $tenantData['timezone'] ?? 'Africa/Luanda';
        $tenantData['status'] = $tenantData['status'] ?? 'active';
        $tenantData['origin_type'] = $tenantData['origin_type'] ?? 'platform';

        return DB::transaction(function () use ($tenantData, $options): Tenant {
            $tenant = Tenant::query()->create($tenantData);

            /** @var TenantManager $manager */
            $manager = app(TenantManager::class);
            $previousTenant = $manager->get();
            $manager->set($tenant);

            try {
                if (! empty($options['admin_email'])) {
                    $admin = User::query()->create([
                        'tenant_id' => $tenant->id,
                        'name' => $options['admin_name'] ?? 'Administrador',
                        'email' => $options['admin_email'],
                        'password' => Hash::make($options['admin_password'] ?? 'password'),
                        'locale' => $tenantData['locale'],
                        'timezone' => $tenantData['timezone'],
                        'email_verified_at' => now(),
                        'is_active' => true,
                    ]);
                    $admin->assignRole('admin');
                }

                $this->seedAngolaDefaults($tenant);

                if (! empty($options['plan_id'])) {
                    $plan = Plan::query()->findOrFail((int) $options['plan_id']);
                    $this->assignSubscription(
                        $tenant,
                        $plan,
                        $options['subscription'] ?? [],
                        $options['assigned_by'] ?? null,
                    );
                }
            } finally {
                if ($previousTenant) {
                    $manager->set($previousTenant);
                } else {
                    $manager->clear();
                }
            }

            return $tenant;
        });
    }

    public function seedAngolaDefaults(Tenant $tenant): void
    {
        $leaveDefaults = [
            ['name' => 'Férias Anuais', 'code' => 'vacation', 'category' => 'vacation', 'days_per_year' => 22, 'is_paid' => true],
            ['name' => 'Doença', 'code' => 'sick', 'category' => 'sick', 'days_per_year' => 30, 'is_paid' => true],
            ['name' => 'Casamento', 'code' => 'marriage', 'category' => 'family', 'days_per_year' => 3, 'is_paid' => true],
            ['name' => 'Falecimento', 'code' => 'bereavement', 'category' => 'family', 'days_per_year' => 5, 'is_paid' => true],
            ['name' => 'Licença sem Vencimento', 'code' => 'unpaid', 'category' => 'unpaid', 'days_per_year' => 30, 'is_paid' => false],
            ['name' => 'Maternidade', 'code' => 'maternity', 'category' => 'maternity', 'days_per_year' => 90, 'is_paid' => true],
        ];

        foreach ($leaveDefaults as $lt) {
            LeaveType::query()->withoutGlobalScopes()->firstOrCreate(
                ['tenant_id' => $tenant->id, 'code' => $lt['code']],
                $lt,
            );
        }

        $salaryDefaults = [
            ['code' => 'base_salary', 'name' => 'Salário Base', 'type' => 'earning', 'calculation_type' => 'fixed', 'is_mandatory' => true, 'priority' => 10],
            ['code' => 'meal_allowance', 'name' => 'Subsídio de Refeição', 'type' => 'benefit', 'calculation_type' => 'fixed', 'default_value' => 0, 'is_mandatory' => false, 'priority' => 20],
            ['code' => 'transport_allowance', 'name' => 'Subsídio de Transporte', 'type' => 'benefit', 'calculation_type' => 'fixed', 'default_value' => 0, 'is_mandatory' => false, 'priority' => 21],
            ['code' => 'vacation_subsidy', 'name' => 'Subsídio de Férias', 'type' => 'benefit', 'calculation_type' => 'fixed', 'default_value' => 0, 'is_mandatory' => false, 'priority' => 22],
            ['code' => 'christmas_subsidy', 'name' => 'Subsídio de Natal', 'type' => 'benefit', 'calculation_type' => 'fixed', 'default_value' => 0, 'is_mandatory' => false, 'priority' => 23],
            ['code' => 'family_allowance', 'name' => 'Abono de Família', 'type' => 'benefit', 'calculation_type' => 'fixed', 'default_value' => 0, 'is_mandatory' => false, 'priority' => 24],
            ['code' => 'additional_allowance', 'name' => 'Abono Adicional', 'type' => 'earning', 'calculation_type' => 'fixed', 'default_value' => 0, 'is_mandatory' => false, 'priority' => 25],
            ['code' => 'overtime', 'name' => 'Horas Extraordinárias', 'type' => 'earning', 'calculation_type' => 'formula', 'is_mandatory' => true, 'priority' => 30],
            ['code' => 'inss', 'name' => 'INSS (Funcionário)', 'type' => 'deduction', 'calculation_type' => 'percentage', 'default_value' => 3, 'is_mandatory' => true, 'priority' => 100],
            ['code' => 'irt', 'name' => 'IRT', 'type' => 'tax', 'calculation_type' => 'formula', 'is_mandatory' => true, 'priority' => 110],
        ];

        foreach ($salaryDefaults as $sc) {
            SalaryComponent::query()->withoutGlobalScopes()->firstOrCreate(
                ['tenant_id' => $tenant->id, 'code' => $sc['code']],
                $sc,
            );
        }
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function assignSubscription(Tenant $tenant, Plan $plan, array $attributes = [], ?int $assignedBy = null): TenantSubscription
    {
        $startsAt = isset($attributes['starts_at']) ? now()->parse($attributes['starts_at']) : now();
        $cycle = $attributes['billing_cycle_override'] ?? $plan->billing_cycle;
        $endsAt = array_key_exists('ends_at', $attributes)
            ? ($attributes['ends_at'] ? now()->parse($attributes['ends_at']) : null)
            : $this->calculateEndsAt($startsAt, $cycle, $plan->custom_cycle_days);

        // Encerra subscrições anteriores ativas da mesma empresa para manter histórico limpo
        TenantSubscription::query()
            ->where('tenant_id', $tenant->id)
            ->whereIn('status', ['active', 'pending_payment', 'past_due', 'grace_period'])
            ->update(['status' => 'cancelled', 'cancelled_at' => now()]);

        $subscription = TenantSubscription::query()->create([
            'tenant_id' => $tenant->id,
            'plan_id' => $plan->id,
            'status' => $attributes['status'] ?? 'active',
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'grace_until' => $attributes['grace_until'] ?? null,
            'auto_renew' => $attributes['auto_renew'] ?? true,
            'custom_price' => $attributes['custom_price'] ?? null,
            'billing_cycle_override' => $attributes['billing_cycle_override'] ?? null,
            'overrides' => $attributes['overrides'] ?? null,
            'notes' => $attributes['notes'] ?? null,
            'assigned_by' => $assignedBy,
        ]);

        app(PlanEntitlementService::class)->clearCacheForTenant($tenant->id);

        return $subscription;
    }

    public function calculateEndsAt(\DateTimeInterface $startsAt, string $cycle, ?int $customDays = null): ?\Illuminate\Support\Carbon
    {
        $carbon = \Illuminate\Support\Carbon::instance($startsAt)->copy();

        return match ($cycle) {
            'monthly' => $carbon->addMonth(),
            'quarterly' => $carbon->addMonths(3),
            'semiannual' => $carbon->addMonths(6),
            'annual' => $carbon->addYear(),
            'custom_days' => $customDays ? $carbon->addDays($customDays) : $carbon->addMonth(),
            'lifetime' => null,
            default => $carbon->addMonth(),
        };
    }
}
