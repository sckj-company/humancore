<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeSchedule;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Shift;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class BiometricIntegrationTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenantWithEmployees(): array
    {
        $tenant = Tenant::factory()->create([
            'currency' => 'AOA',
            'timezone' => 'Africa/Luanda',
        ]);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $user->assignRole('admin');

        $department = Department::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Operações']);

        $shift = Shift::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno Manhã',
            'code' => 'TM-01',
            'start_time' => '08:00:00',
            'end_time' => '17:00:00',
            'late_tolerance_minutes' => 10,
            'work_hours' => 8,
            'working_days' => [1, 2, 3, 4, 5],
            'is_active' => true,
        ]);

        $employeeA = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'employee_code' => 'EMP-0101',
            'biometric_code' => 'BIO-101',
            'first_name' => 'Carlos',
            'last_name' => 'Mendes',
            'overtime_hourly_rate' => 2400,
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        $employeeB = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'employee_code' => 'EMP-0102',
            'biometric_code' => null,
            'first_name' => 'Ana',
            'last_name' => 'Silva',
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        $employeeLeave = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'employee_code' => 'EMP-0103',
            'biometric_code' => 'BIO-103',
            'first_name' => 'Pedro',
            'last_name' => 'Costa',
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        foreach ([$employeeA, $employeeB, $employeeLeave] as $emp) {
            EmployeeSchedule::query()->create([
                'tenant_id' => $tenant->id,
                'employee_id' => $emp->id,
                'shift_id' => $shift->id,
                'effective_from' => '2026-01-01',
                'is_active' => true,
            ]);
        }

        $this->actingAs($user, 'sanctum');

        return [$tenant, $user, $shift, $employeeA, $employeeB, $employeeLeave];
    }

    public function test_biometric_can_sync_employees_both_ways(): void
    {
        [, , , $employeeA, $employeeB] = $this->setupTenantWithEmployees();

        // 1. Pull list for entrance biometric PC
        $pull = $this->getJson('/api/v1/integrations/biometric/employees?all=1')
            ->assertOk()
            ->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.employees.0.biometric_code', 'BIO-101')
            ->assertJsonPath('data.employees.0.shift.start_time', '08:00:00');

        $this->assertTrue($pull->json('data.employees.0.has_explicit_biometric_code'));
        // Employee B without explicit biometric_code falls back to employee_code
        $this->assertSame('EMP-0102', $pull->json('data.employees.1.biometric_code'));

        // 2. Push/bind biometric_code from biometric terminal to existing employee + create missing pending employee
        $sync = $this->postJson('/api/v1/integrations/biometric/employees/sync', [
            'create_missing' => true,
            'employees' => [
                ['employee_code' => $employeeB->employee_code, 'biometric_code' => 'BIO-202'],
                ['biometric_code' => 'BIO-999', 'full_name' => 'Maria João', 'email' => 'maria.joao@empresa.ao'],
            ],
        ])->assertOk();

        $sync->assertJsonPath('data.updated', 1)
            ->assertJsonPath('data.created', 1);

        $this->assertDatabaseHas('employees', [
            'id' => $employeeB->id,
            'biometric_code' => 'BIO-202',
        ]);
        $this->assertDatabaseHas('employees', [
            'biometric_code' => 'BIO-999',
            'first_name' => 'Maria',
            'last_name' => 'João',
            'approval_status' => 'pending',
        ]);
    }

    public function test_biometric_attendance_automates_clock_in_debounce_lateness_clock_out_and_overtime(): void
    {
        [$tenant, , , $employeeA, $employeeB] = $this->setupTenantWithEmployees();

        // Monday 2026-11-16 (shift 08:00-17:00, tolerance 10 min)
        // 1. Real-time clock-in at 08:25 -> 15 min late
        $punchIn = $this->postJson('/api/v1/integrations/biometric/attendance', [
            'biometric_code' => 'BIO-101',
            'punched_at' => '2026-11-16T08:25:00+01:00',
            'device_name' => 'Portaria Principal',
        ])->assertCreated();

        $punchIn->assertJsonPath('data.results.0.action', 'created')
            ->assertJsonPath('data.results.0.late_minutes', 15)
            ->assertJsonPath('data.results.0.status', 'late');

        // 2. Accidental double tap 30s later -> ignored_duplicate, clock_out stays null
        $doubleTap = $this->postJson('/api/v1/integrations/biometric/attendance', [
            'biometric_code' => 'BIO-101',
            'punched_at' => '2026-11-16T08:25:30+01:00',
        ])->assertOk();

        $doubleTap->assertJsonPath('data.ignored_duplicates', 1)
            ->assertJsonPath('data.results.0.action', 'ignored_duplicate');

        // 3. Real-time clock-out at 18:30 + batch summary for Employee B on the same request
        $batch = $this->postJson('/api/v1/integrations/biometric/attendance', [
            'device_name' => 'Terminal Entrada',
            'punches' => [
                [
                    'biometric_code' => 'BIO-101',
                    'punched_at' => '2026-11-16T18:30:00+01:00',
                ],
                [
                    'employee_code' => $employeeB->employee_code,
                    'date' => '2026-11-16',
                    'clock_in' => '08:05',
                    'clock_out' => '17:00',
                ],
                [
                    'biometric_code' => 'UNKNOWN-999',
                    'punched_at' => '2026-11-16T08:00:00+01:00',
                ],
            ],
        ])->assertOk();

        $batch->assertJsonPath('data.processed', 3)
            ->assertJsonPath('data.updated', 1)
            ->assertJsonPath('data.created', 1)
            ->assertJsonPath('data.failed', 1);

        // Employee A: 08:25 -> 18:30 = 605 min worked, 15 min late, 90 min overtime (90/60 * 2400 = 3600)
        $recA = AttendanceRecord::query()
            ->where('tenant_id', $tenant->id)
            ->where('employee_id', $employeeA->id)
            ->whereDate('date', '2026-11-16')
            ->firstOrFail();
        $this->assertSame('late', $recA->status);
        $this->assertSame(15, (int) $recA->late_minutes);
        $this->assertSame(90, (int) $recA->overtime_minutes);
        $this->assertEquals(3600.0, (float) $recA->overtime_amount);
        $this->assertSame(605, (int) $recA->total_worked);

        // Employee B: 08:05 -> 17:00 within 10m tolerance -> present, 0 late, 0 overtime
        $recB = AttendanceRecord::query()
            ->where('tenant_id', $tenant->id)
            ->where('employee_id', $employeeB->id)
            ->whereDate('date', '2026-11-16')
            ->firstOrFail();
        $this->assertSame('present', $recB->status);
        $this->assertSame(0, (int) $recB->late_minutes);
        $this->assertSame(0, (int) $recB->overtime_minutes);
    }

    public function test_close_day_automatically_marks_unpunched_scheduled_employees_absent_respecting_leaves_and_holidays(): void
    {
        [$tenant, , , $employeeA, $employeeB, $employeeLeave] = $this->setupTenantWithEmployees();

        // Tuesday 2026-11-10: Employee A punched in; Employee Leave has approved leave; Employee B missed work
        AttendanceRecord::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employeeA->id,
            'date' => '2026-11-10',
            'status' => 'present',
        ]);

        $leaveType = LeaveType::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Férias Anuais',
            'code' => 'VAC',
            'category' => 'vacation',
            'days_per_year' => 22,
            'is_paid' => true,
            'requires_approval' => true,
        ]);

        LeaveRequest::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employeeLeave->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-09',
            'end_date' => '2026-11-13',
            'total_days' => 5,
            'status' => 'approved',
        ]);

        $close = $this->postJson('/api/v1/integrations/biometric/attendance/close-day', [
            'date' => '2026-11-10',
            'deduct_from_salary' => true,
        ])->assertOk();

        $close->assertJsonPath('data.is_holiday', false)
            ->assertJsonPath('data.marked_absent_count', 1)
            ->assertJsonPath('data.skipped_existing_count', 1)
            ->assertJsonPath('data.skipped_leave_count', 1)
            ->assertJsonPath('data.absent_employee_ids.0', $employeeB->id);

        $absentRec = AttendanceRecord::query()
            ->where('employee_id', $employeeB->id)
            ->whereDate('date', '2026-11-10')
            ->firstOrFail();
        $this->assertSame('absent', $absentRec->status);
        $this->assertTrue((bool) $absentRec->deduct_from_salary);

        // Holiday 2026-11-11 (Independência de Angola) -> must mark 0 absences
        Holiday::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Dia da Independência',
            'date' => '2026-11-11',
            'is_recurring' => true,
            'type' => 'national',
        ]);

        $this->postJson('/api/v1/integrations/biometric/attendance/close-day', [
            'date' => '2026-11-11',
        ])->assertOk()
            ->assertJsonPath('data.is_holiday', true)
            ->assertJsonPath('data.marked_absent_count', 0);
    }
}
