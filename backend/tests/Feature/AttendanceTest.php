<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSchedule;
use App\Models\Shift;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Carbon\Carbon;
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

    public function test_manual_attendance_calculates_overtime_from_shift_end(): void
    {
        [$tenant, $employee, $admin] = $this->setupEmployeeUser('admin');
        $shift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno normal',
            'start_time' => '09:00',
            'end_time' => '17:00',
            'late_tolerance_minutes' => 10,
        ]);
        EmployeeSchedule::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'effective_from' => now()->toDateString(),
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/attendance/manual', [
                'employee_id' => $employee->id,
                'date' => now()->toDateString(),
                'clock_in' => '09:00',
                'clock_out' => '18:15',
                'status' => 'present',
            ])
            ->assertCreated()
            ->assertJsonPath('data.overtime_minutes', 75);
    }

    public function test_manual_attendance_applies_selected_shift_late_tolerance(): void
    {
        [$tenant, $employee, $admin] = $this->setupEmployeeUser('admin');
        $tenant->update(['timezone' => 'UTC']);
        $date = now()->toDateString();
        $shift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno com tolerância',
            'start_time' => '09:00',
            'end_time' => '17:00',
            'late_tolerance_minutes' => 10,
        ]);
        EmployeeSchedule::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'effective_from' => $date,
            'is_active' => true,
        ]);

        $this->actingAs($admin, 'sanctum');
        $this->postJson('/api/v1/attendance/manual', [
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => $date,
            'clock_in' => '09:16',
            'status' => 'present',
        ])
            ->assertCreated()
            ->assertJsonPath('data.shift_id', $shift->id)
            ->assertJsonPath('data.late_minutes', 6);
    }

    public function test_qr_clock_out_calculates_overtime_from_shift_end(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('employee');
        Carbon::setTestNow(now()->copy()->setTimezone($tenant->timezone)->setTime(18, 15));

        $shift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno normal',
            'start_time' => '09:00',
            'end_time' => '17:00',
            'late_tolerance_minutes' => 10,
        ]);
        EmployeeSchedule::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'effective_from' => now()->toDateString(),
            'is_active' => true,
        ]);
        AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => now()->toDateString(),
            'clock_in' => now()->copy()->setTime(9, 0),
            'status' => 'present',
        ]);

        $this->actingAs($user, 'sanctum');
        $code = $this->postJson('/api/v1/attendance/qr/issue', ['action' => 'clock_out'])
            ->assertCreated()
            ->json('data.hash');

        $this->postJson('/api/v1/attendance/qr/scan', ['hash' => $code])
            ->assertOk()
            ->assertJsonPath('data.overtime_minutes', 75);

        Carbon::setTestNow();
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

    public function test_manual_attendance_is_recorded_separately_for_each_assigned_shift(): void
    {
        [$tenant, $employee, $admin] = $this->setupEmployeeUser('admin');
        $tenant->update(['timezone' => 'UTC']);
        $date = now()->toDateString();
        $morning = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno da manhã',
            'start_time' => '09:00',
            'end_time' => '17:00',
            'late_tolerance_minutes' => 10,
        ]);
        $evening = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno da noite',
            'start_time' => '18:00',
            'end_time' => '22:00',
            'late_tolerance_minutes' => 0,
        ]);

        foreach ([$morning, $evening] as $shift) {
            EmployeeSchedule::create([
                'tenant_id' => $tenant->id,
                'employee_id' => $employee->id,
                'shift_id' => $shift->id,
                'effective_from' => $date,
                'is_active' => true,
            ]);
        }

        $this->actingAs($admin, 'sanctum');
        $this->postJson('/api/v1/attendance/manual', [
            'employee_id' => $employee->id,
            'date' => $date,
            'status' => 'absent',
        ])->assertUnprocessable()->assertJsonValidationErrors('shift_id');

        $this->postJson('/api/v1/attendance/manual', [
            'employee_id' => $employee->id,
            'shift_id' => $morning->id,
            'date' => $date,
            'clock_in' => '09:20',
            'clock_out' => '18:00',
            'status' => 'present',
        ])
            ->assertCreated()
            ->assertJsonPath('data.shift_id', $morning->id)
            ->assertJsonPath('data.overtime_minutes', 60);

        $this->postJson('/api/v1/attendance/manual', [
            'employee_id' => $employee->id,
            'shift_id' => $evening->id,
            'date' => $date,
            'status' => 'absent',
        ])
            ->assertCreated()
            ->assertJsonPath('data.shift_id', $evening->id)
            ->assertJsonPath('data.status', 'absent');

        $this->assertSame(2, AttendanceRecord::where('employee_id', $employee->id)->whereDate('date', $date)->count());
    }

    public function test_admin_can_edit_attendance_times_and_absence_details(): void
    {
        [$tenant, $employee, $admin] = $this->setupEmployeeUser('admin');
        $date = now()->toDateString();
        $shift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno editável',
            'start_time' => '09:00',
            'end_time' => '17:00',
            'late_tolerance_minutes' => 0,
        ]);
        EmployeeSchedule::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'effective_from' => $date,
            'is_active' => true,
        ]);
        $record = AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => $date,
            'status' => 'present',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/attendance/{$record->id}", [
                'clock_in' => '09:15',
                'clock_out' => '17:30',
                'status' => 'justified',
                'deduct_from_salary' => true,
                'notes' => 'Ausência justificada parcialmente.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'justified')
            ->assertJsonPath('data.clock_in', '09:15')
            ->assertJsonPath('data.clock_out', '17:30')
            ->assertJsonPath('data.notes', 'Ausência justificada parcialmente.')
            ->assertJsonPath('data.deduct_from_salary', true);
    }

    public function test_employee_can_be_assigned_to_multiple_active_shifts(): void
    {
        [$tenant, $employee, $admin] = $this->setupEmployeeUser('admin');
        $firstShift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno A',
            'start_time' => '08:00',
            'end_time' => '12:00',
        ]);
        $secondShift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno B',
            'start_time' => '14:00',
            'end_time' => '18:00',
        ]);

        $this->actingAs($admin, 'sanctum');
        foreach ([$firstShift, $secondShift] as $shift) {
            $this->postJson('/api/v1/employee-schedules', [
                'employee_id' => $employee->id,
                'shift_id' => $shift->id,
                'effective_from' => now()->toDateString(),
                'is_active' => true,
            ])->assertCreated();
        }

        $this->assertSame(2, EmployeeSchedule::where('employee_id', $employee->id)->where('is_active', true)->count());
    }

    public function test_shift_update_accepts_normalized_form_values(): void
    {
        [$tenant, , $admin] = $this->setupEmployeeUser('admin');
        $shift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno original',
            'start_time' => '08:00',
            'end_time' => '17:00',
        ]);

        $this->actingAs($admin, 'sanctum')
            ->putJson("/api/v1/shifts/{$shift->id}", [
                'name' => 'Turno atualizado',
                'code' => null,
                'start_time' => '08:30',
                'end_time' => '17:30',
                'break_minutes' => 60,
                'work_hours' => 8,
                'late_tolerance_minutes' => 10,
                'working_days' => [1, 2, 3, 4, 5],
                'color' => '#3b82f6',
                'is_night_shift' => false,
                'is_active' => true,
                'notes' => null,
            ])
            ->assertOk()
            ->assertJsonPath('data.name', 'Turno atualizado');
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
