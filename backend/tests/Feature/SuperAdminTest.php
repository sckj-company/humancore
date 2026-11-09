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
use Spatie\Permission\Models\Role;
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

    public function test_super_admin_can_change_any_users_password_and_revoke_their_tokens(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');
        $tenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('old-password'),
        ]);
        $user->createToken('active-session');

        $this->actingAs($superAdmin, 'sanctum')
            ->putJson("/api/v1/superadmin/users/{$user->id}/password", [
                'password' => 'admin-set-password',
                'password_confirmation' => 'admin-set-password',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('admin-set-password', $user->fresh()->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
    }

    public function test_limited_platform_admin_cannot_change_another_users_password(): void
    {
        $limitedAdmin = User::factory()->create(['is_active' => true]);
        $limitedAdmin->assignRole('super-admin-limited');
        $user = User::factory()->create(['password' => Hash::make('old-password')]);

        $this->actingAs($limitedAdmin, 'sanctum')
            ->putJson("/api/v1/superadmin/users/{$user->id}/password", [
                'password' => 'admin-set-password',
                'password_confirmation' => 'admin-set-password',
            ])
            ->assertForbidden();

        $this->assertTrue(Hash::check('old-password', $user->fresh()->password));
    }

    public function test_existing_super_admin_can_load_platform_users_without_the_new_management_permission(): void
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('super-admin');

        Role::findByName('super-admin')->revokePermissionTo('manage_super_admins');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/superadmin/platform-users')
            ->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'users',
                    'permissions' => [['name', 'group_name']],
                ],
            ]);
    }

    public function test_restricted_platform_admin_without_management_permission_cannot_load_platform_users(): void
    {
        $user = User::factory()->create(['is_active' => true]);
        $user->assignRole('super-admin-limited');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/superadmin/platform-users')
            ->assertForbidden();
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

    public function test_super_admin_can_access_and_create_employees_in_selected_tenant(): void
    {
        $ownTenant = Tenant::factory()->create();
        $selectedTenant = Tenant::factory()->create();
        $user = User::factory()->create([
            'tenant_id' => $ownTenant->id,
            'is_active' => true,
        ]);
        $user->assignRole('super-admin');

        Employee::factory()->create([
            'tenant_id' => $selectedTenant->id,
            'first_name' => 'Funcionário',
            'last_name' => 'Selecionado',
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/employees', ['X-Tenant-ID' => (string) $selectedTenant->id])
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.full_name', 'Funcionário Selecionado');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/employees', [
                'first_name' => 'Novo',
                'last_name' => 'Funcionário',
                'email' => 'novo@empresa.test',
                'status' => 'active',
            ], ['X-Tenant-ID' => (string) $selectedTenant->id])
            ->assertCreated()
            ->assertJsonPath('data.tenant_id', $selectedTenant->id);
    }

    public function test_super_admin_can_create_a_restricted_platform_admin_with_only_selected_permissions(): void
    {
        $creator = User::factory()->create(['is_active' => true]);
        $creator->assignRole('super-admin');
        $tenant = Tenant::factory()->create();
        Role::query()->where('name', 'super-admin-limited')->where('guard_name', 'web')->delete();

        $created = $this->actingAs($creator, 'sanctum')
            ->postJson('/api/v1/superadmin/platform-users', [
                'name' => 'Admin RH',
                'email' => 'admin-rh@platform.test',
                'password' => 'secure-password',
                'permissions' => ['view_any_tenant', 'view_any_employee'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.roles.0', 'super-admin-limited');
        $this->assertEqualsCanonicalizing(
            ['view_any_tenant', 'view_any_employee'],
            $created->json('data.permissions'),
        );

        $restrictedAdmin = User::query()->where('email', 'admin-rh@platform.test')->firstOrFail();

        $this->actingAs($restrictedAdmin, 'sanctum')
            ->getJson('/api/v1/employees', ['X-Tenant-ID' => (string) $tenant->id])
            ->assertOk();

        $this->actingAs($restrictedAdmin, 'sanctum')
            ->putJson("/api/v1/superadmin/tenants/{$tenant->id}", ['status' => 'suspended'])
            ->assertForbidden();

        $this->assertSame(
            ['view_any_employee', 'view_any_tenant'],
            $restrictedAdmin->getAllPermissions()->pluck('name')->sort()->values()->all(),
        );
    }

    public function test_super_admin_can_add_and_remove_permissions_from_a_restricted_platform_admin(): void
    {
        $creator = User::factory()->create(['is_active' => true]);
        $creator->assignRole('super-admin');
        $limitedAdmin = User::factory()->create(['tenant_id' => null, 'is_active' => true]);
        $limitedAdmin->assignRole('super-admin-limited');
        $limitedAdmin->syncPermissions(['view_any_tenant', 'view_any_employee']);

        $response = $this->actingAs($creator, 'sanctum')
            ->putJson("/api/v1/superadmin/platform-users/{$limitedAdmin->id}", [
                'permissions' => ['view_any_tenant', 'view_any_department'],
            ])
            ->assertOk();
        $this->assertEqualsCanonicalizing(
            ['view_any_tenant', 'view_any_department'],
            $response->json('data.permissions'),
        );

        $this->assertEqualsCanonicalizing(
            ['view_any_tenant', 'view_any_department'],
            $limitedAdmin->fresh()->getAllPermissions()->pluck('name')->all(),
        );
    }

    public function test_super_admin_can_delete_a_restricted_platform_admin_but_not_a_full_super_admin(): void
    {
        $creator = User::factory()->create(['is_active' => true]);
        $creator->assignRole('super-admin');
        $limitedAdmin = User::factory()->create(['tenant_id' => null, 'is_active' => true]);
        $limitedAdmin->assignRole('super-admin-limited');

        $this->actingAs($creator, 'sanctum')
            ->deleteJson("/api/v1/superadmin/platform-users/{$limitedAdmin->id}")
            ->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $limitedAdmin->id]);

        $this->deleteJson("/api/v1/superadmin/platform-users/{$creator->id}")
            ->assertForbidden();
        $this->assertDatabaseHas('users', ['id' => $creator->id]);
    }

    public function test_limited_platform_admin_cannot_grant_permissions_they_do_not_have(): void
    {
        $creator = User::factory()->create(['tenant_id' => null, 'is_active' => true]);
        $creator->assignRole('super-admin-limited');
        $creator->givePermissionTo(['manage_super_admins', 'view_any_tenant']);
        $target = User::factory()->create(['tenant_id' => null, 'is_active' => true]);
        $target->assignRole('super-admin-limited');
        $target->givePermissionTo('view_any_tenant');

        $this->actingAs($creator, 'sanctum')
            ->putJson("/api/v1/superadmin/platform-users/{$target->id}", [
                'permissions' => ['view_any_tenant', 'create_employee'],
            ])
            ->assertForbidden();
    }

    public function test_restricted_platform_admin_cannot_assign_permissions_the_creator_does_not_have(): void
    {
        $creator = User::factory()->create(['is_active' => true]);
        $creator->assignRole('super-admin-limited');
        $creator->givePermissionTo(['manage_super_admins', 'view_any_tenant']);

        $this->actingAs($creator, 'sanctum')
            ->postJson('/api/v1/superadmin/platform-users', [
                'name' => 'Admin Elevado',
                'email' => 'elevado@platform.test',
                'password' => 'secure-password',
                'permissions' => ['view_any_tenant', 'create_employee'],
            ])
            ->assertForbidden();
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
