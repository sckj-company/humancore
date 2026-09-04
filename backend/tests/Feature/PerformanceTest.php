<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\PerformanceEvaluation;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PerformanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_user_without_view_performance_cannot_list(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, null);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/performance')
            ->assertForbidden();
    }

    public function test_hr_manager_can_create_evaluation(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();
        $user = $this->makeUser($tenant, 'hr-manager');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/performance', [
                'employee_id' => $employee->id,
                'period' => '2026-H1',
                'cycle' => 'semi_annual',
                'score' => 4.2,
                'criteria' => ['productivity' => 4, 'quality' => 5],
                'strengths' => 'Boa produtividade',
                'improvements' => 'Comunicação',
                'status' => 'submitted',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'submitted')
            ->assertJsonPath('data.status_label', 'Submetida')
            ->assertJsonPath('data.score', 4.2);

        $this->assertDatabaseHas('performance_evaluations', [
            'employee_id' => $employee->id,
            'period' => '2026-H1',
            'status' => 'submitted',
        ]);
    }

    public function test_evaluation_can_be_approved(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();
        $user = $this->makeUser($tenant, 'hr-manager');
        $eval = PerformanceEvaluation::factory()->submitted()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/performance/{$eval->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.status_variant', 'success');

        $this->assertNotNull($eval->fresh()->approved_at);
    }

    public function test_draft_cannot_be_approved(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();
        $user = $this->makeUser($tenant, 'hr-manager');
        $eval = PerformanceEvaluation::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'status' => 'draft',
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/performance/{$eval->id}/approve")
            ->assertStatus(422);
    }

    public function test_evaluation_can_be_rejected(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();
        $user = $this->makeUser($tenant, 'hr-manager');
        $eval = PerformanceEvaluation::factory()->submitted()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/performance/{$eval->id}/reject")
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.status_variant', 'destructive');
    }

    public function test_score_validation_rejects_out_of_range(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();
        $user = $this->makeUser($tenant, 'hr-manager');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/performance', [
                'employee_id' => $employee->id,
                'period' => '2026-H1',
                'score' => 10,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['score']);
    }

    public function test_employee_role_cannot_create_evaluation(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();
        $user = $this->makeUser($tenant, 'employee');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/performance', [
                'employee_id' => $employee->id,
                'period' => '2026-H1',
            ])
            ->assertForbidden();
    }

    private function setupTenantWithEmployee(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);

        return [$tenant, $employee];
    }

    private function makeUser(Tenant $tenant, ?string $role): User
    {
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        if ($role) {
            $user->assignRole($role);
        }

        return $user;
    }
}
