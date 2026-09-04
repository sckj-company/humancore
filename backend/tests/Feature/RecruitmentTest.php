<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\Department;
use App\Models\JobOpening;
use App\Models\Position;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class RecruitmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_user_without_view_recruitment_cannot_list_jobs(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, null);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/recruitment/jobs')
            ->assertForbidden();
    }

    public function test_hr_manager_can_create_and_list_jobs(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $department = Department::create(['tenant_id' => $tenant->id, 'name' => 'TI', 'code' => 'TI', 'is_active' => true]);
        $position = Position::create(['tenant_id' => $tenant->id, 'title' => 'Dev', 'department_id' => $department->id, 'is_active' => true]);
        $user = $this->makeUser($tenant, 'hr-manager');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/recruitment/jobs', [
                'title' => 'Desenvolvedor Backend',
                'department_id' => $department->id,
                'position_id' => $position->id,
                'description' => 'Vaga para devs',
                'employment_type' => 'full_time',
                'experience_level' => 'mid',
                'salary_min' => 500000,
                'salary_max' => 1200000,
                'openings_count' => 2,
                'status' => 'draft',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.status_label', 'Rascunho')
            ->assertJsonPath('data.status_variant', 'secondary')
            ->assertJsonPath('data.department.name', 'TI');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/recruitment/jobs')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1);
    }

    public function test_publish_and_close_job_transitions_status(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $job = JobOpening::factory()->create(['tenant_id' => $tenant->id, 'status' => 'draft']);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/recruitment/jobs/{$job->id}/publish")
            ->assertOk()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.status_variant', 'success')
            ->assertJsonPath('data.status_label', 'Aberta');

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/recruitment/jobs/{$job->id}/close")
            ->assertOk()
            ->assertJsonPath('data.status', 'closed');
    }

    public function test_hr_manager_can_add_and_list_candidates(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $job = JobOpening::factory()->open()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/recruitment/candidates', [
                'job_opening_id' => $job->id,
                'first_name' => 'João',
                'last_name' => 'Candidato',
                'email' => 'joao.cand@example.com',
                'phone' => '+244923000000',
                'years_experience' => 3,
                'status' => 'applied',
            ])
            ->assertCreated()
            ->assertJsonPath('data.full_name', 'João Candidato')
            ->assertJsonPath('data.status', 'applied')
            ->assertJsonPath('data.status_label', 'Candidatura recebida');

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/v1/recruitment/jobs/{$job->id}/candidates")
            ->assertOk()
            ->assertJsonPath('data.0.full_name', 'João Candidato');
    }

    public function test_move_candidate_updates_status_and_timestamp(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $job = JobOpening::factory()->open()->create(['tenant_id' => $tenant->id]);
        $candidate = Candidate::factory()->forJob($job)->create(['status' => 'applied']);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/recruitment/candidates/{$candidate->id}/move", ['status' => 'interview'])
            ->assertOk()
            ->assertJsonPath('data.status', 'interview')
            ->assertJsonPath('data.status_label', 'Em entrevista');

        $this->assertDatabaseHas('candidates', [
            'id' => $candidate->id,
            'status' => 'interview',
        ]);
    }

    public function test_move_candidate_with_invalid_status_returns_422(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $job = JobOpening::factory()->open()->create(['tenant_id' => $tenant->id]);
        $candidate = Candidate::factory()->forJob($job)->create();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/recruitment/candidates/{$candidate->id}/move", ['status' => 'not_a_real_status'])
            ->assertStatus(422);
    }

    public function test_update_job_can_change_status_to_closed_and_sets_closed_at(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');
        $job = JobOpening::factory()->open()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->putJson("/api/v1/recruitment/jobs/{$job->id}", ['status' => 'closed'])
            ->assertOk()
            ->assertJsonPath('data.status', 'closed');

        $this->assertNotNull($job->fresh()->closed_at);
    }

    public function test_employee_role_cannot_create_jobs(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'employee');
        $job = JobOpening::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/recruitment/jobs', [
                'title' => 'Auxiliar',
                'status' => 'open',
                'openings_count' => 1,
            ])
            ->assertForbidden();

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/recruitment/jobs/{$job->id}")
            ->assertForbidden();
    }

    public function test_delete_job_soft_deletes(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');
        $job = JobOpening::factory()->create(['tenant_id' => $tenant->id]);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/recruitment/jobs/{$job->id}")
            ->assertOk();

        $this->assertSoftDeleted('job_openings', ['id' => $job->id]);
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
