<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\PermissionGroup;
use App\Models\Position;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Services\SaaS\TenantProvisioningService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OrganizationHierarchyAndPermissionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    private function createTenantWithAdmin(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $admin->assignRole('admin');

        return [$tenant, $admin];
    }

    public function test_departments_and_positions_support_levels_ordering_and_cycle_prevention(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        // Criar departamentos em ordem inversa de nível
        $deptOpsRes = $this->postJson('/api/v1/departments', [
            'name' => 'Operações',
            'code' => 'OPS',
            'level' => 3,
            'status' => 'active',
        ])->assertCreated();
        $deptOpsId = $deptOpsRes->json('data.id');

        $deptDirRes = $this->postJson('/api/v1/departments', [
            'name' => 'Direção Geral',
            'code' => 'DIR',
            'level' => 1,
            'status' => 'active',
        ])->assertCreated();
        $deptDirId = $deptDirRes->json('data.id');

        $deptRhRes = $this->postJson('/api/v1/departments', [
            'name' => 'Recursos Humanos',
            'code' => 'RH',
            'parent_id' => $deptDirId,
            'level' => 2,
            'status' => 'active',
        ])->assertCreated();
        $deptRhId = $deptRhRes->json('data.id');

        // Ligar Operações abaixo de Recursos Humanos
        $this->putJson("/api/v1/departments/{$deptOpsId}", [
            'parent_id' => $deptRhId,
            'level' => 3,
        ])->assertOk()->assertJsonPath('data.parent_id', $deptRhId);

        // Prevenir ciclo: Direção Geral não pode ter Operações (neto) nem a si mesma como superior
        $this->putJson("/api/v1/departments/{$deptDirId}", [
            'parent_id' => $deptOpsId,
        ])->assertStatus(422);

        $this->putJson("/api/v1/departments/{$deptDirId}", [
            'parent_id' => $deptDirId,
        ])->assertStatus(422);

        // Verificar ordenação por nível ASC
        $listDepts = $this->getJson('/api/v1/departments')->assertOk();
        $this->assertSame([$deptDirId, $deptRhId, $deptOpsId], collect($listDepts->json('data'))->pluck('id')->all());

        // Criar cargos com níveis e parent_id
        $ceoRes = $this->postJson('/api/v1/positions', [
            'title' => 'Diretor Executivo',
            'level' => 1,
            'department_id' => $deptDirId,
            'is_management' => true,
        ])->assertCreated();
        $ceoId = $ceoRes->json('data.id');

        $mgrRes = $this->postJson('/api/v1/positions', [
            'title' => 'Gestor de Operações',
            'level' => 2,
            'parent_id' => $ceoId,
            'department_id' => $deptOpsId,
            'is_management' => true,
        ])->assertCreated();
        $mgrId = $mgrRes->json('data.id');

        $analystRes = $this->postJson('/api/v1/positions', [
            'title' => 'Analista',
            'level' => 3,
            'parent_id' => $mgrId,
            'department_id' => $deptOpsId,
        ])->assertCreated();
        $analystId = $analystRes->json('data.id');

        // Prevenir ciclo em cargos
        $this->putJson("/api/v1/positions/{$ceoId}", [
            'parent_id' => $analystId,
        ])->assertStatus(422);

        $listPos = $this->getJson('/api/v1/positions')->assertOk();
        $this->assertSame([$ceoId, $mgrId, $analystId], collect($listPos->json('data'))->pluck('id')->all());
    }

    public function test_permissions_catalog_excludes_platform_only_permissions(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin();

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/departments/permissions-catalog')
            ->assertOk()
            ->assertJsonPath('data.can_manage_permissions', true);

        $names = collect($res->json('data.permissions'))->pluck('name')->all();
        $this->assertContains('view_any_employee', $names);
        $this->assertNotContains('manage_platform', $names);
        $this->assertNotContains('manage_super_admins', $names);
        $this->assertNotContains('create_tenant', $names);
    }

    public function test_department_permissions_apply_to_employees_without_individual_override_and_do_not_lock_out_admin(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin();

        $dept = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Tecnologia',
            'code' => 'TI',
            'level' => 2,
            'status' => 'active',
        ]);

        $pos = Position::create([
            'tenant_id' => $tenant->id,
            'department_id' => $dept->id,
            'title' => 'Programador',
            'level' => 3,
        ]);

        // Funcionário normal vinculado ao departamento
        $emp = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $dept->id,
            'position_id' => $pos->id,
            'first_name' => 'Ana',
            'last_name' => 'Silva',
            'email' => 'ana.silva@example.com',
        ]);

        $empUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $emp->id,
            'email' => 'ana.silva@example.com',
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $empUser->assignRole('employee');
        $emp->update(['user_id' => $empUser->id]);

        // Admin também ligado ao mesmo departamento não deve perder permissões de admin
        $adminEmp = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $dept->id,
            'first_name' => 'Carlos',
            'last_name' => 'Chefe',
        ]);
        $admin->update(['employee_id' => $adminEmp->id]);

        // Funcionário com override individual
        $overrideEmp = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $dept->id,
            'first_name' => 'Bruno',
            'last_name' => 'Override',
        ]);
        $overrideUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $overrideEmp->id,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $overrideUser->assignRole('employee');
        UserTenantAccess::create([
            'user_id' => $overrideUser->id,
            'tenant_id' => $tenant->id,
            'role_name' => 'employee',
            'permissions' => ['view_any_leave', 'view_leave'],
            'is_active' => true,
        ]);

        // Antes: Ana (employee) não pode listar funcionários
        $this->actingAs($empUser, 'sanctum')
            ->getJson('/api/v1/employees')
            ->assertForbidden();

        // Admin configura permissões no departamento Tecnologia
        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/departments/{$dept->id}/permissions", [
                'permissions' => ['view_any_employee', 'view_employee', 'field.employee.organization.view'],
                'role_name' => 'manager',
            ])
            ->assertOk()
            ->assertJsonPath('data.department.effective_permissions_count', 3)
            ->assertJsonPath('data.affected_employees_count', 1);

        // Agora Ana herdou do departamento -> pode listar funcionários e /auth/me indica has_explicit_permissions = true
        $this->actingAs($empUser, 'sanctum')
            ->getJson('/api/v1/employees')
            ->assertOk();

        $meRes = $this->actingAs($empUser, 'sanctum')
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.has_explicit_permissions', true);
        $this->assertContains('view_any_employee', $meRes->json('data.permissions'));

        // Bruno manteve o override individual (não tem view_any_employee)
        $this->actingAs($overrideUser, 'sanctum')
            ->getJson('/api/v1/employees')
            ->assertForbidden();

        // Admin continua com acesso total ao sistema apesar de estar ligado ao departamento
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/settings')
            ->assertOk();

        // Consulta da lista de funcionários do departamento mostra origens corretas
        $deptEmpsRes = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/departments/{$dept->id}/employees")
            ->assertOk();
        $rows = collect($deptEmpsRes->json('data.employees'))->keyBy('id');
        $this->assertSame('department', $rows[$emp->id]['permission_source']);
        $this->assertSame('individual', $rows[$overrideEmp->id]['permission_source']);

        // Agora aplicar também aos overrides existentes
        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/departments/{$dept->id}/permissions", [
                'permissions' => ['view_any_employee', 'view_employee'],
                'apply_to_existing_overrides' => true,
            ])
            ->assertOk();

        $this->actingAs($overrideUser, 'sanctum')
            ->getJson('/api/v1/employees')
            ->assertOk();
    }

    public function test_assign_employee_permissions_supports_bulk_selection_scoping_clearing_and_account_creation(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin();

        $deptA = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Vendas',
            'level' => 2,
            'status' => 'active',
            'default_permissions' => ['view_any_leave', 'view_leave'],
        ]);

        $deptB = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Finanças',
            'level' => 2,
            'status' => 'active',
        ]);

        // Funcionário 1 com conta
        $emp1 = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $deptA->id,
            'first_name' => 'Joana',
            'last_name' => 'Costa',
            'email' => 'joana@example.com',
        ]);
        $user1 = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $emp1->id,
            'email' => 'joana@example.com',
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $user1->assignRole('employee');

        // Funcionário 2 sem conta, com email
        $emp2 = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $deptA->id,
            'first_name' => 'Pedro',
            'last_name' => 'Nunes',
            'email' => 'pedro.nunes@example.com',
        ]);

        // Funcionário 3 sem conta e sem email
        $emp3 = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $deptA->id,
            'first_name' => 'Maria',
            'last_name' => 'SemEmail',
            'email' => null,
        ]);

        // Funcionário noutro departamento (para validar restrição de escopo)
        $empDeptB = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $deptB->id,
            'first_name' => 'Outro',
            'last_name' => 'Depto',
        ]);

        // Utilizador sem permissão não pode atribuir permissões
        $this->actingAs($user1, 'sanctum')
            ->postJson("/api/v1/departments/{$deptA->id}/employees/permissions", [
                'employee_ids' => [$emp1->id],
                'permissions' => ['view_any_employee'],
            ])
            ->assertForbidden();

        // Admin não pode atribuir permissões globais de plataforma
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/departments/{$deptA->id}/employees/permissions", [
                'employee_ids' => [$emp1->id],
                'permissions' => ['manage_platform'],
            ])
            ->assertForbidden();

        // Admin atribui em lote com criação automática de contas e escopo no departamento
        $assignRes = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/departments/{$deptA->id}/employees/permissions", [
                'employee_ids' => [$emp1->id, $emp2->id, $emp3->id],
                'permissions' => ['view_any_employee', 'view_employee', 'field.employee.organization.view'],
                'role_name' => 'manager',
                'scope_to_department' => true,
                'auto_create_accounts' => true,
                'default_password' => 'SenhaForte123',
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_count', 2)
            ->assertJsonPath('data.created_accounts_count', 1);

        $this->assertCount(1, $assignRes->json('data.skipped'));
        $this->assertSame($emp3->id, $assignRes->json('data.skipped.0.employee_id'));

        // Pedro agora tem conta vinculada
        $emp2->refresh();
        $this->assertNotNull($emp2->user_id);

        // Joana só vê funcionários do departamento Vendas (não vê empDeptB)
        $empListRes = $this->actingAs($user1, 'sanctum')
            ->getJson('/api/v1/employees')
            ->assertOk();
        $visibleIds = collect($empListRes->json('data.data'))->pluck('id')->all();
        $this->assertContains($emp1->id, $visibleIds);
        $this->assertNotContains($empDeptB->id, $visibleIds);

        // Limpar permissão individual de Joana -> volta a herdar do departamento Vendas
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/departments/{$deptA->id}/employees/permissions", [
                'employee_ids' => [$emp1->id],
                'clear_individual' => true,
            ])
            ->assertOk();

        $this->actingAs($user1, 'sanctum')
            ->getJson('/api/v1/employees')
            ->assertForbidden();

        $this->actingAs($user1, 'sanctum')
            ->getJson('/api/v1/leave')
            ->assertOk();
    }

    public function test_new_tenants_seed_default_departments_and_positions_that_can_be_edited_and_deleted(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true, 'email_verified_at' => now()]);
        $superAdmin->assignRole('super-admin');

        $createRes = $this->actingAs($superAdmin, 'sanctum')
            ->postJson('/api/v1/superadmin/tenants', [
                'name' => 'Empresa Inicializada SA',
                'slug' => 'empresa-inicializada-sa',
                'email' => 'geral@inicializada.ao',
                'admin_name' => 'Admin Inicial',
                'admin_email' => 'admin@inicializada.ao',
                'admin_password' => 'Senha1234',
                'status' => 'active',
            ])
            ->assertCreated();

        $tenantId = $createRes->json('data.id');
        $tenant = Tenant::query()->findOrFail($tenantId);
        $tenantAdmin = User::query()->where('email', 'admin@inicializada.ao')->firstOrFail();

        app(TenantManager::class)->set($tenant);

        // Deve ter 7 departamentos base (1 nível 1 + 6 nível 2) e 13 cargos base (1 N1 + 6 N2 + 6 N3)
        $deptsRes = $this->actingAs($tenantAdmin, 'sanctum')
            ->getJson('/api/v1/departments')
            ->assertOk();
        $depts = collect($deptsRes->json('data'));
        $this->assertCount(7, $depts);

        $dgDept = $depts->firstWhere('code', 'DG');
        $rhDept = $depts->firstWhere('code', 'RH');
        $this->assertNotNull($dgDept);
        $this->assertSame(1, $dgDept['level']);
        $this->assertNotNull($rhDept);
        $this->assertSame(2, $rhDept['level']);
        $this->assertSame($dgDept['id'], $rhDept['parent_id']);

        $posRes = $this->actingAs($tenantAdmin, 'sanctum')
            ->getJson('/api/v1/positions')
            ->assertOk();
        $positions = collect($posRes->json('data'));
        $this->assertCount(13, $positions);

        $dgPos = $positions->firstWhere('code', 'DG-01');
        $rhMgrPos = $positions->firstWhere('code', 'RH-01');
        $rhTechPos = $positions->firstWhere('code', 'RH-02');
        $this->assertSame(1, $dgPos['level']);
        $this->assertSame(2, $rhMgrPos['level']);
        $this->assertSame($dgPos['id'], $rhMgrPos['parent_id']);
        $this->assertSame(3, $rhTechPos['level']);
        $this->assertSame($rhMgrPos['id'], $rhTechPos['parent_id']);

        // Editar departamento e cargo base livremente
        $this->actingAs($tenantAdmin, 'sanctum')
            ->putJson("/api/v1/departments/{$rhDept['id']}", [
                'name' => 'Pessoas & Cultura',
                'level' => 2,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Pessoas & Cultura');

        $this->actingAs($tenantAdmin, 'sanctum')
            ->putJson("/api/v1/positions/{$rhTechPos['id']}", [
                'title' => 'Especialista de Pessoas',
                'level' => 3,
            ])
            ->assertOk()
            ->assertJsonPath('data.title', 'Especialista de Pessoas');

        // Eliminar departamento pai (Direção Geral) deve reparentar filhos para null sem bloquear
        $this->actingAs($tenantAdmin, 'sanctum')
            ->deleteJson("/api/v1/departments/{$dgDept['id']}")
            ->assertOk();

        $this->assertDatabaseHas('departments', [
            'id' => $rhDept['id'],
            'parent_id' => null,
        ]);

        // Eliminar cargo intermediário (RH-01) deve reparentar RH-02 para DG-01
        $this->actingAs($tenantAdmin, 'sanctum')
            ->deleteJson("/api/v1/positions/{$rhMgrPos['id']}")
            ->assertOk();

        $this->assertDatabaseHas('positions', [
            'id' => $rhTechPos['id'],
            'parent_id' => $dgPos['id'],
        ]);

        // Garantir que também funciona via TenantProvisioningService diretamente (ex.: empresa gerida)
        $managed = app(TenantProvisioningService::class)->createTenant([
            'name' => 'Empresa Gerida Base',
            'slug' => 'empresa-gerida-base',
            'origin_type' => 'agency',
        ]);
        $this->assertSame(7, Department::withoutGlobalScopes()->where('tenant_id', $managed->id)->count());
        $this->assertSame(13, Position::withoutGlobalScopes()->where('tenant_id', $managed->id)->count());
    }

    public function test_can_add_and_remove_employees_within_a_department(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin();

        $deptA = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Comercial',
            'level' => 2,
            'status' => 'active',
        ]);
        $deptB = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Logística',
            'level' => 2,
            'status' => 'active',
        ]);

        $empUnassigned = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => null,
            'first_name' => 'Carla',
            'last_name' => 'Mendes',
        ]);
        $empOtherDept = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $deptB->id,
            'first_name' => 'Mateus',
            'last_name' => 'Dias',
        ]);

        $plainUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $plainUser->assignRole('employee');

        // Funcionário comum não pode adicionar membros ao departamento
        $this->actingAs($plainUser, 'sanctum')
            ->postJson("/api/v1/departments/{$deptA->id}/employees", [
                'employee_ids' => [$empUnassigned->id],
            ])
            ->assertForbidden();

        // Admin adiciona dois funcionários ao departamento Comercial
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/departments/{$deptA->id}/employees", [
                'employee_ids' => [$empUnassigned->id, $empOtherDept->id],
            ])
            ->assertOk()
            ->assertJsonPath('data.added_count', 2)
            ->assertJsonPath('data.department.employee_count', 2);

        $listRes = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/departments/{$deptA->id}/employees")
            ->assertOk()
            ->assertJsonPath('data.can_manage_employees', true);
        $ids = collect($listRes->json('data.employees'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$empUnassigned->id, $empOtherDept->id], $ids);

        // Funcionário que já estava noutro departamento mantém ambos os departamentos
        $otherEmpPayload = collect($listRes->json('data.employees'))->firstWhere('id', $empOtherDept->id);
        $this->assertEqualsCanonicalizing(
            [$deptB->id, $deptA->id],
            collect($otherEmpPayload['departments'] ?? [])->pluck('id')->all(),
        );

        // Remover do departamento Comercial mantém a pertença ao departamento original ($deptB)
        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/departments/{$deptA->id}/employees/{$empOtherDept->id}")
            ->assertOk()
            ->assertJsonPath('data.department.employee_count', 1);

        $this->assertDatabaseHas('employees', [
            'id' => $empOtherDept->id,
            'department_id' => $deptB->id,
        ]);

        // Remover o funcionário sem outro departamento limpa department_id para null
        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/departments/{$deptA->id}/employees/{$empUnassigned->id}")
            ->assertOk()
            ->assertJsonPath('data.department.employee_count', 0);

        $this->assertDatabaseHas('employees', [
            'id' => $empUnassigned->id,
            'department_id' => null,
        ]);
    }

    public function test_can_list_add_and_remove_employees_within_a_position(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin();

        $deptRh = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Recursos Humanos',
            'level' => 2,
            'status' => 'active',
        ]);
        $deptOps = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Operações',
            'level' => 2,
            'status' => 'active',
        ]);

        $pos = Position::create([
            'tenant_id' => $tenant->id,
            'department_id' => $deptRh->id,
            'title' => 'Especialista de RH',
            'level' => 2,
        ]);

        $emp1 = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $deptOps->id,
            'position_id' => null,
            'first_name' => 'Helena',
            'last_name' => 'Lopes',
        ]);
        $emp2 = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => null,
            'position_id' => null,
            'first_name' => 'Diogo',
            'last_name' => 'Ramos',
        ]);

        $plainUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $plainUser->assignRole('employee');

        $this->actingAs($plainUser, 'sanctum')
            ->postJson("/api/v1/positions/{$pos->id}/employees", [
                'employee_ids' => [$emp1->id],
            ])
            ->assertForbidden();

        // Adicionar sem sincronizar departamento
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/positions/{$pos->id}/employees", [
                'employee_ids' => [$emp1->id],
                'sync_department' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.added_count', 1)
            ->assertJsonPath('data.position.employee_count', 1);

        $emp1->refresh();
        $this->assertSame($pos->id, $emp1->position_id);
        $this->assertSame($deptOps->id, $emp1->department_id);

        // Adicionar com sync_department = true
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/positions/{$pos->id}/employees", [
                'employee_ids' => [$emp2->id],
                'sync_department' => true,
            ])
            ->assertOk()
            ->assertJsonPath('data.position.employee_count', 2);

        $emp2->refresh();
        $this->assertSame($pos->id, $emp2->position_id);
        $this->assertSame($deptRh->id, $emp2->department_id);

        // Listar funcionários do cargo
        $posEmpsRes = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/positions/{$pos->id}/employees")
            ->assertOk()
            ->assertJsonPath('data.can_manage_employees', true);
        $this->assertCount(2, $posEmpsRes->json('data.employees'));

        // Remover funcionário do cargo
        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/positions/{$pos->id}/employees/{$emp1->id}")
            ->assertOk()
            ->assertJsonPath('data.position.employee_count', 1);

        $this->assertDatabaseHas('employees', [
            'id' => $emp1->id,
            'position_id' => null,
        ]);
    }

    public function test_employee_can_belong_to_multiple_departments_and_combines_department_permissions(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin();

        $deptRh = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Recursos Humanos',
            'level' => 2,
            'status' => 'active',
        ]);
        $deptFin = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Financeiro',
            'level' => 2,
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/departments/{$deptRh->id}/permissions", [
                'permissions' => ['view_any_leave', 'view_leave', 'approve_leave'],
            ])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/departments/{$deptFin->id}/permissions", [
                'permissions' => ['view_any_payroll', 'view_payroll', 'field.employee.salary.view'],
            ])
            ->assertOk();

        $emp = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $deptRh->id,
            'first_name' => 'Beatriz',
            'last_name' => 'Almeida',
        ]);
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $emp->id,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $user->assignRole('employee');

        // Associar o mesmo funcionário também ao departamento Financeiro
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/departments/{$deptFin->id}/employees", [
                'employee_ids' => [$emp->id],
            ])
            ->assertOk()
            ->assertJsonPath('data.added_count', 1);

        // Detalhe do funcionário e listagem filtrada por qualquer um dos departamentos refletem ambos
        $showRes = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/employees/{$emp->id}")
            ->assertOk();
        $this->assertEqualsCanonicalizing([$deptRh->id, $deptFin->id], $showRes->json('data.department_ids'));
        $this->assertCount(2, $showRes->json('data.departments'));

        $filteredRes = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/employees?department_id={$deptFin->id}")
            ->assertOk();
        $filteredIds = collect($filteredRes->json('data.data'))->pluck('id')->all();
        $this->assertContains($emp->id, $filteredIds);

        // Permissões efetivas combinam as permissões de ambos os departamentos
        $meRes = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/auth/me')
            ->assertOk();
        $effectivePerms = $meRes->json('data.permissions');
        $this->assertContains('approve_leave', $effectivePerms);
        $this->assertContains('view_any_payroll', $effectivePerms);
        $this->assertContains('field.employee.salary.view', $effectivePerms);
    }

    public function test_assign_employee_permissions_can_capture_missing_email_and_create_account(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin();

        $dept = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Contabilidade',
            'level' => 2,
            'status' => 'active',
        ]);

        $empNoEmail = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $dept->id,
            'first_name' => 'Gabriel',
            'last_name' => 'Sousa',
            'email' => null,
            'user_id' => null,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/departments/{$dept->id}/employees/permissions", [
                'employee_ids' => [$empNoEmail->id],
                'permissions' => [
                    'view_any_employee',
                    'view_employee',
                    'field.employee.salary.view',
                    'field.employee.fiscal_ids.edit',
                ],
                'role_name' => 'manager',
                'auto_create_accounts' => true,
                'default_password' => 'SenhaSegura123',
                'employee_emails' => [
                    $empNoEmail->id => 'gabriel.sousa@empresa.test',
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.updated_count', 1)
            ->assertJsonPath('data.created_accounts_count', 1)
            ->assertJsonPath('data.skipped', []);

        $empNoEmail->refresh();
        $this->assertNotNull($empNoEmail->user_id);
        $this->assertSame('gabriel.sousa@empresa.test', $empNoEmail->email);

        $createdUser = User::findOrFail($empNoEmail->user_id);
        $this->assertSame('gabriel.sousa@empresa.test', $createdUser->email);

        $meRes = $this->actingAs($createdUser, 'sanctum')
            ->getJson('/api/v1/auth/me')
            ->assertOk();
        $this->assertContains('field.employee.salary.view', $meRes->json('data.permissions'));
        $this->assertContains('field.employee.fiscal_ids.edit', $meRes->json('data.permissions'));
    }
}
