<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\AttendanceRecord;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\Setting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payroll\PayrollEngineService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PayrollTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    protected function setupTenantWithEmployee(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $employee = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 700000,
            'salary_frequency' => 'monthly',
            'start_date' => '2025-01-01',
            'end_date' => null,
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole('admin');

        return [$tenant, $employee, $user];
    }

    public function test_calculation_uses_db_settings_and_rules_are_accurate(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();

        // Ensure INSS employee rate is driven by DB settings
        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'inss.employee_rate'],
            ['value' => 5.0],
        );

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Setembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-09-01',
            'period_end' => '2026-09-30',
            'status' => 'open',
        ]);

        $engine = app(PayrollEngineService::class);
        $record = $engine->calculateForEmployee($period, $employee);

        $inss = round(700000 * 0.05, 2);

        $this->assertSame(700000.0, (float) $record->gross_salary);
        $this->assertSame($inss, (float) $record->total_deductions);
        $this->assertGreaterThan(0, (float) $record->total_taxes, 'IRT should apply');
        $this->assertSame($record->gross_salary - $record->total_deductions - $record->total_taxes, (float) $record->net_salary);
        $this->assertSame('calculated', $record->status);
    }

    public function test_process_period_generates_records_for_active_employees(): void
    {
        [$tenant, $employee, $user] = $this->setupTenantWithEmployee();

        // inactive employee must be skipped
        Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'inactive']);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Outubro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-10-01',
            'period_end' => '2026-10-31',
            'status' => 'open',
        ]);

        $engine = app(PayrollEngineService::class);
        $result = $engine->processPeriod($period);

        $this->assertSame(1, $result['processed']);
        $this->assertSame('completed', $period->fresh()->status);
        $this->assertDatabaseHas('payroll_records', [
            'payroll_period_id' => $period->id,
            'employee_id' => $employee->id,
        ]);
    }

    public function test_absence_deduction_requires_explicit_employee_consent(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-11-03',
            'status' => 'absent',
            'deduct_from_salary' => false,
        ]);
        AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-11-04',
            'status' => 'absent',
            'deduct_from_salary' => true,
        ]);

        $record = app(PayrollEngineService::class)->calculateForEmployee($period, $employee);

        $this->assertSame(1.0, (float) $record->absent_days);
        $this->assertSame(-round(700000 / 30, 2), (float) $record->items()->where('code', 'absence')->value('amount'));
    }

    public function test_admin_can_complete_payroll_workflow(): void
    {
        [$tenant, $employee, $user] = $this->setupTenantWithEmployee();

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->actingAs($user, 'sanctum');

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/approve")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSame('approved', $period->fresh()->status);
        $this->assertSame('approved', PayrollRecord::where('payroll_period_id', $period->id)->first()->status);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/close")
            ->assertOk()
            ->assertJsonPath('success', true);
        $this->assertSame('closed', $period->fresh()->status);
    }

    public function test_employee_can_view_own_payslip_but_not_others(): void
    {
        [$tenant, $employee, $admin] = $this->setupTenantWithEmployee();

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Dezembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-12-01',
            'period_end' => '2026-12-31',
            'status' => 'open',
        ]);

        app(PayrollEngineService::class)->processPeriod($period);
        $record = PayrollRecord::where('payroll_period_id', $period->id)->where('employee_id', $employee->id)->first();

        // Employee role user tied to the employee
        $employeeUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $employeeUser->assignRole('employee');

        // another tenant employee's record
        $otherTenant = Tenant::factory()->create();
        app(TenantManager::class)->set($otherTenant);
        $other = Employee::factory()->create(['tenant_id' => $otherTenant->id]);
        $otherContract = EmployeeContract::factory()->create(['tenant_id' => $otherTenant->id, 'employee_id' => $other->id]);
        $otherRecord = PayrollRecord::create([
            'tenant_id' => $otherTenant->id,
            'payroll_period_id' => $period->id,
            'employee_id' => $other->id,
            'contract_id' => $otherContract->id,
            'status' => 'calculated',
        ]);

        app(TenantManager::class)->set($tenant);

        $this->actingAs($employeeUser, 'sanctum');
        $this->getJson("/api/v1/payroll/records/{$record->id}/payslip")->assertOk();
        // Other tenant's record is hidden by the tenant scope (404) - not exposed
        $this->getJson("/api/v1/payroll/records/{$otherRecord->id}/payslip")->assertNotFound();
    }

    public function test_irt_rule_calculates_correct_bracket_and_fixed_amount(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();

        // Desativa INSS temporariamente para verificar matéria colectável direta
        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'inss.employee_rate'],
            ['value' => 0.0],
        );

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Janeiro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-01-01',
            'period_end' => '2026-01-31',
            'status' => 'open',
        ]);

        // Teste 1: 150.000 Kz -> Escalão 100k a 200k (7%, fixa 0) => (150.000 - 100.000) * 0.07 = 3.500 Kz
        $contract = $employee->activeContract()->first();
        $contract->update(['base_salary' => 150000]);

        $engine = app(PayrollEngineService::class);
        $record = $engine->calculateForEmployee($period, $employee);
        $details = $record->details['breakdown'];
        $irtItem = collect($details)->firstWhere('code', 'irt');

        $this->assertNotNull($irtItem);
        $this->assertSame(-3500.0, (float) $irtItem['amount']);

        // Teste 2: 600.000 Kz -> Escalão 500k a 1M (15%, fixa 40.000) => 40.000 + (600.000 - 500.000) * 0.15 = 55.000 Kz
        $contract->update(['base_salary' => 600000]);
        $record600 = $engine->calculateForEmployee($period, $employee);
        $details600 = $record600->details['breakdown'];
        $irtItem600 = collect($details600)->firstWhere('code', 'irt');

        $this->assertNotNull($irtItem600);
        $this->assertSame(-55000.0, (float) $irtItem600['amount']);
    }

    public function test_process_period_with_missing_contract_records_structured_errors_and_sets_failed_status(): void
    {
        [$tenant, $employeeWithContract] = $this->setupTenantWithEmployee();

        // Cria funcionário ativo sem contrato
        $employeeWithoutContract = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
            'first_name' => 'Sem',
            'last_name' => 'Contrato',
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Fevereiro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-02-01',
            'period_end' => '2026-02-28',
            'status' => 'open',
        ]);

        $engine = app(PayrollEngineService::class);
        $result = $engine->processPeriod($period);

        // Apenas o funcionário válido conta como processado com sucesso
        $this->assertSame(1, $result['processed']);
        $this->assertSame(2, $result['total']);

        // Período deve ter status 'failed' devido ao erro impeditivo do funcionário sem contrato
        $this->assertSame('failed', $period->fresh()->status);

        // Funcionário válido tem o record calculado
        $validRecord = PayrollRecord::where('payroll_period_id', $period->id)
            ->where('employee_id', $employeeWithContract->id)
            ->first();
        $this->assertNotNull($validRecord);
        $this->assertSame('calculated', $validRecord->status);
        $this->assertNull($validRecord->validation_errors);

        // Funcionário sem contrato tem record registrado com erro estruturado
        $failedRecord = PayrollRecord::where('payroll_period_id', $period->id)
            ->where('employee_id', $employeeWithoutContract->id)
            ->first();
        $this->assertNotNull($failedRecord);
        $this->assertSame('draft', $failedRecord->status);
        $this->assertIsArray($failedRecord->validation_errors);
        $this->assertNotEmpty($failedRecord->validation_errors);
        $this->assertTrue($failedRecord->validation_errors[0]['is_blocking']);
        $this->assertSame('MISSING_CONTRACT', $failedRecord->validation_errors[0]['code']);
        $this->assertStringContainsString('sem contrato ativo', $failedRecord->validation_errors[0]['message']);
    }

    public function test_phase2_calculation_items_snapshot_and_employer_cost(): void
    {
        [$tenant, $employee, $user] = $this->setupTenantWithEmployee();
        $this->actingAs($user, 'sanctum');

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Março/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-03-01',
            'period_end' => '2026-03-31',
            'status' => 'open',
        ]);

        $engine = app(PayrollEngineService::class);
        $record = $engine->calculateForEmployee($period, $employee);

        // 1. Verifica employer_inss e employer_cost
        $this->assertGreaterThan(0, (float) $record->employer_inss);
        $this->assertEquals((float) $record->gross_salary + (float) $record->employer_inss, (float) $record->employer_cost);
        $this->assertGreaterThan(0, (float) $record->irt_taxable_base);

        // 2. Verifica snapshot imutável e versão
        $this->assertSame('2.0.0', $record->engine_version);
        $this->assertIsArray($record->snapshot);
        $this->assertArrayHasKey('calculated_at', $record->snapshot);

        // 3. Verifica itemização discriminada em payroll_record_items
        $this->assertGreaterThanOrEqual(3, $record->items()->count());

        $baseSalaryItem = $record->items()->where('code', 'base_salary')->first();
        $this->assertNotNull($baseSalaryItem);
        $this->assertSame('earning', $baseSalaryItem->category);
        $this->assertEquals(700000, (float) $baseSalaryItem->amount);

        $employerInssItem = $record->items()->where('code', 'employer_inss')->first();
        $this->assertNotNull($employerInssItem);
        $this->assertSame('employer_contribution', $employerInssItem->category);
        $this->assertEquals((float) $record->employer_inss, (float) $employerInssItem->amount);

        // 4. Aprovação e criação de totals_snapshot no período
        // Período precisa estar completed (pós-processamento) para approve
        $period->update(['status' => 'completed']);
        $response = $this->postJson("/api/v1/payroll/periods/{$period->id}/approve");
        $response->assertOk();

        $freshPeriod = $period->fresh();
        $this->assertSame('approved', $freshPeriod->status);
        $this->assertNotNull($freshPeriod->approved_at);
        $this->assertIsArray($freshPeriod->totals_snapshot);
        $this->assertArrayHasKey('total_employer_cost', $freshPeriod->totals_snapshot);
        $this->assertGreaterThan(0, (float) $freshPeriod->totals_snapshot['total_employer_cost']);
    }
}
