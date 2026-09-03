<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveType;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    protected function setupTenant(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        return [$tenant];
    }

    protected function makeUser(Tenant $tenant, string $role, ?Employee $employee = null): User
    {
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee?->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole($role);

        if ($employee) {
            $employee->update(['user_id' => $user->id]);
        }

        return $user;
    }

    public function test_leave_request_notifies_approvers(): void
    {
        [$tenant] = $this->setupTenant();

        $employeeModel = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $employee = $this->makeUser($tenant, 'employee', $employeeModel);
        $manager = $this->makeUser($tenant, 'manager');
        $leaveType = LeaveType::create([
            'tenant_id' => $tenant->id,
            'name' => 'Férias Anuais',
            'code' => 'vacation',
            'category' => 'vacation',
            'days_per_year' => 22,
            'is_paid' => true,
            'is_active' => true,
        ]);

        $this->actingAs($employee, 'sanctum');

        $this->postJson('/api/v1/leave', [
            'leave_type_id' => $leaveType->id,
            'start_date' => now()->addDays(1)->format('Y-m-d'),
            'end_date' => now()->addDays(3)->format('Y-m-d'),
            'reason' => 'Descanso',
        ])->assertCreated();

        $notifications = $manager->notifications()->get();
        $this->assertCount(1, $notifications);
        $this->assertSame('Novo pedido de férias', $notifications->first()->data['title']);
        $this->assertNull($notifications->first()->read_at);
    }

    public function test_approving_leave_notifies_requester(): void
    {
        [$tenant] = $this->setupTenant();

        $employeeModel = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $employee = $this->makeUser($tenant, 'employee', $employeeModel);
        $manager = $this->makeUser($tenant, 'manager');
        $leaveType = LeaveType::create([
            'tenant_id' => $tenant->id,
            'name' => 'Férias Anuais',
            'code' => 'vacation',
            'category' => 'vacation',
            'days_per_year' => 22,
            'is_paid' => true,
            'is_active' => true,
        ]);

        $this->actingAs($employee, 'sanctum');
        $this->postJson('/api/v1/leave', [
            'leave_type_id' => $leaveType->id,
            'start_date' => now()->addDays(1)->format('Y-m-d'),
            'end_date' => now()->addDays(1)->format('Y-m-d'),
        ])->assertCreated();

        $leave = $employeeModel->leaveRequests()->latest()->first();

        $this->actingAs($manager, 'sanctum');
        $this->postJson("/api/v1/leave/{$leave->id}/approve")->assertOk();

        $this->assertTrue(
            $employee->notifications()->whereJsonContains('data->title', 'Pedido de férias aprovado')->exists()
        );
    }

    public function test_unread_count_and_mark_all_read(): void
    {
        [$tenant] = $this->setupTenant();

        $employeeModel = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        $manager = $this->makeUser($tenant, 'manager');
        $employee = $this->makeUser($tenant, 'employee', $employeeModel);
        $leaveType = LeaveType::create([
            'tenant_id' => $tenant->id,
            'name' => 'Férias Anuais',
            'code' => 'vacation',
            'category' => 'vacation',
            'days_per_year' => 22,
            'is_paid' => true,
            'is_active' => true,
        ]);

        $this->actingAs($employee, 'sanctum');
        $this->postJson('/api/v1/leave', [
            'leave_type_id' => $leaveType->id,
            'start_date' => now()->addDays(1)->format('Y-m-d'),
            'end_date' => now()->addDays(1)->format('Y-m-d'),
        ])->assertCreated();

        $this->actingAs($manager, 'sanctum');

        $this->getJson('/api/v1/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread', 1);

        $this->postJson('/api/v1/notifications/read-all')->assertOk();

        $this->getJson('/api/v1/notifications/unread-count')
            ->assertOk()
            ->assertJsonPath('data.unread', 0);
    }
}
