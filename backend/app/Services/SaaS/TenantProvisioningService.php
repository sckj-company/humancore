<?php

namespace App\Services\SaaS;

use App\Models\Department;
use App\Models\LeaveType;
use App\Models\Plan;
use App\Models\Position;
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

        $this->seedDefaultOrganizationStructure($tenant, true);
    }

    public function seedDefaultOrganizationStructure(Tenant $tenant, bool $onlyIfEmpty = true): void
    {
        /** @var TenantManager $manager */
        $manager = app(TenantManager::class);
        $previousTenant = $manager->get();
        $manager->set($tenant);

        try {
            $shouldSeedDepartments = ! $onlyIfEmpty || Department::query()
                ->withoutGlobalScopes()
                ->withTrashed()
                ->where('tenant_id', $tenant->id)
                ->doesntExist();

            if ($shouldSeedDepartments) {
                $geral = Department::query()->withoutGlobalScopes()->firstOrCreate(
                    ['tenant_id' => $tenant->id, 'code' => 'GER'],
                    [
                        'tenant_id' => $tenant->id,
                        'name' => 'Geral',
                        'level' => 1,
                        'parent_id' => null,
                        'description' => 'Direção e coordenação geral da empresa.',
                        'status' => 'active',
                    ],
                );

                $level2Departments = [
                    [
                        'code' => 'ADM',
                        'name' => 'Administração',
                        'description' => 'Gestão administrativa, expediente e apoio institucional.',
                    ],
                    [
                        'code' => 'RH',
                        'name' => 'RH',
                        'description' => 'Recursos Humanos: gestão de pessoas, contratos, assiduidade e processamento salarial.',
                    ],
                    [
                        'code' => 'FIN',
                        'name' => 'Finanças',
                        'description' => 'Controlo financeiro, tesouraria, contabilidade e obrigações fiscais.',
                    ],
                    [
                        'code' => 'REC',
                        'name' => 'Recepção',
                        'description' => 'Atendimento ao público, receção de visitantes e apoio de secretaria.',
                    ],
                    [
                        'code' => 'COM',
                        'name' => 'Comercial',
                        'description' => 'Vendas, prospeção comercial e relacionamento com clientes.',
                    ],
                    [
                        'code' => 'OPS',
                        'name' => 'Operações',
                        'description' => 'Execução operacional, logística e entrega de serviços.',
                    ],
                    [
                        'code' => 'TI',
                        'name' => 'TI',
                        'description' => 'Tecnologia de informação, sistemas e suporte técnico.',
                    ],
                ];

                foreach ($level2Departments as $dept) {
                    Department::query()->withoutGlobalScopes()->firstOrCreate(
                        ['tenant_id' => $tenant->id, 'code' => $dept['code']],
                        [
                            'tenant_id' => $tenant->id,
                            'name' => $dept['name'],
                            'parent_id' => $geral->id,
                            'level' => 2,
                            'description' => $dept['description'],
                            'status' => 'active',
                        ],
                    );
                }
            }

            $shouldSeedPositions = ! $onlyIfEmpty || Position::query()
                ->withoutGlobalScopes()
                ->withTrashed()
                ->where('tenant_id', $tenant->id)
                ->doesntExist();

            if ($shouldSeedPositions) {
                $deptIdsByCode = Department::query()
                    ->withoutGlobalScopes()
                    ->where('tenant_id', $tenant->id)
                    ->whereNotNull('code')
                    ->pluck('id', 'code');

                $director = Position::query()->withoutGlobalScopes()->firstOrCreate(
                    ['tenant_id' => $tenant->id, 'code' => 'GER-01'],
                    [
                        'tenant_id' => $tenant->id,
                        'title' => 'Diretor Geral',
                        'department_id' => $deptIdsByCode->get('GER'),
                        'parent_id' => null,
                        'level' => 1,
                        'is_management' => true,
                        'description' => 'Liderança executiva geral da organização.',
                    ],
                );

                $level2Positions = [
                    ['code' => 'ADM-01', 'title' => 'Gestor de Administração', 'dept' => 'ADM'],
                    ['code' => 'RH-01', 'title' => 'Gestor de RH', 'dept' => 'RH'],
                    ['code' => 'FIN-01', 'title' => 'Gestor Financeiro', 'dept' => 'FIN'],
                    ['code' => 'COM-01', 'title' => 'Gestor Comercial', 'dept' => 'COM'],
                    ['code' => 'OPS-01', 'title' => 'Gestor de Operações', 'dept' => 'OPS'],
                    ['code' => 'TI-01', 'title' => 'Responsável de TI', 'dept' => 'TI'],
                ];

                $managersByCode = [];
                foreach ($level2Positions as $pos) {
                    $managersByCode[$pos['code']] = Position::query()->withoutGlobalScopes()->firstOrCreate(
                        ['tenant_id' => $tenant->id, 'code' => $pos['code']],
                        [
                            'tenant_id' => $tenant->id,
                            'title' => $pos['title'],
                            'department_id' => $deptIdsByCode->get($pos['dept']),
                            'parent_id' => $director->id,
                            'level' => 2,
                            'is_management' => true,
                        ],
                    );
                }

                $level3Positions = [
                    ['code' => 'ADM-02', 'title' => 'Assistente Administrativo', 'dept' => 'ADM', 'parent' => 'ADM-01'],
                    ['code' => 'RH-02', 'title' => 'Técnico de RH', 'dept' => 'RH', 'parent' => 'RH-01'],
                    ['code' => 'FIN-02', 'title' => 'Contabilista', 'dept' => 'FIN', 'parent' => 'FIN-01'],
                    ['code' => 'REC-01', 'title' => 'Recepcionista', 'dept' => 'REC', 'parent' => 'ADM-01'],
                    ['code' => 'COM-02', 'title' => 'Comercial / Vendedor', 'dept' => 'COM', 'parent' => 'COM-01'],
                    ['code' => 'OPS-02', 'title' => 'Técnico Operacional', 'dept' => 'OPS', 'parent' => 'OPS-01'],
                    ['code' => 'TI-02', 'title' => 'Técnico de TI', 'dept' => 'TI', 'parent' => 'TI-01'],
                ];

                foreach ($level3Positions as $pos) {
                    Position::query()->withoutGlobalScopes()->firstOrCreate(
                        ['tenant_id' => $tenant->id, 'code' => $pos['code']],
                        [
                            'tenant_id' => $tenant->id,
                            'title' => $pos['title'],
                            'department_id' => $deptIdsByCode->get($pos['dept']),
                            'parent_id' => $managersByCode[$pos['parent']]->id ?? $director->id,
                            'level' => 3,
                            'is_management' => false,
                        ],
                    );
                }
            }
        } finally {
            if ($previousTenant) {
                $manager->set($previousTenant);
            } else {
                $manager->clear();
            }
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
