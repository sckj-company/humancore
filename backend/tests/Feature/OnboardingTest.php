<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\OnboardingTask;
use App\Models\OnboardingTemplate;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class OnboardingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_user_without_training_permissions_cannot_list_templates(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'employee');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/onboarding/templates')
            ->assertForbidden();
    }

    public function test_hr_manager_can_create_template_with_tasks(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/onboarding/templates', [
                'name' => 'Onboarding TI',
                'description' => 'Para novos devs',
                'is_active' => true,
                'tasks' => [
                    ['title' => 'Setup workstation', 'due_days' => 1, 'sort_order' => 0],
                    ['title' => 'Acesso ao Git', 'due_days' => 1, 'sort_order' => 1],
                    ['title' => 'Reunião equipa', 'due_days' => 3, 'sort_order' => 2],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Onboarding TI')
            ->assertJsonPath('data.tasks_count', 3)
            ->assertJsonCount(3, 'data.tasks');
    }

    public function test_assigning_template_clones_tasks_to_employee(): void
    {
        [$tenant, $employee] = $this->setupWithEmployee();
        $user = $this->makeUser($tenant, 'hr-manager');
        $template = OnboardingTemplate::factory()->create(['tenant_id' => $tenant->id]);
        OnboardingTask::factory()->count(3)->create([
            'tenant_id' => $tenant->id,
            'template_id' => $template->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/onboarding/templates/{$template->id}/assign", [
                'employee_id' => $employee->id,
            ])
            ->assertOk()
            ->assertJsonPath('data.assigned', 3);

        $this->assertSame(3, OnboardingTask::query()
            ->where('employee_id', $employee->id)
            ->where('template_id', $template->id)
            ->count());
    }

    public function test_completing_task_marks_done(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $task = OnboardingTask::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'pending',
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/onboarding/tasks/{$task->id}/complete")
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.status_variant', 'success');

        $this->assertNotNull($task->fresh()->completed_at);
    }

    public function test_template_can_be_soft_deleted(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');
        $template = OnboardingTemplate::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/onboarding/templates/{$template->id}")
            ->assertOk();

        $this->assertSoftDeleted('onboarding_templates', ['id' => $template->id]);
    }

    public function test_assignee_can_complete_their_task(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $assignee = $this->makeUser($tenant, null);
        $task = OnboardingTask::factory()->create([
            'tenant_id' => $tenant->id,
            'assignee_id' => $assignee->id,
            'status' => 'pending',
        ]);

        $this->actingAs($assignee, 'sanctum')
            ->postJson("/api/v1/onboarding/tasks/{$task->id}/complete")
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');
    }

    public function test_task_creation_validates_required_title(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/onboarding/tasks', ['title' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['title']);
    }

    private function setupWithEmployee(): array
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
