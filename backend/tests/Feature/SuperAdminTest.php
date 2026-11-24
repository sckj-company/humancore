<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserTenantAccess;
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

    public function test_super_admin_limited_with_all_permissions_and_linked_tenants_works_without_subscription_and_preserves_role(): void
    {
        config(['saas.require_subscription' => true]);

        $creator = User::factory()->create(['is_active' => true]);
        $creator->assignRole('super-admin');

        $tenantA = Tenant::factory()->create(['name' => 'Empresa Ligada A']);
        $tenantB = Tenant::factory()->create(['name' => 'Empresa Não Ligada B']);

        app(TenantManager::class)->set($tenantA);
        $employeeA = Employee::factory()->create([
            'tenant_id' => $tenantA->id,
            'status' => 'active',
        ]);
        $contractA = EmployeeContract::factory()->create([
            'tenant_id' => $tenantA->id,
            'employee_id' => $employeeA->id,
            'base_salary' => 350000,
            'is_active' => true,
            'start_date' => now()->subMonths(3)->toDateString(),
        ]);

        app(TenantManager::class)->set($tenantB);
        Employee::factory()->create([
            'tenant_id' => $tenantB->id,
            'status' => 'active',
        ]);

        $platformPermsResponse = $this->actingAs($creator, 'sanctum')
            ->getJson('/api/v1/superadmin/platform-users')
            ->assertOk();

        $allAssignablePerms = collect($platformPermsResponse->json('data.permissions'))
            ->pluck('name')
            ->all();

        $this->assertContains('field.employee.salary.view', $allAssignablePerms);
        $this->assertContains('field.payroll.base_salary.edit', $allAssignablePerms);
        $this->assertNotContains('manage_platform', $allAssignablePerms);

        $created = $this->actingAs($creator, 'sanctum')
            ->postJson('/api/v1/superadmin/platform-users', [
                'name' => 'Super Admin Limitado Completo',
                'email' => 'limited-full@platform.test',
                'password' => 'secure-password',
                'permissions' => $allAssignablePerms,
                'tenant_accesses' => [
                    [
                        'tenant_id' => $tenantA->id,
                        'permission_group_id' => null,
                        'role_name' => 'hr-manager',
                        'permissions' => null,
                        'department_ids' => [],
                    ],
                ],
            ])
            ->assertCreated();

        $limitedUserId = $created->json('data.id');
        $limitedAdmin = User::query()->findOrFail($limitedUserId);

        $accessA = UserTenantAccess::query()
            ->where('user_id', $limitedUserId)
            ->where('tenant_id', $tenantA->id)
            ->firstOrFail();
        $this->assertNull($accessA->permissions);

        // auth/me deve preservar super-admin-limited em roles mesmo com role_name na empresa vinculada
        $meResponse = $this->actingAs($limitedAdmin, 'sanctum')
            ->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/auth/me')
            ->assertOk();

        $this->assertContains('super-admin-limited', $meResponse->json('data.roles'));
        $this->assertContains('hr-manager', $meResponse->json('data.roles'));
        $this->assertContains('field.employee.salary.view', $meResponse->json('data.permissions'));
        $this->assertContains('field.payroll.base_salary.edit', $meResponse->json('data.permissions'));

        // Listagem de empresas para super-admin-limited vinculado só mostra a empresa ligada
        $this->actingAs($limitedAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/tenants')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.data.0.id', $tenantA->id);

        // Operações na empresa vinculada funcionam mesmo sem subscrição ativa e sem permissões ausentes
        $employeesRes = $this->actingAs($limitedAdmin, 'sanctum')
            ->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/employees')
            ->assertOk();
        $this->assertEquals(350000, (float) $employeesRes->json('data.data.0.active_contract.base_salary'));

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/shifts')
            ->assertOk();

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/employee-schedules')
            ->assertOk();

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->postJson('/api/v1/holidays', [
                'name' => 'Dia da Independência',
                'date' => '2026-11-11',
                'is_recurring' => true,
            ])
            ->assertCreated();

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->postJson('/api/v1/leave/types', [
                'name' => 'Férias Especiais',
                'code' => 'FER-ESP',
                'category' => 'vacation',
                'is_paid' => true,
            ])
            ->assertCreated();

        $this->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->putJson("/api/v1/contracts/{$contractA->id}", [
                'contract_type' => $contractA->contract_type,
                'base_salary' => 450000,
                'salary_frequency' => 'monthly',
                'start_date' => $contractA->start_date->toDateString(),
                'notes' => 'Atualizado por super-admin limitado',
            ])
            ->assertOk()
            ->assertJsonPath('data.base_salary', 450000);

        // Empresa não vinculada devolve 403
        $this->withHeader('X-Tenant-ID', (string) $tenantB->id)
            ->getJson('/api/v1/employees')
            ->assertForbidden();

        // Compatibilidade com registos antigos onde permissions = [] sem permission_group_id
        $accessA->update(['permissions' => []]);
        $freshLimited = $limitedAdmin->fresh();
        $employeesLegacyRes = $this->actingAs($freshLimited, 'sanctum')
            ->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/employees')
            ->assertOk();
        $this->assertEquals(450000, (float) $employeesLegacyRes->json('data.data.0.active_contract.base_salary'));
    }

    public function test_super_admin_tenant_list_and_dashboard_return_real_counts_across_tenants(): void
    {
        $tenantA = Tenant::factory()->create(['name' => 'Empresa A']);
        $tenantB = Tenant::factory()->create(['name' => 'Empresa B']);

        $superAdmin = User::factory()->create([
            'tenant_id' => $tenantA->id,
            'is_active' => true,
        ]);
        $superAdmin->assignRole('super-admin');

        User::factory()->create(['tenant_id' => $tenantA->id, 'is_active' => true]);
        User::factory()->count(2)->create(['tenant_id' => $tenantB->id, 'is_active' => true]);

        Department::factory()->count(1)->create(['tenant_id' => $tenantA->id]);
        Department::factory()->count(3)->create(['tenant_id' => $tenantB->id]);
        $deletedDeptB = Department::factory()->create(['tenant_id' => $tenantB->id]);
        $deletedDeptB->delete();

        Employee::factory()->count(2)->create(['tenant_id' => $tenantA->id, 'status' => 'active']);
        $deletedEmpA = Employee::factory()->create(['tenant_id' => $tenantA->id, 'status' => 'active']);
        $deletedEmpA->delete();

        Employee::factory()->count(4)->create(['tenant_id' => $tenantB->id, 'status' => 'active']);
        $deletedEmpB = Employee::factory()->create(['tenant_id' => $tenantB->id, 'status' => 'active']);
        $deletedEmpB->delete();

        $listResponse = $this->actingAs($superAdmin, 'sanctum')
            ->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/superadmin/tenants?per_page=50')
            ->assertOk();

        $rows = collect($listResponse->json('data.data'))->keyBy('id');
        $this->assertSame(2, $rows[$tenantA->id]['stats']['employees']);
        $this->assertSame(1, $rows[$tenantA->id]['stats']['departments']);
        $this->assertSame(2, $rows[$tenantA->id]['stats']['users']);

        $this->assertSame(4, $rows[$tenantB->id]['stats']['employees']);
        $this->assertSame(3, $rows[$tenantB->id]['stats']['departments']);
        $this->assertSame(2, $rows[$tenantB->id]['stats']['users']);

        $dashboardResponse = $this->actingAs($superAdmin, 'sanctum')
            ->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->getJson('/api/v1/superadmin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.kpis.total_employees', 6)
            ->assertJsonPath('data.kpis.active_employees', 6)
            ->assertJsonPath('data.kpis.total_users', 4);

        $byTenant = collect($dashboardResponse->json('data.by_tenant'))->keyBy('id');
        $this->assertSame(2, $byTenant[$tenantA->id]['employees']);
        $this->assertSame(4, $byTenant[$tenantB->id]['employees']);

        // Remoção de empresa B deve detectar funcionários mesmo com currentTenant = tenantA
        $this->actingAs($superAdmin, 'sanctum')
            ->withHeader('X-Tenant-ID', (string) $tenantA->id)
            ->deleteJson("/api/v1/superadmin/tenants/{$tenantB->id}")
            ->assertStatus(422);
    }

    public function test_super_admin_update_tenant_persists_all_editable_fields(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        $tenant = Tenant::factory()->create(['name' => 'Empresa Original']);

        $payload = [
            'name' => 'Empresa Atualizada Lda',
            'slug' => 'empresa-atualizada-lda',
            'email' => 'contacto@atualizada.co.ao',
            'billing_email' => 'faturacao@atualizada.co.ao',
            'phone' => '+244923000111',
            'website' => 'https://atualizada.co.ao',
            'tax_id' => '5417123456',
            'inss_number' => 'INSS-998877',
            'legal_entity_type' => 'lda',
            'economic_sector' => 'Tecnologia e Telecomunicações',
            'address' => 'Rua Comandante Gika, 120',
            'city' => 'Luanda',
            'province' => 'Luanda',
            'country' => 'Angola',
            'postal_code' => '1000-001',
            'currency' => 'AOA',
            'locale' => 'pt',
            'timezone' => 'Africa/Luanda',
            'status' => 'active',
        ];

        $this->actingAs($superAdmin, 'sanctum')
            ->putJson("/api/v1/superadmin/tenants/{$tenant->id}", $payload)
            ->assertOk()
            ->assertJsonPath('data.legal_entity_type', 'lda')
            ->assertJsonPath('data.inss_number', 'INSS-998877')
            ->assertJsonPath('data.economic_sector', 'Tecnologia e Telecomunicações')
            ->assertJsonPath('data.website', 'https://atualizada.co.ao')
            ->assertJsonPath('data.province', 'Luanda')
            ->assertJsonPath('data.postal_code', '1000-001');

        $this->assertDatabaseHas('tenants', [
            'id' => $tenant->id,
            'name' => 'Empresa Atualizada Lda',
            'billing_email' => 'faturacao@atualizada.co.ao',
            'inss_number' => 'INSS-998877',
            'legal_entity_type' => 'lda',
            'economic_sector' => 'Tecnologia e Telecomunicações',
            'website' => 'https://atualizada.co.ao',
            'address' => 'Rua Comandante Gika, 120',
            'city' => 'Luanda',
            'province' => 'Luanda',
            'country' => 'Angola',
            'postal_code' => '1000-001',
        ]);
    }

    public function test_created_tenant_user_persists_verified_updates_company_stats_and_can_authenticate(): void
    {
        $tenant = Tenant::factory()->create(['name' => 'Empresa Utilizadores']);
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        $createResponse = $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/v1/superadmin/tenants/{$tenant->id}/users", [
                'name' => 'Gestor RH Novo',
                'email' => 'gestor.novo@empresa.co.ao',
                'password' => 'Secret1234!',
                'role' => 'hr-manager',
                'permissions' => ['view_any_employee', 'view_employee'],
            ])
            ->assertCreated();

        $createdUserId = $createResponse->json('data.id');
        $createdUser = User::query()->findOrFail($createdUserId);

        $this->assertNotNull($createdUser->email_verified_at);
        $this->assertSame($tenant->id, $createdUser->tenant_id);
        $this->assertTrue($createdUser->hasRole('hr-manager'));
        $this->assertTrue($createdUser->hasDirectPermission('view_any_employee'));

        // Listagem de empresas passa a refletir stats.users = 1
        $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/tenants')
            ->assertOk()
            ->assertJsonPath('data.data.0.stats.users', 1);

        // Utilizador criado consegue autenticar e aceder à API
        auth()->shouldUse('web');
        auth()->forgetGuards();

        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'gestor.novo@empresa.co.ao',
            'password' => 'Secret1234!',
        ])->assertOk();

        $token = $loginResponse->json('data.access_token');
        $this->assertNotEmpty($token);

        $this->withToken($token)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', 'gestor.novo@empresa.co.ao');

        $this->withToken($token)
            ->getJson('/api/v1/employees')
            ->assertOk();
    }

    public function test_accessible_companies_endpoint_returns_all_active_tenants_with_nif_and_supports_db_search(): void
    {
        $atlantico = Tenant::factory()->create([
            'name' => 'Empresa Atlântico',
            'tax_id' => '5000111222',
            'status' => 'active',
        ]);
        $kwanza = Tenant::factory()->create([
            'name' => 'Banco Kwanza',
            'tax_id' => '5000999888',
            'status' => 'active',
        ]);
        Tenant::factory()->create([
            'name' => 'Empresa Suspensa',
            'tax_id' => '5000777666',
            'status' => 'suspended',
        ]);
        Tenant::factory()->create([
            'name' => 'Empresa Inativa',
            'tax_id' => '5000555444',
            'status' => 'inactive',
        ]);

        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        $allActive = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/companies/accessible')
            ->assertOk();

        $this->assertCount(2, $allActive->json('data'));
        $byId = collect($allActive->json('data'))->keyBy('id');
        $this->assertSame('5000111222', $byId[$atlantico->id]['tax_id']);
        $this->assertSame('5000999888', $byId[$kwanza->id]['tax_id']);

        $byNif = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/companies/accessible?search=5000999888')
            ->assertOk();
        $this->assertCount(1, $byNif->json('data'));
        $this->assertSame($kwanza->id, $byNif->json('data.0.id'));
        $this->assertSame('Banco Kwanza', $byNif->json('data.0.name'));
        $this->assertSame('5000999888', $byNif->json('data.0.tax_id'));

        $byName = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/companies/accessible?search=Atlântico')
            ->assertOk();
        $this->assertCount(1, $byName->json('data'));
        $this->assertSame($atlantico->id, $byName->json('data.0.id'));

        $regularUser = User::factory()->create([
            'tenant_id' => $atlantico->id,
            'is_active' => true,
        ]);
        $regularUser->assignRole('admin');

        $regularRes = $this->actingAs($regularUser, 'sanctum')
            ->getJson('/api/v1/companies/accessible')
            ->assertOk();
        $this->assertCount(1, $regularRes->json('data'));
        $this->assertSame($atlantico->id, $regularRes->json('data.0.id'));
        $this->assertSame('5000111222', $regularRes->json('data.0.tax_id'));
    }

    public function test_full_super_admin_can_create_another_full_super_admin_with_all_permissions(): void
    {
        $creator = User::factory()->create(['is_active' => true]);
        $creator->assignRole('super-admin');
        $tenant = Tenant::factory()->create();

        $created = $this->actingAs($creator, 'sanctum')
            ->postJson('/api/v1/superadmin/platform-users', [
                'name' => 'Segundo Super Admin',
                'email' => 'segundo-super@platform.test',
                'password' => 'secure-password',
                'role' => 'super-admin',
            ])
            ->assertCreated()
            ->assertJsonPath('data.roles.0', 'super-admin');

        $perms = $created->json('data.permissions');
        $this->assertContains('manage_platform', $perms);
        $this->assertContains('manage_super_admins', $perms);
        $this->assertContains('view_any_tenant', $perms);

        $clone = User::query()->where('email', 'segundo-super@platform.test')->firstOrFail();
        $this->assertTrue($clone->hasRole('super-admin'));
        $this->assertEqualsCanonicalizing(
            $creator->getAllPermissions()->pluck('name')->all(),
            $clone->getAllPermissions()->pluck('name')->all(),
        );

        $this->actingAs($clone, 'sanctum')
            ->getJson('/api/v1/superadmin/platform-users')
            ->assertOk();

        $this->actingAs($clone, 'sanctum')
            ->getJson('/api/v1/superadmin/executive-dashboard')
            ->assertOk();

        $this->actingAs($clone, 'sanctum')
            ->putJson("/api/v1/superadmin/tenants/{$tenant->id}", ['status' => 'active'])
            ->assertOk();

        $this->actingAs($clone, 'sanctum')
            ->postJson('/api/v1/superadmin/platform-users', [
                'name' => 'Terceiro Super Admin',
                'email' => 'terceiro-super@platform.test',
                'password' => 'secure-password',
                'role' => 'super-admin',
            ])
            ->assertCreated()
            ->assertJsonPath('data.roles.0', 'super-admin');
    }

    public function test_limited_super_admin_cannot_create_promote_edit_or_delete_a_full_super_admin(): void
    {
        $fullAdmin = User::factory()->create(['is_active' => true]);
        $fullAdmin->assignRole('super-admin');

        $limitedManager = User::factory()->create(['is_active' => true]);
        $limitedManager->assignRole('super-admin-limited');
        $limitedManager->givePermissionTo(['manage_super_admins', 'view_any_tenant']);

        $limitedTarget = User::factory()->create(['is_active' => true]);
        $limitedTarget->assignRole('super-admin-limited');
        $limitedTarget->givePermissionTo(['view_any_tenant']);

        // Cannot create a full super-admin
        $this->actingAs($limitedManager, 'sanctum')
            ->postJson('/api/v1/superadmin/platform-users', [
                'name' => 'Escalado',
                'email' => 'escalado@platform.test',
                'password' => 'secure-password',
                'role' => 'super-admin',
            ])
            ->assertForbidden();

        // Cannot promote a limited super-admin to full super-admin
        $this->actingAs($limitedManager, 'sanctum')
            ->putJson("/api/v1/superadmin/platform-users/{$limitedTarget->id}", [
                'role' => 'super-admin',
            ])
            ->assertForbidden();

        // Cannot edit an existing full super-admin
        $this->actingAs($limitedManager, 'sanctum')
            ->putJson("/api/v1/superadmin/platform-users/{$fullAdmin->id}", [
                'role' => 'super-admin-limited',
                'permissions' => ['view_any_tenant'],
            ])
            ->assertForbidden();

        // Cannot delete an existing full super-admin
        $this->actingAs($limitedManager, 'sanctum')
            ->deleteJson("/api/v1/superadmin/platform-users/{$fullAdmin->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('users', ['id' => $fullAdmin->id]);
    }

    public function test_full_super_admin_can_promote_demote_and_delete_another_full_super_admin(): void
    {
        $primary = User::factory()->create(['is_active' => true]);
        $primary->assignRole('super-admin');

        $tenant = Tenant::factory()->create();

        $other = User::factory()->create(['is_active' => true]);
        $other->assignRole('super-admin-limited');
        $other->givePermissionTo(['view_any_tenant']);
        UserTenantAccess::query()->create([
            'user_id' => $other->id,
            'tenant_id' => $tenant->id,
            'role_name' => 'admin',
            'is_active' => true,
        ]);

        // Promote limited -> full super-admin
        $this->actingAs($primary, 'sanctum')
            ->putJson("/api/v1/superadmin/platform-users/{$other->id}", [
                'role' => 'super-admin',
            ])
            ->assertOk()
            ->assertJsonPath('data.roles.0', 'super-admin');

        $other->refresh();
        $this->assertTrue($other->hasRole('super-admin'));
        $this->assertFalse($other->hasRole('super-admin-limited'));
        $this->assertCount(0, $other->tenantAccesses);

        // Downgrade full -> limited super-admin
        $this->actingAs($primary, 'sanctum')
            ->putJson("/api/v1/superadmin/platform-users/{$other->id}", [
                'role' => 'super-admin-limited',
                'permissions' => ['view_any_tenant', 'view_any_employee'],
            ])
            ->assertOk()
            ->assertJsonPath('data.roles.0', 'super-admin-limited');

        $other->refresh();
        $this->assertTrue($other->hasRole('super-admin-limited'));
        $this->assertFalse($other->hasRole('super-admin'));

        // Promote again and then delete another full super-admin (while self-delete remains forbidden)
        $this->actingAs($primary, 'sanctum')
            ->putJson("/api/v1/superadmin/platform-users/{$other->id}", [
                'role' => 'super-admin',
            ])
            ->assertOk();

        $this->actingAs($primary, 'sanctum')
            ->deleteJson("/api/v1/superadmin/platform-users/{$primary->id}")
            ->assertForbidden();

        $this->actingAs($primary, 'sanctum')
            ->deleteJson("/api/v1/superadmin/platform-users/{$other->id}")
            ->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $other->id]);
    }
}
