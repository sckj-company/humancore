<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SuperAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_non_super_admin_cannot_access_dashboard(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $user->assignRole('employee');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/superadmin/dashboard')
            ->assertForbidden();
    }

    public function test_super_admin_can_view_platform_dashboard(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $user->assignRole('super-admin');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/superadmin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.kpis.total_tenants', 1)
            ->assertJsonStructure([
                'data' => [
                    'kpis' => ['total_tenants', 'active_tenants', 'suspended_tenants', 'total_employees', 'total_users'],
                    'tenant_trend',
                    'segments' => ['small', 'medium', 'large'],
                ],
            ]);
    }

    public function test_super_admin_can_list_tenants_with_stats(): void
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('super-admin');

        $tenant = Tenant::factory()->create(['name' => 'Empresa Alpha']);
        Employee::factory()->count(3)->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/superadmin/tenants')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.data.0.name', 'Empresa Alpha')
            ->assertJsonPath('data.data.0.stats.employees', 3);
    }

    public function test_super_admin_can_create_update_and_delete_tenant(): void
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('super-admin');

        $created = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/superadmin/tenants', [
                'name' => 'Nova Empresa',
                'slug' => 'nova-empresa',
                'email' => 'contacto@nova.ao',
                'status' => 'active',
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Nova Empresa')
            ->assertJsonPath('data.currency', 'AOA');

        $tenantId = $created->json('data.id');

        $this->actingAs($user, 'sanctum')
            ->putJson("/api/v1/superadmin/tenants/{$tenantId}", ['status' => 'suspended'])
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/superadmin/tenants/{$tenantId}")
            ->assertOk();
    }

    public function test_cannot_delete_tenant_with_employees(): void
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('super-admin');

        $tenant = Tenant::factory()->create();
        Employee::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/superadmin/tenants/{$tenant->id}")
            ->assertStatus(422);
    }
}
