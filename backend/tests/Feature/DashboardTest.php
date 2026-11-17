<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function createTenantAdmin(): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email_verified_at' => now(),
        ]);
        $user->assignRole('admin');

        app(TenantManager::class)->set($tenant);

        return [$tenant, $user];
    }

    public function test_hr_dashboard_returns_nearest_birthdays_in_current_and_next_month(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 12, 15, 9, 0, 0));

        [$tenant, $admin] = $this->createTenantAdmin();

        // Already passed in December -> should be excluded
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'first_name' => 'Passado',
            'last_name' => 'Dezembro',
            'status' => 'active',
            'birth_date' => '1990-12-10',
        ]);

        // Today (Dec 15) -> days_until = 0, current month
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'first_name' => 'Hoje',
            'last_name' => 'Aniversario',
            'status' => 'active',
            'birth_date' => '1992-12-15',
        ]);

        // Later this month (Dec 25) -> days_until = 10, current month
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'first_name' => 'Natal',
            'last_name' => 'FimMes',
            'status' => 'active',
            'birth_date' => '1988-12-25',
        ]);

        // Next month (Jan 05) -> days_until = 21, next month (year rollover)
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'first_name' => 'Janeiro',
            'last_name' => 'Proximo',
            'status' => 'active',
            'birth_date' => '1995-01-05',
        ]);

        // Two months ahead (Feb 10) -> should be excluded
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'first_name' => 'Fevereiro',
            'last_name' => 'Distante',
            'status' => 'active',
            'birth_date' => '1991-02-10',
        ]);

        // Inactive in December -> should be excluded
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'first_name' => 'Inativo',
            'last_name' => 'Dezembro',
            'status' => 'inactive',
            'birth_date' => '1990-12-20',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/v1/dashboard/hr');

        $response->assertOk();
        $birthdays = $response->json('data.birthdays');

        $this->assertCount(3, $birthdays);
        $this->assertSame('Hoje Aniversario', $birthdays[0]['full_name']);
        $this->assertSame(0, $birthdays[0]['days_until']);
        $this->assertTrue($birthdays[0]['is_current_month']);
        $this->assertSame('2026-12-15', $birthdays[0]['upcoming_date']);

        $this->assertSame('Natal FimMes', $birthdays[1]['full_name']);
        $this->assertSame(10, $birthdays[1]['days_until']);
        $this->assertTrue($birthdays[1]['is_current_month']);

        $this->assertSame('Janeiro Proximo', $birthdays[2]['full_name']);
        $this->assertSame(21, $birthdays[2]['days_until']);
        $this->assertFalse($birthdays[2]['is_current_month']);
        $this->assertSame('2027-01-05', $birthdays[2]['upcoming_date']);
    }

    public function test_hr_dashboard_returns_internship_and_probation_employees(): void
    {
        Carbon::setTestNow(Carbon::create(2026, 11, 17, 9, 0, 0));

        [$tenant, $admin] = $this->createTenantAdmin();
        $department = Department::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Engenharia']);

        // 1. Employee in internship via active contract
        $intern = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'first_name' => 'Ana',
            'last_name' => 'Estagiaria',
            'status' => 'active',
            'probation_end' => null,
        ]);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $intern->id,
            'contract_type' => 'internship',
            'is_active' => true,
            'start_date' => '2026-10-01',
            'end_date' => '2026-12-31',
        ]);

        // 2. Employee in probation via probation_end date
        $probationByDate = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'first_name' => 'Bruno',
            'last_name' => 'Experimental',
            'status' => 'active',
            'probation_end' => '2026-12-01',
        ]);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $probationByDate->id,
            'contract_type' => 'fixed_term',
            'is_active' => true,
            'start_date' => '2026-09-01',
            'end_date' => '2027-09-01',
        ]);

        // 3. Employee in probation via contract_type
        $probationByContract = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'first_name' => 'Carla',
            'last_name' => 'Experiencia',
            'status' => 'active',
            'probation_end' => null,
        ]);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $probationByContract->id,
            'contract_type' => 'probation',
            'is_active' => true,
            'start_date' => '2026-11-01',
            'end_date' => '2027-01-15',
        ]);

        // 4. Permanent employee with expired probation -> excluded
        $permanent = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'first_name' => 'Daniel',
            'last_name' => 'Efetivo',
            'status' => 'active',
            'probation_end' => '2025-01-01',
        ]);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $permanent->id,
            'contract_type' => 'permanent',
            'is_active' => true,
            'start_date' => '2024-10-01',
            'end_date' => null,
        ]);

        $response = $this->actingAs($admin)->getJson('/api/v1/dashboard/hr');

        $response->assertOk();
        $list = $response->json('data.probation_internship');

        $this->assertCount(3, $list);
        $names = array_column($list, 'full_name');
        $this->assertContains('Ana Estagiaria', $names);
        $this->assertContains('Bruno Experimental', $names);
        $this->assertContains('Carla Experiencia', $names);
        $this->assertNotContains('Daniel Efetivo', $names);

        // Expiring contracts include employee_id and integer days_remaining
        $expiring = $response->json('data.expiring_contracts');
        $this->assertNotEmpty($expiring);
        $this->assertSame($intern->id, $expiring[0]['employee_id']);
        $this->assertIsInt($expiring[0]['days_remaining']);

        // Department includes id
        $byDept = $response->json('data.by_department');
        $this->assertSame($department->id, $byDept[0]['id']);
    }
}
