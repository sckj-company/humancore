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
                'phone' => '+244923000001',
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

    public function test_super_admin_can_assign_and_update_tenant_user_permissions(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        $tenant = Tenant::factory()->create();

        $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/tenant-permissions')
            ->assertOk()
            ->assertJsonStructure(['data' => ['permissions', 'role_permissions']]);

        $created = $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/v1/superadmin/tenants/{$tenant->id}/users", [
                'name' => 'Gestor Empresa',
                'email' => 'gestor@empresa.test',
                'password' => 'password123',
                'role' => 'manager',
                'permissions' => ['view_any_employee', 'create_employee'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.roles.0', 'manager');

        $userId = $created->json('data.id');
        $this->assertTrue(in_array('create_employee', $created->json('data.direct_permissions'), true));

        $this->actingAs($superAdmin, 'sanctum')
            ->putJson("/api/v1/superadmin/tenants/{$tenant->id}/users/{$userId}", [
                'role' => 'hr-manager',
                'is_active' => false,
                'permissions' => ['view_any_payroll'],
            ])
            ->assertOk()
            ->assertJsonPath('data.roles.0', 'hr-manager')
            ->assertJsonPath('data.is_active', false)
            ->assertJsonPath('data.direct_permissions.0', 'view_any_payroll');

        $this->actingAs($superAdmin, 'sanctum')
            ->putJson("/api/v1/superadmin/tenants/{$tenant->id}/users/{$userId}", [
                'permissions' => ['manage_platform'],
            ])
            ->assertForbidden();
    }

    public function test_super_admin_can_create_and_update_platform_user_with_multiple_shared_tenant_accesses(): void
    {
        $creator = User::factory()->create(['is_active' => true]);
        $creator->assignRole('super-admin');

        $tenantA = Tenant::factory()->create(['name' => 'Empresa Alpha']);
        $tenantB = Tenant::factory()->create(['name' => 'Empresa Beta']);

        $deptA1 = \App\Models\Department::create([
            'tenant_id' => $tenantA->id,
            'name' => 'Operações Alpha',
            'code' => 'OPA',
            'status' => 'active',
        ]);
        $deptB1 = \App\Models\Department::create([
            'tenant_id' => $tenantB->id,
            'name' => 'Financeiro Beta',
            'code' => 'FINB',
            'status' => 'active',
        ]);

        $group = \App\Models\PermissionGroup::create([
            'tenant_id' => null,
            'name' => 'RH Partilhado',
            'permissions' => ['view_any_employee', 'view_employee', 'view_any_payroll'],
            'created_by' => $creator->id,
        ]);

        $sharedPermissions = ['view_any_employee', 'view_employee', 'view_any_payroll'];

        $created = $this->actingAs($creator, 'sanctum')
            ->postJson('/api/v1/superadmin/platform-users', [
                'name' => 'Coordenador Multi-Empresa',
                'email' => 'multi-empresa@platform.test',
                'password' => 'secure-password',
                'permissions' => ['view_any_tenant', ...$sharedPermissions],
                'tenant_accesses' => [
                    [
                        'tenant_id' => $tenantA->id,
                        'permission_group_id' => $group->id,
                        'role_name' => 'hr-manager',
                        'permissions' => $sharedPermissions,
                        'department_ids' => [$deptA1->id],
                    ],
                    [
                        'tenant_id' => $tenantB->id,
                        'permission_group_id' => $group->id,
                        'role_name' => 'hr-manager',
                        'permissions' => $sharedPermissions,
                        'department_ids' => [$deptB1->id],
                    ],
                ],
            ])
            ->assertCreated()
            ->assertJsonCount(2, 'data.tenant_accesses');

        $createdUserId = $created->json('data.id');

        $this->assertDatabaseHas('user_tenant_accesses', [
            'user_id' => $createdUserId,
            'tenant_id' => $tenantA->id,
            'permission_group_id' => $group->id,
            'role_name' => 'hr-manager',
        ]);
        $this->assertDatabaseHas('user_tenant_accesses', [
            'user_id' => $createdUserId,
            'tenant_id' => $tenantB->id,
            'permission_group_id' => $group->id,
            'role_name' => 'hr-manager',
        ]);

        $updatedPermissions = ['view_any_employee', 'view_employee'];

        $this->actingAs($creator, 'sanctum')
            ->putJson("/api/v1/superadmin/platform-users/{$createdUserId}", [
                'permissions' => ['view_any_tenant', ...$updatedPermissions],
                'tenant_accesses' => [
                    [
                        'tenant_id' => $tenantA->id,
                        'permission_group_id' => null,
                        'role_name' => 'manager',
                        'permissions' => $updatedPermissions,
                        'department_ids' => [$deptA1->id],
                    ],
                    [
                        'tenant_id' => $tenantB->id,
                        'permission_group_id' => null,
                        'role_name' => 'manager',
                        'permissions' => $updatedPermissions,
                        'department_ids' => [],
                    ],
                ],
            ])
            ->assertOk()
            ->assertJsonCount(2, 'data.tenant_accesses')
            ->assertJsonPath('data.tenant_accesses.0.role_name', 'manager')
            ->assertJsonPath('data.tenant_accesses.1.role_name', 'manager');

        $accessB = \App\Models\UserTenantAccess::query()
            ->where('user_id', $createdUserId)
            ->where('tenant_id', $tenantB->id)
            ->firstOrFail();

        $this->assertNull($accessB->department_ids);
        $this->assertSame($updatedPermissions, $accessB->permissions);
    }
}
