<?php

namespace Tests\Feature;

use App\Models\Benefit;
use App\Models\Deduction;
use App\Models\Employee;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CompensationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_user_without_permission_cannot_list_benefits(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'employee');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/benefits')
            ->assertForbidden();
    }

    public function test_hr_manager_can_create_and_list_benefits(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/benefits', [
                'employee_id' => $employee->id,
                'name' => 'Seguro de Saúde',
                'benefit_type' => 'health_insurance',
                'amount_type' => 'fixed',
                'amount' => 45000,
                'is_taxable' => false,
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Seguro de Saúde')
            ->assertJsonPath('data.type_label', 'Seguro de Saúde')
            ->assertJsonPath('data.status', 'active');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/benefits')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1);
    }

    public function test_percentage_benefit_requires_percentage(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/benefits', [
                'employee_id' => $employee->id,
                'name' => 'Prémio',
                'benefit_type' => 'other',
                'amount_type' => 'percentage',
            ])
            ->assertStatus(422);
    }

    public function test_hr_manager_can_create_deduction_with_installments(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/deductions', [
                'employee_id' => $employee->id,
                'name' => 'Empréstimo Pessoal',
                'deduction_type' => 'loan',
                'amount_type' => 'fixed',
                'amount' => 15000,
                'total_amount' => 180000,
                'installment_count' => 12,
                'is_mandatory' => false,
                'legal_basis' => 'Autorização do trabalhador',
            ])
            ->assertCreated()
            ->assertJsonPath('data.type_label', 'Empréstimo')
            ->assertJsonPath('data.installment_amount', 15000)
            ->assertJsonPath('data.is_mandatory', false)
            ->assertJsonPath('data.legal_basis', 'Autorização do trabalhador');

        $this->assertDatabaseHas('deductions', [
            'employee_id' => $employee->id,
            'installment_amount' => 15000,
        ]);
    }

    public function test_hr_manager_can_create_a_custom_deduction_type(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/deductions', [
                'employee_id' => $employee->id,
                'name' => 'Equipamento de trabalho',
                'deduction_type' => 'work_equipment',
                'amount_type' => 'fixed',
                'amount' => 12500,
                'is_mandatory' => true,
                'legal_basis' => 'Cláusula contratual 8',
            ])
            ->assertCreated()
            ->assertJsonPath('data.deduction_type', 'work_equipment')
            ->assertJsonPath('data.type_label', 'work_equipment')
            ->assertJsonPath('data.is_mandatory', true);
    }

    public function test_fixed_deduction_derives_total_from_installment_count(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/deductions', [
                'employee_id' => $employee->id,
                'name' => 'Adiantamento parcelado',
                'deduction_type' => 'advance',
                'amount_type' => 'fixed',
                'amount' => 10000,
                'installment_count' => 3,
            ])
            ->assertCreated()
            ->assertJsonPath('data.total_amount', 30000)
            ->assertJsonPath('data.installment_amount', 10000);
    }

    public function test_deduction_approve_records_approver(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id]);
        $deduction = Deduction::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'status' => 'active',
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/deductions/{$deduction->id}/approve")
            ->assertOk();

        $this->assertNotNull($deduction->fresh()->approved_at);
    }

    public function test_tenant_isolation_on_deductions(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        app(TenantManager::class)->set($tenantA);
        $user = $this->makeUser($tenantA, 'hr-manager');
        $employeeB = Employee::factory()->create(['tenant_id' => $tenantB->id]);
        $deductionB = Deduction::factory()->create([
            'tenant_id' => $tenantB->id,
            'employee_id' => $employeeB->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/v1/deductions/{$deductionB->id}")
            ->assertStatus(404);

        $this->actingAs($user, 'sanctum')
            ->putJson("/api/v1/deductions/{$deductionB->id}", ['name' => 'Hack'])
            ->assertStatus(404);
    }

    public function test_benefit_can_be_soft_deleted(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');
        $benefit = Benefit::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/benefits/{$benefit->id}")
            ->assertOk();

        $this->assertSoftDeleted('benefits', ['id' => $benefit->id]);
    }

    private function makeUser(Tenant $tenant, string $role): User
    {
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole($role);

        return $user;
    }
}
