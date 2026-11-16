<?php

namespace App\Services\Import;

use App\Models\Department;
use App\Models\LeaveType;
use App\Models\Position;
use App\Models\SalaryComponent;
use App\Models\Tenant;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Str;

class TenantResolutionService
{
    /**
     * Cache of resolved tenants by key (name/nif) to prevent repeated DB queries.
     *
     * @var array<string, Tenant>
     */
    protected array $tenantCache = [];

    /**
     * Resolve or provision a Tenant based on company name, client name and tax ID.
     */
    public function resolveTenant(
        ?string $companyName,
        ?string $clientName,
        ?string $taxId,
        ?string $companyType = null,
        ?string $address = null,
        ?string $inssPassword = null
    ): Tenant {
        $cleanCompany = trim($companyName ?? '');
        $cleanClient = trim($clientName ?? '');
        $cleanTaxId = preg_replace('/[^\dA-Za-z]/', '', (string) ($taxId ?? ''));

        // Determine effective tenant name
        if (! empty($cleanCompany)) {
            $effectiveName = $cleanCompany;
        } elseif (! empty($cleanClient)) {
            $effectiveName = "Cliente - {$cleanClient}";
        } else {
            $effectiveName = 'Empresa Pendente (A Classificar - RH)';
        }

        $cacheKey = ! empty($cleanTaxId) ? "nif_{$cleanTaxId}" : "name_".Str::slug($effectiveName);
        if (isset($this->tenantCache[$cacheKey])) {
            return $this->tenantCache[$cacheKey];
        }

        // 1. Try finding by Tax ID (NIF)
        $tenant = null;
        if (! empty($cleanTaxId) && strlen($cleanTaxId) >= 9) {
            $tenant = Tenant::withoutGlobalScopes()
                ->where('tax_id', $cleanTaxId)
                ->first();
        }

        // 2. Try finding by Name
        if (! $tenant) {
            $tenant = Tenant::withoutGlobalScopes()
                ->where('name', $effectiveName)
                ->first();
        }

        // 3. Try finding by Slug
        $baseSlug = Str::slug($effectiveName) ?: 'empresa-rh';
        if (! $tenant) {
            $tenant = Tenant::withoutGlobalScopes()
                ->where('slug', $baseSlug)
                ->first();
        }

        // 4. Create new Tenant if not found
        if (! $tenant) {
            $slug = $baseSlug;
            $counter = 1;
            while (Tenant::withoutGlobalScopes()->where('slug', $slug)->exists()) {
                $slug = "{$baseSlug}-{$counter}";
                $counter++;
            }

            $legalType = match (true) {
                str_contains(strtolower($companyType ?? ''), 'sa') => 'sa',
                str_contains(strtolower($companyType ?? ''), 'uni') => 'unipessoal',
                default => 'lda',
            };

            $config = [
                'client_name' => $cleanClient,
                'source' => 'legacy_excel_import',
            ];

            if (! empty($inssPassword)) {
                $config['inss_credentials'] = [
                    'encrypted_password' => Crypt::encryptString($inssPassword),
                    'stored_at' => now()->toIso8601String(),
                ];
            }

            $tenant = Tenant::withoutGlobalScopes()->create([
                'name' => $effectiveName,
                'slug' => $slug,
                'tax_id' => ! empty($cleanTaxId) ? $cleanTaxId : null,
                'legal_entity_type' => $legalType,
                'address' => $address ?: 'Luanda, Angola',
                'province' => 'Luanda',
                'country' => 'Angola',
                'currency' => 'AOA',
                'locale' => 'pt',
                'timezone' => 'Africa/Luanda',
                'status' => 'active',
                'config' => $config,
            ]);

            // Seed basic leave types for this tenant
            $this->seedDefaultLeaveTypes($tenant);
        }

        $this->tenantCache[$cacheKey] = $tenant;
        return $tenant;
    }

    /**
     * Resolve or create a Department within the Tenant.
     */
    public function resolveDepartment(Tenant $tenant, string $departmentName): Department
    {
        $clean = trim($departmentName) ?: 'Geral';

        return Department::withoutGlobalScopes()->firstOrCreate([
            'tenant_id' => $tenant->id,
            'name' => $clean,
        ], [
            'description' => "Departamento de {$clean}",
            'status' => 'active',
        ]);
    }

    /**
     * Resolve or create a Position within the Tenant and Department.
     */
    public function resolvePosition(Tenant $tenant, Department $department, string $positionTitle): Position
    {
        $clean = trim($positionTitle) ?: 'Colaborador';

        return Position::withoutGlobalScopes()->firstOrCreate([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'title' => $clean,
        ], [
            'description' => "Função de {$clean}",
        ]);
    }

    /**
     * Ensure standard salary components exist for a tenant.
     *
     * @return array<string, SalaryComponent> Keyed by type
     */
    public function ensureSalaryComponents(Tenant $tenant): array
    {
        $components = [
            'meal_allowance' => [
                'code' => 'meal_allowance',
                'legacy_code' => 'SUB_ALIM',
                'name' => 'Subsídio de Refeição',
                'type' => 'benefit',
                'calculation_type' => 'fixed',
                'is_taxable' => false,
                'priority' => 20,
            ],
            'transport_allowance' => [
                'code' => 'transport_allowance',
                'legacy_code' => 'SUB_TRANSP',
                'name' => 'Subsídio de Transporte',
                'type' => 'benefit',
                'calculation_type' => 'fixed',
                'is_taxable' => false,
                'priority' => 21,
            ],
            'overtime' => [
                'code' => 'overtime',
                'legacy_code' => 'HORAS_EXTRA',
                'name' => 'Horas Extraordinárias',
                'type' => 'earning',
                'calculation_type' => 'formula',
                'is_taxable' => true,
                'priority' => 30,
            ],
            'other_allowance' => [
                'code' => 'additional_allowance',
                'legacy_code' => 'OUTROS_ADIC',
                'name' => 'Abono Adicional',
                'type' => 'earning',
                'calculation_type' => 'fixed',
                'is_taxable' => true,
                'priority' => 25,
            ],
        ];

        $result = [];
        foreach ($components as $key => $data) {
            $existing = SalaryComponent::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->whereIn('code', [$data['code'], $data['legacy_code']])
                ->first();

            $result[$key] = $existing ?? SalaryComponent::withoutGlobalScopes()->create([
                'tenant_id' => $tenant->id,
                'code' => $data['code'],
                'name' => $data['name'],
                'type' => $data['type'],
                'calculation_type' => $data['calculation_type'],
                'is_taxable' => $data['is_taxable'],
                'priority' => $data['priority'],
                'is_active' => true,
            ]);
        }

        return $result;
    }

    protected function seedDefaultLeaveTypes(Tenant $tenant): void
    {
        $types = [
            ['name' => 'Férias Anuais', 'code' => 'vacation', 'category' => 'vacation', 'days_per_year' => 22, 'is_paid' => true],
            ['name' => 'Doença', 'code' => 'sick', 'category' => 'sick', 'days_per_year' => 30, 'is_paid' => true],
            ['name' => 'Casamento', 'code' => 'marriage', 'category' => 'family', 'days_per_year' => 3, 'is_paid' => true],
            ['name' => 'Falecimento', 'code' => 'bereavement', 'category' => 'family', 'days_per_year' => 5, 'is_paid' => true],
            ['name' => 'Licença sem Vencimento', 'code' => 'unpaid', 'category' => 'unpaid', 'days_per_year' => 30, 'is_paid' => false],
            ['name' => 'Maternidade', 'code' => 'maternity', 'category' => 'maternity', 'days_per_year' => 90, 'is_paid' => true],
        ];

        foreach ($types as $type) {
            LeaveType::withoutGlobalScopes()->firstOrCreate([
                'tenant_id' => $tenant->id,
                'code' => $type['code'],
            ], [
                'name' => $type['name'],
                'category' => $type['category'],
                'days_per_year' => $type['days_per_year'],
                'is_paid' => $type['is_paid'],
                'requires_document' => false,
            ]);
        }
    }
}
