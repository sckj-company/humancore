<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Tenant;
use App\Models\Training;
use App\Models\TrainingAssignment;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class TrainingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_user_without_view_training_cannot_list(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, null);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/trainings')
            ->assertForbidden();
    }

    public function test_hr_manager_can_create_training(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/trainings', [
                'title' => 'Liderança Ágil',
                'description' => 'Workshop prático',
                'category' => 'leadership',
                'duration_hours' => 16,
                'provider' => 'Academia X',
                'location' => 'Sala A',
                'cost' => 150000,
                'max_participants' => 20,
                'start_date' => now()->addDays(7)->format('Y-m-d'),
                'end_date' => now()->addDays(9)->format('Y-m-d'),
                'status' => 'open',
            ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Liderança Ágil')
            ->assertJsonPath('data.category_label', 'Liderança')
            ->assertJsonPath('data.status_label', 'Aberta para inscrições')
            ->assertJsonPath('data.status_variant', 'info')
            ->assertJsonPath('data.enrolled_count', 0);
    }

    public function test_enroll_employee_creates_assignment(): void
    {
        [$tenant, $employee, $user] = $this->setupWithEmployee();
        $training = Training::factory()->open()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/trainings/{$training->id}/enroll", [
                'employee_id' => $employee->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'enrolled')
            ->assertJsonPath('data.status_label', 'Inscrito')
            ->assertJsonPath('data.employee.full_name', $employee->full_name);

        $this->assertSame(1, TrainingAssignment::query()->where('training_id', $training->id)->count());
    }

    public function test_duplicate_enrollment_is_rejected(): void
    {
        [$tenant, $employee, $user] = $this->setupWithEmployee();
        $training = Training::factory()->open()->create(['tenant_id' => $tenant->id]);
        TrainingAssignment::factory()->create([
            'tenant_id' => $tenant->id,
            'training_id' => $training->id,
            'employee_id' => $employee->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/trainings/{$training->id}/enroll", [
                'employee_id' => $employee->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Funcionário já inscrito nesta formação.');
    }

    public function test_max_participants_enforced(): void
    {
        [$tenant, $employee, $user] = $this->setupWithEmployee();
        $training = Training::factory()->open()->create([
            'tenant_id' => $tenant->id,
            'max_participants' => 1,
        ]);
        TrainingAssignment::factory()->create([
            'tenant_id' => $tenant->id,
            'training_id' => $training->id,
            'employee_id' => Employee::factory()->create(['tenant_id' => $tenant->id])->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/trainings/{$training->id}/enroll", [
                'employee_id' => $employee->id,
            ])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Formação sem vagas disponíveis.');
    }

    public function test_complete_assignment_marks_done(): void
    {
        [$tenant, $employee, $user] = $this->setupWithEmployee();
        $training = Training::factory()->inProgress()->create(['tenant_id' => $tenant->id]);
        $assignment = TrainingAssignment::factory()->create([
            'tenant_id' => $tenant->id,
            'training_id' => $training->id,
            'employee_id' => $employee->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/trainings/assignments/{$assignment->id}/complete", [
                'score' => 8.5,
                'notes' => 'Excelente participação',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.status_variant', 'success')
            ->assertJsonPath('data.score', 8.5);

        $this->assertNotNull($assignment->fresh()->completed_at);
    }

    public function test_employee_can_complete_own_assignment(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $employeeUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'password' => Hash::make('password'),
            'is_active' => true,
        ]);
        $employeeUser->assignRole('employee');

        $training = Training::factory()->inProgress()->create(['tenant_id' => $tenant->id]);
        $assignment = TrainingAssignment::factory()->create([
            'tenant_id' => $tenant->id,
            'training_id' => $training->id,
            'employee_id' => $employee->id,
        ]);

        $this->actingAs($employeeUser, 'sanctum')
            ->postJson("/api/v1/trainings/assignments/{$assignment->id}/complete", ['score' => 7.0])
            ->assertOk()
            ->assertJsonPath('data.status', 'completed');
    }

    public function test_training_soft_deleted(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');
        $training = Training::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/trainings/{$training->id}")
            ->assertOk();

        $this->assertSoftDeleted('trainings', ['id' => $training->id]);
    }

    public function test_assignments_remain_when_training_is_soft_deleted(): void
    {
        [$tenant, $employee, $user] = $this->setupWithEmployee();
        $training = Training::factory()->create(['tenant_id' => $tenant->id]);
        TrainingAssignment::factory()->create([
            'tenant_id' => $tenant->id,
            'training_id' => $training->id,
            'employee_id' => $employee->id,
        ]);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/trainings/{$training->id}")
            ->assertOk();

        $this->assertSoftDeleted('trainings', ['id' => $training->id]);
        $this->assertDatabaseHas('training_assignments', ['training_id' => $training->id]);
    }

    private function setupWithEmployee(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $employee = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $user = $this->makeUser($tenant, 'hr-manager');

        return [$tenant, $employee, $user];
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
