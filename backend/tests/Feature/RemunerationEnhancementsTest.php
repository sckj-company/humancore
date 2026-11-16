<?php

namespace Tests\Feature;

use App\Models\Deduction;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\Setting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payroll\PayrollEngineService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class RemunerationEnhancementsTest extends TestCase
{
    use RefreshDatabase;

    private function setupAdminAndEmployee(): array
    {
        $tenant = Tenant::factory()->create(['currency' => 'AOA']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $user->assignRole('admin');

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 200000,
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

        return [$tenant, $user, $employee, $period];
    }

    public function test_can_cancel_and_delete_advance_with_reason(): void
    {
        [$tenant, $user, $employee] = $this->setupAdminAndEmployee();

        $advance = Deduction::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'name' => 'Adiantamento Outubro',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'amount' => 25000,
            'total_amount' => 25000,
            'paid_amount' => 0,
            'status' => 'active',
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/deductions/{$advance->id}/cancel", [])
            ->assertStatus(422);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/deductions/{$advance->id}/cancel", [
                'reason' => 'Funcionário desistiu do adiantamento',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancellation_reason', 'Funcionário desistiu do adiantamento');

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/deductions/{$advance->id}", [
                'reason' => 'Registo duplicado',
            ])
            ->assertOk();

        $this->assertSoftDeleted('deductions', ['id' => $advance->id]);
        $this->assertDatabaseHas('deductions', [
            'id' => $advance->id,
            'deletion_reason' => 'Registo duplicado',
        ]);
    }

    public function test_employee_bonus_is_calculated_and_rendered_in_sheet_and_payslip(): void
    {
        [$tenant, $user, $employee, $period] = $this->setupAdminAndEmployee();

        $this->actingAs($user, 'sanctum')
            ->putJson("/api/v1/employees/{$employee->id}/payroll-settings", [
                'allowances' => [
                    'meal' => ['amount' => null, 'period' => 'daily', 'use_global' => true],
                    'transport' => ['amount' => null, 'period' => 'daily', 'use_global' => true],
                    'bonus' => ['amount' => 50000, 'period' => 'fixed', 'use_global' => false],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.allowances.bonus.amount', 50000)
            ->assertJsonPath('data.allowances.bonus.configured', true);

        $record = app(PayrollEngineService::class)->calculateForEmployee($period, $employee);

        $this->assertSame(250000.0, (float) $record->gross_salary);
        $this->assertDatabaseHas('payroll_record_items', [
            'payroll_record_id' => $record->id,
            'code' => 'bonus',
            'amount' => 50000,
        ]);

        $record->load(['employee', 'contract.position', 'period', 'tenant', 'items']);
        $period->load(['tenant', 'records.employee', 'records.contract.position', 'records.items']);

        $payslipHtml = view('pdf.payslip', ['record' => $record])->render();
        $sheetHtml = view('pdf.payroll-period', ['period' => $period])->render();

        $this->assertStringContainsString('50,000.00', $payslipHtml);
        $this->assertStringContainsString('Bónus', $sheetHtml);
        $this->assertStringContainsString('50,000.00', $sheetHtml);
    }

    public function test_global_remuneration_defaults_apply_when_employee_has_no_custom_value(): void
    {
        [$tenant, $user, $employee, $period] = $this->setupAdminAndEmployee();

        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'remuneration.bonus.amount'],
            ['value' => 30000],
        );
        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'remuneration.vacation.amount'],
            ['value' => 15000],
        );

        $record = app(PayrollEngineService::class)->calculateForEmployee($period, $employee);

        $this->assertSame(245000.0, (float) $record->gross_salary);
        $this->assertDatabaseHas('payroll_record_items', [
            'payroll_record_id' => $record->id,
            'code' => 'bonus',
            'amount' => 30000,
        ]);
        $this->assertDatabaseHas('payroll_record_items', [
            'payroll_record_id' => $record->id,
            'code' => 'vacation_subsidy',
            'amount' => 15000,
        ]);

        // Now override bonus for this specific employee
        $this->actingAs($user, 'sanctum')
            ->putJson("/api/v1/employees/{$employee->id}/payroll-settings", [
                'allowances' => [
                    'meal' => ['amount' => null, 'period' => 'daily', 'use_global' => true],
                    'transport' => ['amount' => null, 'period' => 'daily', 'use_global' => true],
                    'bonus' => ['amount' => 60000, 'period' => 'fixed', 'use_global' => false],
                ],
            ])
            ->assertOk();

        $record2 = app(PayrollEngineService::class)->calculateForEmployee($period, $employee->fresh());
        $this->assertSame(275000.0, (float) $record2->gross_salary);

        // Reset bonus back to global
        $this->actingAs($user, 'sanctum')
            ->putJson("/api/v1/employees/{$employee->id}/payroll-settings", [
                'allowances' => [
                    'meal' => ['amount' => null, 'period' => 'daily', 'use_global' => true],
                    'transport' => ['amount' => null, 'period' => 'daily', 'use_global' => true],
                    'bonus' => ['amount' => null, 'period' => 'fixed', 'use_global' => true],
                ],
            ])
            ->assertOk()
            ->assertJsonPath('data.allowances.bonus.configured', false)
            ->assertJsonPath('data.allowances.bonus.amount', 30000);

        $record3 = app(PayrollEngineService::class)->calculateForEmployee($period, $employee->fresh());
        $this->assertSame(245000.0, (float) $record3->gross_salary);
    }

    public function test_can_batch_recalculate_multiple_employees_from_accordion_adjustments(): void
    {
        [$tenant, $user, $employee1, $period] = $this->setupAdminAndEmployee();

        $employee2 = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee2->id,
            'base_salary' => 150000,
            'start_date' => '2026-01-01',
            'end_date' => null,
            'is_active' => true,
        ]);

        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'discounts.absence_daily_amount'],
            ['value' => 5000],
        );
        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'remuneration.overtime_hourly_rate'],
            ['value' => 2500],
        );

        app(PayrollEngineService::class)->processPeriod($period, [$employee1->id, $employee2->id]);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/payroll/periods/{$period->id}/recalculate", [
                'records' => [
                    [
                        'employee_id' => $employee1->id,
                        'absent_days' => 4,
                        'overtime_hours' => 2,
                        'components' => [
                            'bonus' => 20000,
                        ],
                    ],
                    [
                        'employee_id' => $employee2->id,
                        'absent_days' => 1,
                        'extra_items' => [
                            ['name' => 'Prémio Pontualidade', 'type' => 'earning', 'amount' => 10000],
                        ],
                    ],
                ],
            ])
            ->assertOk();

        // Employee 1: base 200,000 + overtime (2 * 2,500 = 5,000) + bonus 20,000 = 225,000 gross; absence = -20,000
        $record1 = $period->records()->where('employee_id', $employee1->id)->firstOrFail();
        $this->assertSame(225000.0, (float) $record1->gross_salary);
        $this->assertSame(4.0, (float) $record1->absent_days);
        $this->assertSame(2.0, (float) $record1->overtime_hours);
        $this->assertSame(-20000.0, (float) $record1->items()->where('code', 'absence')->value('amount'));
        $this->assertSame(5000.0, (float) $record1->items()->where('code', 'overtime')->value('amount'));
        $this->assertSame(20000.0, (float) $record1->items()->where('code', 'bonus')->value('amount'));

        // Employee 2: base 150,000 + extra 10,000 = 160,000 gross; absence = -5,000
        $record2 = $period->records()->where('employee_id', $employee2->id)->firstOrFail();
        $this->assertSame(160000.0, (float) $record2->gross_salary);
        $this->assertSame(-5000.0, (float) $record2->items()->where('code', 'absence')->value('amount'));

        $this->assertSame(385000.0, (float) $response->json('data.total_gross'));
    }

    public function test_changing_work_days_automatically_derives_absent_days_and_recalculates(): void
    {
        [$tenant, $user, $employee, $period] = $this->setupAdminAndEmployee();

        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'discounts.absence_daily_amount'],
            ['value' => 5000],
        );
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
        $scheduled = (int) $initial->details['scheduled_work_days'];
        $targetWorkDays = max(0, $scheduled - 2);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/payroll/periods/{$period->id}/recalculate", [
                'records' => [
                    [
                        'employee_id' => $employee->id,
                        'work_days' => $targetWorkDays,
                    ],
                ],
            ])
            ->assertOk();

        $updated = $initial->fresh();
        $this->assertSame((float) $targetWorkDays, (float) $updated->work_days);
        $this->assertSame(2.0, (float) $updated->absent_days);
        $this->assertSame(-10000.0, (float) $updated->items()->where('code', 'absence')->value('amount'));
        $this->assertSame(2.0, (float) $updated->items()->where('code', 'absence')->value('quantity'));
        $this->assertSame(5000.0, (float) $updated->items()->where('code', 'absence')->value('base_amount'));
        $this->assertSame((float) ($targetWorkDays * 1000), (float) $updated->items()->where('code', 'meal_subsidy')->value('amount'));
        $this->assertSame((float) $targetWorkDays, (float) $updated->items()->where('code', 'meal_subsidy')->value('quantity'));
        $this->assertSame(1000.0, (float) $updated->items()->where('code', 'meal_subsidy')->value('base_amount'));
    }
}
