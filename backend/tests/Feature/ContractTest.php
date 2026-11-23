<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PermissionGroup;
use App\Models\Position;
use App\Models\Tenant;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Services\CloudinaryService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
    }

    public function test_admin_can_renew_and_edit_contract_without_losing_history(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'inactive',
            'termination_at' => now()->toDateString(),
        ]);
        $oldContract = EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'is_active' => false,
            'end_date' => now()->subDay()->toDateString(),
        ]);
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $admin->assignRole('admin');

        $this->mock(CloudinaryService::class)
            ->shouldReceive('upload')
            ->once()
            ->andReturn([
                'url' => 'https://res.cloudinary.com/test/raw/upload/contract.pdf',
                'bytes' => 1200,
            ]);
        $this->actingAs($admin, 'sanctum');
        $created = $this->post("/api/v1/employees/{$employee->id}/contracts", [
            'contract_type' => 'fixed_term',
            'base_salary' => 250000,
            'salary_frequency' => 'monthly',
            'work_hours_per_week' => 40,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'signed_at' => now()->toDateString(),
            'notes' => 'Contrato renovado',
            'document' => UploadedFile::fake()->create('contract.pdf', 2, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.contract_type', 'fixed_term');

        $this->assertDatabaseHas('employee_documents', [
            'employee_id' => $employee->id,
            'document_type' => 'contract',
            'file_path' => 'https://res.cloudinary.com/test/raw/upload/contract.pdf',
        ]);

        $newContractId = $created->json('data.id');
        $this->assertDatabaseHas('employee_contracts', [
            'id' => $oldContract->id,
            'is_active' => false,
        ]);
        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'status' => 'active',
            'termination_at' => null,
        ]);

        $this->putJson("/api/v1/contracts/{$newContractId}", [
            'contract_type' => 'fixed_term',
            'base_salary' => 275000,
            'salary_frequency' => 'monthly',
            'work_hours_per_week' => 36,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'signed_at' => now()->toDateString(),
            'notes' => 'Dados atualizados',
        ])
            ->assertOk()
            ->assertJsonPath('data.base_salary', 275000)
            ->assertJsonPath('data.notes', 'Dados atualizados');

        $this->assertSame(2, EmployeeContract::where('employee_id', $employee->id)->count());
    }

    public function test_editing_expired_inactive_contract_with_valid_end_date_reactivates_and_syncs_employee(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $oldDept = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Operações',
            'code' => 'OPS',
            'status' => 'active',
        ]);
        $newDept = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Tecnologia',
            'code' => 'TEC',
            'status' => 'active',
        ]);
        $oldPos = Position::create([
            'tenant_id' => $tenant->id,
            'department_id' => $oldDept->id,
            'title' => 'Assistente',
            'is_management' => false,
        ]);
        $newPos = Position::create([
            'tenant_id' => $tenant->id,
            'department_id' => $newDept->id,
            'title' => 'Engenheiro',
            'is_management' => false,
        ]);

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $oldDept->id,
            'position_id' => $oldPos->id,
            'status' => 'active',
        ]);

        $contract = EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'department_id' => $oldDept->id,
            'position_id' => $oldPos->id,
            'base_salary' => 180000,
            'is_active' => false,
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => now()->subDay()->toDateString(),
        ]);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $admin->assignRole('admin');

        $this->actingAs($admin, 'sanctum');

        $this->putJson("/api/v1/contracts/{$contract->id}", [
            'contract_type' => 'permanent',
            'position_id' => $newPos->id,
            'department_id' => $newDept->id,
            'base_salary' => 240000,
            'salary_frequency' => 'monthly',
            'start_date' => now()->subMonths(6)->toDateString(),
            'end_date' => null,
            'notes' => 'Renovado por edição',
        ])
            ->assertOk()
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.base_salary', 240000)
            ->assertJsonPath('data.position_id', $newPos->id)
            ->assertJsonPath('data.department_id', $newDept->id);

        $this->assertDatabaseHas('employee_contracts', [
            'id' => $contract->id,
            'is_active' => true,
            'position_id' => $newPos->id,
            'department_id' => $newDept->id,
        ]);

        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'position_id' => $newPos->id,
            'department_id' => $newDept->id,
        ]);
    }

    public function test_editing_contract_without_salary_field_permission_succeeds_when_salary_omitted_and_blocks_salary_change(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);
        $contract = EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 300000,
            'is_active' => true,
            'start_date' => now()->subMonths(2)->toDateString(),
        ]);

        $group = PermissionGroup::create([
            'name' => 'Edição Contrato Sem Salário',
            'permissions' => [
                'view_any_employee',
                'view_employee',
                'view_any_contract',
                'view_contract',
                'update_contract',
                'field.contract.dates_notes.view',
                'field.contract.dates_notes.edit',
            ],
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole('hr-manager');

        UserTenantAccess::create([
            'user_id' => $user->id,
            'tenant_id' => $tenant->id,
            'permission_group_id' => $group->id,
            'role_name' => 'hr-manager',
            'permissions' => [],
            'is_active' => true,
        ]);

        $this->actingAs($user, 'sanctum');

        $newEndDate = now()->addMonths(6)->toDateString();
        $this->putJson("/api/v1/contracts/{$contract->id}", [
            'contract_type' => $contract->contract_type,
            'end_date' => $newEndDate,
            'notes' => 'Observação atualizada',
        ])
            ->assertOk()
            ->assertJsonPath('data.notes', 'Observação atualizada');

        $this->assertEquals(300000, (float) $contract->fresh()->base_salary);
        $this->assertSame($newEndDate, $contract->fresh()->end_date?->toDateString());

        $this->putJson("/api/v1/contracts/{$contract->id}", [
            'base_salary' => 999999,
        ])->assertForbidden();
    }
}
