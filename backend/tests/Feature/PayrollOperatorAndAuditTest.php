<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Audit;
use App\Models\Deduction;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSchedule;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\Shift;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payroll\PayrollEngineService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\SettingSeeder;
use Tests\TestCase;

class PayrollOperatorAndAuditTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingSeeder::class);
    }

    public function test_operator_name_appears_in_payslip_and_payroll_period_pdf_and_audits_are_recorded(): void
    {
        $tenant = Tenant::factory()->create(['name' => 'Empresa Teste Lda']);
        app(TenantManager::class)->set($tenant);

        $operator = User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Operador Carlos Silva',
            'is_active' => true,
        ]);
        $operator->assignRole('admin');

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);

        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 200000,
            'is_active' => true,
            'start_date' => '2026-01-01',
        ]);

        $this->actingAs($operator, 'sanctum');

        $deduction = Deduction::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'name' => 'Desconto Teste',
            'deduction_type' => 'other',
            'amount_type' => 'fixed',
            'amount' => 5000,
            'status' => 'active',
        ]);

        $this->assertDatabaseHas('audits', [
            'user_id' => $operator->id,
            'event' => 'created',
            'auditable_type' => Deduction::class,
            'auditable_id' => $deduction->id,
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process")
            ->assertOk();

        $record = PayrollRecord::query()->where('payroll_period_id', $period->id)->firstOrFail();

        $this->assertDatabaseHas('audits', [
            'user_id' => $operator->id,
            'event' => 'created',
            'auditable_type' => PayrollRecord::class,
            'auditable_id' => $record->id,
        ]);

        $this->assertSame($operator->id, $period->fresh()->processed_by);

        $record->loadMissing('employee', 'period.processedBy', 'period.approvedBy', 'approvedBy', 'tenant', 'contract.position', 'items');
        $period->loadMissing('tenant', 'processedBy', 'approvedBy', 'records.employee', 'records.contract.position', 'records.items.deduction');

        $payslipHtml = view('pdf.payslip', [
            'record' => $record,
            'operatorName' => $operator->name,
        ])->render();
        $sheetHtml = view('pdf.payroll-period', [
            'period' => $period,
            'operatorName' => $operator->name,
        ])->render();

        $this->assertStringContainsString('Operador / 操作员: Operador Carlos Silva', $payslipHtml);
        $this->assertStringContainsString('Operador: Operador Carlos Silva', $payslipHtml);
        $this->assertStringContainsString('Operador / 操作员: Operador Carlos Silva', $sheetHtml);
        $this->assertStringContainsString('Operador: Operador Carlos Silva', $sheetHtml);
        $this->assertStringContainsString('Recursos Humanos (RH)', $sheetHtml);
        $this->assertStringContainsString('人力资源部', $sheetHtml);
        $this->assertStringContainsString('A Empresa / Entidade Empregadora', $sheetHtml);
        $this->assertStringContainsString('公司 / 雇主签章', $sheetHtml);
        $this->assertStringContainsString('Empresa Teste Lda', $sheetHtml);

        $sheetPtHtml = view('pdf.payroll-period', [
            'period' => $period,
            'operatorName' => $operator->name,
            'lang' => 'pt',
            'isBilingual' => false,
        ])->render();
        $this->assertStringContainsString('Recursos Humanos (RH)', $sheetPtHtml);
        $this->assertStringContainsString('A Empresa / Entidade Empregadora', $sheetPtHtml);
        $this->assertStringNotContainsString('人力资源部', $sheetPtHtml);
    }

    public function test_bulk_payslips_pdf_generates_only_selected_employees_and_respects_tenant_and_period_isolation(): void
    {
        $tenant = Tenant::factory()->create(['name' => 'Empresa Bulk Lda']);
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Operador Lote',
            'is_active' => true,
        ]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        $employees = collect(['Ana Bulk', 'Bruno Bulk', 'Carlos Excluído'])->map(function (string $fullName) use ($tenant) {
            [$first, $last] = explode(' ', $fullName, 2);
            $emp = Employee::factory()->create([
                'tenant_id' => $tenant->id,
                'first_name' => $first,
                'last_name' => $last,
                'status' => 'active',
                'approval_status' => 'approved',
            ]);
            EmployeeContract::factory()->create([
                'tenant_id' => $tenant->id,
                'employee_id' => $emp->id,
                'base_salary' => 200000,
                'is_active' => true,
                'start_date' => '2026-01-01',
            ]);

            return $emp;
        });

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process")->assertOk();

        $records = PayrollRecord::query()
            ->where('payroll_period_id', $period->id)
            ->with('employee')
            ->get()
            ->keyBy('employee_id');

        $selectedIds = [
            $records[$employees[0]->id]->id,
            $records[$employees[1]->id]->id,
        ];

        $bulkResp = $this->postJson("/api/v1/payroll/periods/{$period->id}/payslips/bulk.pdf", [
            'record_ids' => $selectedIds,
            'lang' => 'bilingual',
            'disposition' => 'inline',
        ])->assertOk();

        $this->assertStringContainsString('application/pdf', (string) $bulkResp->headers->get('content-type'));

        $this->postJson("/api/v1/payroll/periods/{$period->id}/payslips/bulk.pdf", [
            'record_ids' => $selectedIds,
            'lang' => 'pt',
        ])->assertOk();

        $selectedRecords = PayrollRecord::query()
            ->whereIn('id', $selectedIds)
            ->with(['employee', 'period.processedBy', 'period.approvedBy', 'approvedBy', 'tenant', 'contract.position', 'items'])
            ->get();

        $bulkHtml = view('pdf.payslips-bulk', [
            'records' => $selectedRecords,
            'operatorName' => $admin->name,
        ])->render();

        $this->assertStringContainsString('Ana Bulk', $bulkHtml);
        $this->assertStringContainsString('Bruno Bulk', $bulkHtml);
        $this->assertStringNotContainsString('Carlos Excluído', $bulkHtml);
        $this->assertStringContainsString('page-break', $bulkHtml);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/payslips/bulk.pdf", [
            'record_ids' => [],
        ])->assertStatus(422);

        $otherTenant = Tenant::factory()->create();
        $otherPeriod = PayrollPeriod::create([
            'tenant_id' => $otherTenant->id,
            'name' => 'Outro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);
        $otherEmp = Employee::factory()->create(['tenant_id' => $otherTenant->id]);
        $otherRecord = PayrollRecord::create([
            'tenant_id' => $otherTenant->id,
            'payroll_period_id' => $otherPeriod->id,
            'employee_id' => $otherEmp->id,
            'base_salary' => 100000,
            'gross_salary' => 100000,
            'total_earnings' => 100000,
            'total_deductions' => 3000,
            'total_taxes' => 0,
            'net_salary' => 97000,
            'work_days' => 22,
            'absent_days' => 0,
            'overtime_hours' => 0,
            'overtime_amount' => 0,
            'status' => 'calculated',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/payslips/bulk.pdf", [
            'record_ids' => [$otherRecord->id],
        ])->assertStatus(422);
    }

    public function test_monthly_period_rejects_multi_month_range_and_shift_without_working_days_uses_weekdays(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'is_active' => true]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        // Reject > 31 days for monthly period (prevents 173-day accidental period)
        $this->postJson('/api/v1/payroll/periods', [
            'period_type' => 'monthly',
            'period_start' => '2026-01-01',
            'period_end' => '2026-08-31',
        ])->assertStatus(422);

        $employee = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 150000,
            'is_active' => true,
            'start_date' => '2026-01-01',
        ]);

        $shift = Shift::create([
            'tenant_id' => $tenant->id,
            'name' => 'Turno Padrão',
            'start_time' => '08:00',
            'end_time' => '17:00',
            'work_hours' => 8,
            'working_days' => null,
            'is_active' => true,
        ]);

        EmployeeSchedule::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'effective_from' => '2026-01-01',
            'is_active' => true,
            'assigned_by' => $admin->id,
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $record = app(PayrollEngineService::class)->calculateForEmployee($period, $employee);
        $this->assertSame(21.0, (float) $record->work_days);

        // Attendance resource exposes normal_hours (8h per Angola LGT)
        $att = AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'shift_id' => $shift->id,
            'date' => '2026-11-02',
            'status' => 'present',
            'late_minutes' => 0,
            'overtime_minutes' => 0,
        ]);

        $this->getJson('/api/v1/attendance')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $att->id)
            ->assertJsonPath('data.data.0.normal_hours', 8);
    }
}
