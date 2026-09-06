<?php

namespace Tests\Feature;

use App\Models\Audit;
use App\Models\Employee;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuditTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_login_records_audit_event(): void
    {
        $tenant = Tenant::factory()->create();
        $user = $this->makeUser($tenant, 'admin');

        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ])->assertOk();

        $this->assertDatabaseHas('audits', [
            'user_id' => $user->id,
            'tenant_id' => $tenant->id,
            'event' => 'login',
            'auditable_type' => User::class,
            'auditable_id' => $user->id,
        ]);
    }

    public function test_logout_records_audit_event(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');

        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/v1/auth/logout')
            ->assertOk();

        $this->assertDatabaseHas('audits', [
            'user_id' => $user->id,
            'event' => 'logout',
        ]);
    }

    public function test_model_events_record_audits(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');

        $this->actingAs($user, 'sanctum');

        $employee = Employee::factory()->create(['first_name' => 'Zeca', 'tenant_id' => $tenant->id]);

        $employee->update(['first_name' => 'Zé Carlos']);

        $employee->delete();

        $this->assertDatabaseHas('audits', [
            'user_id' => $user->id,
            'event' => 'created',
            'auditable_type' => Employee::class,
            'auditable_id' => $employee->id,
        ]);

        $updated = Audit::query()->where('event', 'updated')->where('auditable_id', $employee->id)->first();
        $this->assertNotNull($updated);
        $this->assertArrayHasKey('first_name', $updated->new_values);
        $this->assertArrayHasKey('first_name', $updated->old_values);

        $this->assertDatabaseHas('audits', [
            'event' => 'deleted',
            'auditable_type' => Employee::class,
            'auditable_id' => $employee->id,
        ]);
    }

    public function test_admin_can_list_audits_with_filters(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $admin = $this->makeUser($tenant, 'admin');

        Audit::query()->create([
            'user_id' => $admin->id,
            'tenant_id' => $tenant->id,
            'event' => 'login',
            'auditable_type' => User::class,
            'auditable_id' => $admin->id,
            'ip_address' => '127.0.0.1',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/audits?event=login')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.data.0.event', 'login')
            ->assertJsonPath('data.data.0.user.email', $admin->email);

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/audits?event=updated')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 0);
    }

    public function test_hr_manager_can_list_audits(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'hr-manager');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/audits')
            ->assertOk();
    }

    public function test_employee_cannot_list_audits(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'employee');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/audits')
            ->assertForbidden();
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