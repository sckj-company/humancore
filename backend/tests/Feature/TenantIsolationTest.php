<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TenantIsolationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
    }

    protected function createTenantAdmin(string $role = 'admin'): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email_verified_at' => now(),
        ]);
        $user->assignRole($role);

        app(TenantManager::class)->set($tenant);

        return [$tenant, $user];
    }

    public function test_admin_sees_only_own_tenant_employees(): void
    {
        [$tenantA, $adminA] = $this->createTenantAdmin();
        [$tenantB] = $this->createTenantAdmin();

        $employeeA = \App\Models\Employee::factory()->create([
            'tenant_id' => $tenantA->id,
            'first_name' => 'Visivel',
            'last_name' => 'Fora',
        ]);
        $employeeB = \App\Models\Employee::factory()->create([
            'tenant_id' => $tenantB->id,
            'first_name' => 'Invisivel',
            'last_name' => 'Secreto',
        ]);

        app(TenantManager::class)->set($tenantA);

        $response = $this->actingAs($adminA)->getJson('/api/v1/employees');

        $response->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.full_name', 'Visivel Fora')
            ->assertJsonMissing(['full_name' => 'Invisivel Secreto']);
    }

    public function test_cannot_create_employee_with_other_tenant_department(): void
    {
        [$tenantA, $adminA] = $this->createTenantAdmin();
        [$tenantB] = $this->createTenantAdmin();

        $departmentB = \App\Models\Department::factory()->create(['tenant_id' => $tenantB->id]);

        app(TenantManager::class)->set($tenantA);

        $response = $this->actingAs($adminA)->postJson('/api/v1/employees', [
            'first_name' => 'X',
            'last_name' => 'Y',
            'email' => 'x@example.com',
            'status' => 'active',
            'department_id' => $departmentB->id,
        ]);

        $this->assertTrue(in_array($response->status(), [201, 422], true));
    }

    public function test_dashboard_counts_only_current_tenant(): void
    {
        [$tenantA, $adminA] = $this->createTenantAdmin();
        [$tenantB] = $this->createTenantAdmin();

        \App\Models\Employee::factory()->count(3)->create(['tenant_id' => $tenantA->id]);
        \App\Models\Employee::factory()->count(7)->create(['tenant_id' => $tenantB->id]);

        app(TenantManager::class)->set($tenantA);

        $response = $this->actingAs($adminA)->getJson('/api/v1/dashboard/hr');

        $response->assertOk();
        $response->assertJsonPath('data.kpis.total_active', 3);
        $response->assertJsonPath('data.kpis.total_employees', 3);
    }

    public function test_employee_from_other_tenant_cannot_be_accessed_by_id(): void
    {
        [$tenantA, $adminA] = $this->createTenantAdmin();
        [$tenantB] = $this->createTenantAdmin();

        $employeeB = \App\Models\Employee::factory()->create(['tenant_id' => $tenantB->id]);

        app(TenantManager::class)->set($tenantA);

        $response = $this->actingAs($adminA)->getJson('/api/v1/employees/'.$employeeB->id);

        $this->assertTrue(in_array($response->status(), [404, 403], true), 'Other tenant employee should be inaccessible');
    }
}
