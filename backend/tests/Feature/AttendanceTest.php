<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AttendanceTest extends TestCase
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
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
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

        return [$tenant, $employee, $user];
    }

    public function test_employee_can_clock_in_and_out(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('employee');

        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/attendance/toggle')
            ->assertOk()
            ->assertJsonPath('data.clock_in', now()->format('H:i'));

        $this->postJson('/api/v1/attendance/toggle')->assertOk();

        $record = AttendanceRecord::where('employee_id', $employee->id)->first();
        $this->assertNotNull($record->clock_in);
        $this->assertNotNull($record->clock_out);
    }

    public function test_admin_can_view_attendance_records_but_employee_cannot(): void
    {
        [$tenant, $employee, $admin] = $this->setupEmployeeUser('admin');

        $this->actingAs($admin, 'sanctum');
        $this->getJson('/api/v1/attendance')->assertOk();

        [$tenant2, , $employeeUser] = $this->setupEmployeeUser('employee');
        app(TenantManager::class)->set($tenant);

        $this->actingAs($employeeUser, 'sanctum');
        $this->getJson('/api/v1/attendance')->assertForbidden();
    }

    public function test_admin_can_adjust_record_status(): void
    {
        [$tenant, $employee, $admin] = $this->setupEmployeeUser('admin');

        $record = AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-09-01',
            'clock_in' => now(),
            'status' => 'present',
        ]);

        $this->actingAs($admin, 'sanctum');
        $this->putJson("/api/v1/attendance/{$record->id}", ['status' => 'justified'])
            ->assertOk()
            ->assertJsonPath('data.status', 'justified');
    }

    public function test_employee_can_see_own_history(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('employee');

        AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-08-01',
            'clock_in' => now(),
            'clock_out' => now()->addHours(8),
            'status' => 'present',
        ]);

        $this->actingAs($user, 'sanctum');
        $this->getJson('/api/v1/attendance/my-history')
            ->assertOk()
            ->assertJsonCount(1, 'data.data');
    }
}
