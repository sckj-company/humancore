<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\PermissionGroup;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FieldAndScopePermissionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_field_permissions_redact_salary_columns_on_payroll_employees_contracts_and_dashboard(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $department = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Operações',
            'code' => 'OPS',
            'status' => 'active',
        ]);

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'status' => 'active',
        ]);

        $contract = EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 350000,
            'is_active' => true,
            'start_date' => '2026-01-01',
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        PayrollRecord::create([
            'tenant_id' => $tenant->id,
            'payroll_period_id' => $period->id,
            'employee_id' => $employee->id,
            'base_salary' => 350000,
            'gross_salary' => 375000,
            'total_earnings' => 25000,
            'inss_base' => 11250,
            'employer_inss' => 30000,
            'total_taxes' => 25000,
            'total_deductions' => 36250,
            'net_salary' => 338750,
            'employer_cost' => 405000,
            'work_days' => 22,
            'absent_days' => 0,
            'overtime_hours' => 2,
            'status' => 'calculated',
        ]);

        // Perfil apenas vê assiduidade na folha e nome do funcionário, sem colunas salariais
        $group = PermissionGroup::create([
            'name' => 'Analista de Assiduidade',
            'description' => 'Sem visibilidade salarial',
            'permissions' => [
                'view_any_employee',
                'view_employee',
                'view_any_contract',
                'view_contract',
                'update_contract',
                'view_any_payroll',
                'view_payroll',
                'view_report',
                'field.payroll.attendance_metrics.view',
                'field.payroll.gross_salary.view',
            ],
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);
        $user->assignRole('hr-manager');

        UserTenantAccess::create([
            'user_id' => $user->id,
            'tenant_id' => $tenant->id,
            'permission_group_id' => $group->id,
            'role_name' => 'hr-manager',
            'permissions' => [],
            'department_ids' => null,
            'is_active' => true,
        ]);

        $this->actingAs($user, 'sanctum');

        // Employees list hides salary fields
        $employeesResponse = $this->getJson('/api/v1/employees')->assertOk();
        $this->assertNotEmpty($employeesResponse->json('data.data'));
        $this->assertNull($employeesResponse->json('data.data.0.active_contract.base_salary'));

        // Contracts list hides base_salary
        $contractsResponse = $this->getJson('/api/v1/contracts')->assertOk();
        $this->assertNotEmpty($contractsResponse->json('data.data'));
        $this->assertNull($contractsResponse->json('data.data.0.base_salary'));

        // Payroll records allow gross_salary and attendance metrics, redact base_salary and net_salary
        $payrollRecordsResponse = $this->getJson("/api/v1/payroll/periods/{$period->id}/records")->assertOk();
        $row = $payrollRecordsResponse->json('data.0');
        $this->assertEquals(375000, (float) $row['gross_salary']);
        $this->assertEquals(22, $row['work_days']);
        $this->assertNull($row['base_salary']);
        $this->assertNull($row['net_salary']);
        $this->assertNull($row['inss_base']);
        $this->assertNull($row['total_taxes']);

        // Payroll period totals redact salary cost KPIs
        $periodResponse = $this->getJson("/api/v1/payroll/periods/{$period->id}")->assertOk();
        $this->assertNull($periodResponse->json('data.total_net'));

        // Dashboard redacts salary KPIs without field.report.salary_costs.view
        $dashboardResponse = $this->getJson('/api/v1/dashboard/hr')->assertOk();
        $this->assertNull($dashboardResponse->json('data.kpis.total_payroll'));
        $this->assertNull($dashboardResponse->json('data.kpis.avg_salary'));

        // Trying to edit contract base_salary without field.contract.base_salary.edit fails with 403
        $this->putJson("/api/v1/contracts/{$contract->id}", [
            'contract_type' => $contract->contract_type,
            'salary_frequency' => $contract->salary_frequency ?? 'monthly',
            'start_date' => '2026-01-01',
            'base_salary' => 500000,
        ])->assertForbidden();
    }

    public function test_company_and_department_scope_enforces_isolation_and_per_tenant_permissions(): void
    {
        $tenantA = Tenant::factory()->create(['name' => 'Empresa A']);
        $tenantB = Tenant::factory()->create(['name' => 'Empresa B']);

        app(TenantManager::class)->set($tenantA);
        $deptHR = Department::create([
            'tenant_id' => $tenantA->id,
            'name' => 'Recursos Humanos',
            'code' => 'HR',
            'status' => 'active',
        ]);
        $deptIT = Department::create([
            'tenant_id' => $tenantA->id,
            'name' => 'Tecnologia',
            'code' => 'IT',
            'status' => 'active',
        ]);

        $empHR = Employee::factory()->create([
            'tenant_id' => $tenantA->id,
            'department_id' => $deptHR->id,
            'first_name' => 'Ana',
            'last_name' => 'RH',
        ]);
        $empIT = Employee::factory()->create([
            'tenant_id' => $tenantA->id,
            'department_id' => $deptIT->id,
            'first_name' => 'Bruno',
            'last_name' => 'TI',
        ]);

        app(TenantManager::class)->set($tenantB);
        $deptFinB = Department::create([
            'tenant_id' => $tenantB->id,
            'name' => 'Finanças B',
            'code' => 'FINB',
            'status' => 'active',
        ]);
        $empFinB = Employee::factory()->create([
            'tenant_id' => $tenantB->id,
            'department_id' => $deptFinB->id,
            'first_name' => 'Carlos',
            'last_name' => 'EmpresaB',
        ]);

        $groupDeptOnly = PermissionGroup::create([
            'name' => 'Gestor Setorial',
            'permissions' => ['view_any_employee', 'view_employee', 'field.employee.salary.view'],
            'is_active' => true,
        ]);

        $groupPayrollB = PermissionGroup::create([
            'name' => 'Consulta Folha B',
            'permissions' => ['view_any_employee', 'view_employee', 'view_any_payroll', 'field.payroll.net_salary.view'],
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenantA->id,
            'is_active' => true,
        ]);
        $user->assignRole('admin');

        // Na Empresa A: só acede ao departamento HR
        UserTenantAccess::create([
            'user_id' => $user->id,
            'tenant_id' => $tenantA->id,
            'permission_group_id' => $groupDeptOnly->id,
            'role_name' => 'manager',
            'permissions' => [],
            'department_ids' => [$deptHR->id],
            'is_active' => true,
        ]);

        // Na Empresa B: outro grupo de permissões e sem limite de departamento
        UserTenantAccess::create([
            'user_id' => $user->id,
            'tenant_id' => $tenantB->id,
            'permission_group_id' => $groupPayrollB->id,
            'role_name' => 'hr-manager',
            'permissions' => [],
            'department_ids' => null,
            'is_active' => true,
        ]);

        app(TenantManager::class)->set($tenantA);
        $this->actingAs($user, 'sanctum');

        // Listagem na Empresa A retorna apenas funcionário de HR
        $listA = $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/employees')
            ->assertOk();
        $idsA = collect($listA->json('data.data'))->pluck('id')->all();
        $this->assertEquals([$empHR->id], $idsA);

        // Consultar funcionário de TI dentro da Empresa A devolve 403
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson("/api/v1/employees/{$empIT->id}")
            ->assertForbidden();

        // Sem permissão de folha na Empresa A -> 403
        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/payroll/periods')
            ->assertForbidden();

        // Trocar para Empresa B via header X-Tenant-ID muda o contexto e as permissões
        $listB = $this->withHeader('X-Tenant-ID', (string) $tenantB->id)
            ->getJson('/api/v1/employees')
            ->assertOk();
        $idsB = collect($listB->json('data.data'))->pluck('id')->all();
        $this->assertEquals([$empFinB->id], $idsB);

        $this->withHeader('X-Tenant-ID', (string) $tenantB->id)
            ->getJson('/api/v1/payroll/periods')
            ->assertOk();

        // Empresa não atribuída ao utilizador devolve 403
        $tenantC = Tenant::factory()->create(['name' => 'Empresa C']);
        $this->withHeader('X-Tenant-ID', (string) $tenantC->id)
            ->getJson('/api/v1/employees')
            ->assertForbidden();
    }

    public function test_super_admin_can_crud_permission_groups_and_list_tenant_departments(): void
    {
        $tenant = Tenant::factory()->create();
        $department = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Financeiro',
            'code' => 'FIN',
            'status' => 'active',
        ]);

        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        $this->actingAs($superAdmin, 'sanctum');

        $createRes = $this->postJson('/api/v1/superadmin/permission-groups', [
            'name' => 'Equipa Financeira',
            'description' => 'Acesso apenas ao salário líquido e criação de contratos',
            'permissions' => ['view_any_payroll', 'field.payroll.net_salary.view'],
            'is_active' => true,
        ])->assertCreated();

        $groupId = $createRes->json('data.id');
        $this->assertNotNull($groupId);

        $this->getJson('/api/v1/superadmin/permission-groups')
            ->assertOk()
            ->assertJsonFragment(['name' => 'Equipa Financeira']);

        $this->putJson("/api/v1/superadmin/permission-groups/{$groupId}", [
            'name' => 'Equipa Financeira Atualizada',
            'permissions' => ['view_any_payroll', 'field.payroll.net_salary.view', 'field.payroll.irt.view'],
            'is_active' => true,
        ])->assertOk()
            ->assertJsonPath('data.name', 'Equipa Financeira Atualizada');

        $this->getJson("/api/v1/superadmin/tenants/{$tenant->id}/departments")
            ->assertOk()
            ->assertJsonFragment(['id' => $department->id, 'name' => 'Financeiro']);

        $this->deleteJson("/api/v1/superadmin/permission-groups/{$groupId}")
            ->assertOk();

        $this->assertDatabaseMissing('permission_groups', ['id' => $groupId]);
    }
}
