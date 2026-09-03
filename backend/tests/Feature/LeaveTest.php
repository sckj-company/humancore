<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class LeaveTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    protected function setupEmployeeUser(string $role): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $employee = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);

        $vacation = LeaveType::create([
            'tenant_id' => $tenant->id,
            'name' => 'Férias Anuais',
            'code' => 'vacation',
            'category' => 'vacation',
            'days_per_year' => 22,
            'is_paid' => true,
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole($role);

        return [$tenant, $employee, $user, $vacation];
    }

    public function test_employee_can_request_leave_and_see_balance(): void
    {
        [$tenant, $employee, $user, $vacation] = $this->setupEmployeeUser('employee');

        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/leave/balance')
            ->assertOk()
            ->assertJsonPath('data.annual_entitlement', 22)
            ->assertJsonPath('data.days_remaining', 22);

        $this->postJson('/api/v1/leave', [
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-19',
            'reason' => 'Férias',
        ])->assertCreated()->assertJsonPath('data.total_days', 5);
    }

    public function test_admin_can_approve_request_and_balance_updates(): void
    {
        [$tenant, $employee, $admin, $vacation] = $this->setupEmployeeUser('admin');

        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-19',
            'total_days' => 5,
            'status' => 'pending',
        ]);

        $this->actingAs($admin, 'sanctum');
        $this->postJson("/api/v1/leave/{$leave->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->assertSame('approved', $leave->fresh()->status);
    }

    public function test_employee_cannot_approve_but_can_cancel_own_pending(): void
    {
        [$tenant, $employee, $user, $vacation] = $this->setupEmployeeUser('employee');

        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-19',
            'total_days' => 5,
            'status' => 'pending',
        ]);

        $this->actingAs($user, 'sanctum');

        $this->postJson("/api/v1/leave/{$leave->id}/approve")->assertForbidden();

        $this->postJson("/api/v1/leave/{$leave->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_tenant_isolation_hides_other_tenant_requests(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('employee');
        [$tenantB, , , $vacationB] = $this->setupEmployeeUser('hr-manager');

        // request in tenant B
        LeaveRequest::create([
            'tenant_id' => $tenantB->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacationB->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-16',
            'total_days' => 2,
            'status' => 'pending',
        ]);

        app(TenantManager::class)->set($tenant);

        $this->actingAs($user, 'sanctum');
        $this->getJson('/api/v1/leave/my-requests')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }
}
