<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeUpdateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
    }

    public function test_admin_can_update_employee_details(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id]);
        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        $this->putJson("/api/v1/employees/{$employee->id}", [
            'first_name' => 'Ana',
            'last_name' => 'Mendes',
            'phone' => '+244 923 000 111',
            'status' => 'active',
            'overtime_hourly_rate' => 1250,
        ])->assertOk()
            ->assertJsonPath('data.first_name', 'Ana')
            ->assertJsonPath('data.last_name', 'Mendes')
            ->assertJsonPath('data.overtime_hourly_rate', 1250);

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'first_name' => 'Ana',
            'last_name' => 'Mendes',
            'phone' => '+244 923 000 111',
            'overtime_hourly_rate' => 1250,
        ]);
    }

    public function test_employee_without_update_permission_cannot_change_employee_details(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id]);
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'employee_id' => $employee->id]);
        $user->assignRole('employee');
        $this->actingAs($user, 'sanctum');

        $this->putJson("/api/v1/employees/{$employee->id}", ['first_name' => 'Alterado'])
            ->assertForbidden();

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'first_name' => $employee->first_name,
        ]);
    }
}
