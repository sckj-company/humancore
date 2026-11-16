<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Deduction;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSchedule;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\Setting;
use App\Models\Shift;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payroll\PayrollEngineService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PayrollSyncAutomationTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenantWithPayroll(): array
    {
        $tenant = Tenant::factory()->create(['currency' => 'AOA']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $user->assignRole('admin');

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        $contract = EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 220000,
            'start_date' => '2026-01-01',
            'end_date' => null,
            'is_active' => true,
        ]);

        PayrollInssRule::query()->create([
            'tenant_id' => $tenant->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'code' => 'INSS-AO',
            'name' => 'INSS Angola',
            'employee_rate' => 3.0,
            'employer_rate' => 8.0,
            'effective_from' => '2026-01-01',
            'status' => 'active',
            'validated_by' => $user->id,
            'validated_at' => now(),
        ]);

        PayrollIrtTable::query()->create([
            'tenant_id' => $tenant->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'code' => 'IRT-AO',
            'name' => 'IRT Angola',
            'effective_from' => '2026-01-01',
            'status' => 'active',
            'validated_by' => $user->id,
            'validated_at' => now(),
            'brackets' => [
                ['min' => 0, 'max' => 100000, 'rate' => 0, 'fixed' => 0],
                ['min' => 100000, 'max' => null, 'rate' => 10, 'fixed' => 0],
            ],
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Outubro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-10-01',
            'period_end' => '2026-10-31',
            'payment_date' => '2026-11-05',
            'status' => 'open',
        ]);

        return [$tenant, $user, $employee, $contract, $period];
    }

    public function test_leave_approval_recalculates_work_days_and_daily_subsidy_in_open_payroll(): void
    {
        [$tenant, , $employee, , $period] = $this->setupTenantWithPayroll();

        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'remuneration.meal.amount'],
            ['value' => 1000],
        );
        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'remuneration.meal.period'],
            ['value' => 'daily'],
        );

        app(PayrollEngineService::class)->processPeriod($period, [$employee->id]);
        $initial = $period->records()->where('employee_id', $employee->id)->firstOrFail();
        $initialWorkDays = (float) $initial->work_days;

        $leaveType = LeaveType::create([
            'tenant_id' => $tenant->id,
            'name' => 'Licença sem vencimento',
            'code' => 'UNPAID',
            'category' => 'unpaid',
            'days_per_year' => 30,
            'is_paid' => false,
            'requires_approval' => true,
            'is_active' => true,
        ]);

        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-10-05', // Monday
            'end_date' => '2026-10-06',   // Tuesday (2 work days)
            'total_days' => 2,
            'deduct_from_salary' => true,
            'status' => 'pending',
        ]);

        $leave->update(['status' => 'approved']);

        $updated = $initial->fresh();
        $this->assertSame($initialWorkDays - 2, (float) $updated->work_days);
        $this->assertSame(2.0, (float) $updated->absent_days);
        $this->assertSame(($initialWorkDays - 2) * 1000, (float) $updated->items()->where('code', 'meal_subsidy')->value('amount'));
    }

    public function test_attendance_change_marks_open_payroll_record_outdated(): void
    {
        [$tenant, , $employee, , $period] = $this->setupTenantWithPayroll();

        app(PayrollEngineService::class)->processPeriod($period, [$employee->id]);
        $record = $period->records()->where('employee_id', $employee->id)->firstOrFail();
        $this->assertFalse((bool) $record->is_outdated);

        AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-10-12',
            'status' => 'absent',
            'deduct_from_salary' => true,
        ]);

        $this->assertTrue((bool) $record->fresh()->is_outdated);
        $this->assertNotNull($record->fresh()->outdated_reason);
    }

    public function test_contract_base_salary_change_cascades_to_open_payroll(): void
    {
        [$tenant, , $employee, $contract, $period] = $this->setupTenantWithPayroll();

        app(PayrollEngineService::class)->processPeriod($period, [$employee->id]);
        $record = $period->records()->where('employee_id', $employee->id)->firstOrFail();
        $this->assertSame(220000.0, (float) $record->base_salary);

        $contract->update(['base_salary' => 300000]);

        $updated = $record->fresh();
        $this->assertSame(300000.0, (float) $updated->base_salary);
        $this->assertSame(300000.0, (float) $updated->gross_salary);
        $this->assertSame(9000.0, (float) $updated->items()->where('code', 'inss')->value('amount') * -1);
    }

    public function test_global_settings_update_marks_open_periods_outdated_and_returns_affected_periods(): void
    {
        [$tenant, $user, $employee, , $period] = $this->setupTenantWithPayroll();

        app(PayrollEngineService::class)->processPeriod($period, [$employee->id]);

        $response = $this->actingAs($user, 'sanctum')
            ->putJson('/api/v1/settings/bulk', [
                'group' => 'payroll',
                'values' => [
                    'remuneration.bonus.amount' => 15000,
                ],
            ])
            ->assertOk();

        $this->assertCount(1, $response->json('data.affected_periods'));
        $this->assertSame($period->id, $response->json('data.affected_periods.0.id'));
        $this->assertTrue((bool) $period->records()->first()->is_outdated);
    }

    public function test_percentage_deduction_recalculates_on_bonus_and_warns_when_net_negative(): void
    {
        [$tenant, $user, $employee, , $period] = $this->setupTenantWithPayroll();

        $pctDeduction = Deduction::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'name' => 'Quota Sindical 10%',
            'deduction_type' => 'union_fee',
            'amount_type' => 'percentage',
            'percentage' => 10,
            'amount' => 0,
            'paid_amount' => 0,
            'is_recurring' => true,
            'status' => 'active',
        ]);

        app(PayrollEngineService::class)->processPeriod($period, [$employee->id]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/payroll/periods/{$period->id}/recalculate", [
                'records' => [
                    [
                        'employee_id' => $employee->id,
                        'components' => [
                            'bonus' => 80000,
                        ],
                        'extra_items' => [
                            ['name' => 'Desconto Extra', 'type' => 'deduction', 'amount' => 400000],
                        ],
                    ],
                ],
            ])
            ->assertOk();

        $record = $period->records()->where('employee_id', $employee->id)->firstOrFail();
        // Gross = 220,000 + 80,000 = 300,000 -> 10% = -30,000
        $this->assertSame(300000.0, (float) $record->gross_salary);
        $this->assertSame(-30000.0, (float) $record->items()->where('deduction_id', $pctDeduction->id)->value('amount'));
        $this->assertNotEmpty($record->validation_errors);
        $this->assertSame('net_negative', $record->validation_errors[0]['code']);
    }

    public function test_schedule_change_updates_scheduled_work_days_in_open_payroll(): void
    {
        [$tenant, $user, $employee, , $period] = $this->setupTenantWithPayroll();

        app(PayrollEngineService::class)->processPeriod($period, [$employee->id]);
        $record = $period->records()->where('employee_id', $employee->id)->firstOrFail();
        $initialScheduled = (int) $record->details['scheduled_work_days'];

        $shift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno 6 dias',
            'start_time' => '08:00',
            'end_time' => '17:00',
            'working_days' => [1, 2, 3, 4, 5, 6],
            'is_active' => true,
        ]);

        EmployeeSchedule::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'effective_from' => '2026-10-01',
            'is_active' => true,
            'assigned_by' => $user->id,
        ]);

        $updated = $record->fresh();
        $this->assertTrue((bool) $updated->is_outdated);
        $this->assertGreaterThan($initialScheduled, (int) $updated->details['scheduled_work_days']);
    }
}
