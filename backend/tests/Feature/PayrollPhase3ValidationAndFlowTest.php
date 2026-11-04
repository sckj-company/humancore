<?php

namespace Tests\Feature;

use App\Jobs\ProcessPayrollJob;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\SalaryComponent;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payroll\PayrollEngineService;
use App\Services\Payroll\PayrollValidationService;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Spatie\Permission\Models\Permission;
use Tests\TestCase;

class PayrollPhase3ValidationAndFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setupTenantWithAdmin(): array
    {
        $tenant = Tenant::factory()->create();

        Permission::findOrCreate('view_payroll', 'web');
        Permission::findOrCreate('process_payroll', 'web');
        Permission::findOrCreate('approve_payroll', 'web');
        Permission::findOrCreate('close_payroll', 'web');

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);
        $admin->givePermissionTo(['view_payroll', 'process_payroll', 'approve_payroll', 'close_payroll']);

        return [$tenant, $admin];
    }

    public function test_validation_service_detects_missing_contract_and_missing_tax_rules(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();

        $employee = Employee::factory()->for($tenant)->create(['status' => 'active']);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Maio/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-05-01',
            'period_end' => '2026-05-31',
            'status' => 'open',
        ]);

        $service = app(PayrollValidationService::class);
        $report = $service->validate($period);

        $this->assertFalse($report['is_valid']);
        $this->assertGreaterThanOrEqual(3, $report['blocking_count']);

        $errorCodes = array_column($report['errors'], 'code');
        $this->assertContains('MISSING_INSS_RULE', $errorCodes);
        $this->assertContains('MISSING_IRT_TABLE', $errorCodes);
        $this->assertContains('MISSING_CONTRACT', $errorCodes);
    }

    public function test_period_lifecycle_submit_reject_approve_close_reopen_and_pay(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        $periodStart = '2026-06-01';
        $periodEnd = '2026-06-30';

        PayrollInssRule::factory()->for($tenant)->create([
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $admin->id,
        ]);

        PayrollIrtTable::factory()->for($tenant)->create([
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $admin->id,
        ]);

        $employee = Employee::factory()->for($tenant)->create(['status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'start_date' => '2026-01-01',
            'end_date' => null,
            'is_active' => true,
            'base_salary' => 250000,
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Junho/2026',
            'period_type' => 'monthly',
            'period_start' => $periodStart,
            'period_end' => $periodEnd,
            'status' => 'completed',
        ]);

        PayrollRecord::create([
            'payroll_period_id' => $period->id,
            'employee_id' => $employee->id,
            'tenant_id' => $tenant->id,
            'base_salary' => 250000,
            'gross_salary' => 250000,
            'total_earnings' => 250000,
            'total_deductions' => 7500,
            'total_taxes' => 15000,
            'net_salary' => 227500,
            'work_days' => 22,
            'absent_days' => 0,
            'overtime_hours' => 0,
            'overtime_amount' => 0,
            'status' => 'calculated',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/submit")->assertOk();

        $this->assertEquals('pending_approval', $period->fresh()->status);
        $this->assertDatabaseHas('payroll_period_events', [
            'payroll_period_id' => $period->id,
            'event_type' => 'submitted',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/reject", [
            'reason' => 'Ajustar horas extras do departamento de logística',
        ])->assertOk();

        $this->assertEquals('pending_validation', $period->fresh()->status);
        $this->assertEquals('Ajustar horas extras do departamento de logística', $period->fresh()->rejection_reason);
        $this->assertDatabaseHas('payroll_period_events', [
            'payroll_period_id' => $period->id,
            'event_type' => 'rejected',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/submit")->assertOk();

        $this->postJson("/api/v1/payroll/periods/{$period->id}/approve")->assertOk();

        $freshPeriod = $period->fresh();
        $this->assertEquals('approved', $freshPeriod->status);
        $this->assertNotNull($freshPeriod->approved_at);
        $this->assertEquals($admin->id, $freshPeriod->approved_by);
        $this->assertNotNull($freshPeriod->totals_snapshot);
        $this->assertDatabaseHas('payroll_period_events', [
            'payroll_period_id' => $period->id,
            'event_type' => 'approved',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/close")->assertOk();
        $this->assertEquals('closed', $period->fresh()->status);
        $this->assertNotNull($period->fresh()->closed_at);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/reopen", [
            'reason' => 'Retificação legal solicitada pela auditoria',
        ])->assertOk();

        $reopened = $period->fresh();
        $this->assertEquals('open', $reopened->status);
        $this->assertNotNull($reopened->totals_snapshot, 'Reabertura deve preservar o totals_snapshot');
        $this->assertDatabaseHas('payroll_period_events', [
            'payroll_period_id' => $period->id,
            'event_type' => 'reopened',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/submit")->assertOk();

        $this->postJson("/api/v1/payroll/periods/{$period->id}/approve")->assertOk();

        $this->postJson("/api/v1/payroll/periods/{$period->id}/pay")->assertOk();

        $this->assertEquals('paid', $period->fresh()->status);
        $this->assertDatabaseHas('payroll_period_events', [
            'payroll_period_id' => $period->id,
            'event_type' => 'paid',
        ]);

        $eventsResp = $this->getJson("/api/v1/payroll/periods/{$period->id}/events")->assertOk();
        $this->assertGreaterThanOrEqual(7, count($eventsResp->json('data')));
    }

    public function test_submit_with_blocking_errors_returns_422(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        // Sem regras INSS/IRT e sem registos → validação falha
        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Julho/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-07-01',
            'period_end' => '2026-07-31',
            'status' => 'completed',
        ]);

        $response = $this->postJson("/api/v1/payroll/periods/{$period->id}/submit");
        $response->assertStatus(422);

        $this->assertEquals('completed', $period->fresh()->status);

        $data = $response->json('data') ?? $response->json();
        $this->assertNotEmpty($data);
    }

    public function test_approve_period_with_zero_records_returns_error(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Agosto/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-08-01',
            'period_end' => '2026-08-31',
            'status' => 'pending_approval',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/approve")
            ->assertStatus(422);

        $this->assertEquals('pending_approval', $period->fresh()->status);
    }

    public function test_invalid_state_transition_is_rejected(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Setembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-09-01',
            'period_end' => '2026-09-30',
            'status' => 'approved',
        ]);

        // Aprovar já aprovado → policy rejeita (403) antes da transição
        $this->postJson("/api/v1/payroll/periods/{$period->id}/approve")
            ->assertStatus(403);

        // Transição inválida via transitionTo (bypass policy com role admin)
        $period->update(['status' => 'paid']);
        $this->postJson("/api/v1/payroll/periods/{$period->id}/close")
            ->assertStatus(403);

        // Fechar um período em open não é permitido pela policy
        $period->update(['status' => 'open']);
        $this->postJson("/api/v1/payroll/periods/{$period->id}/close")
            ->assertStatus(403);
    }

    public function test_unregulated_active_component_returns_warning(): void
    {
        [$tenant] = $this->setupTenantWithAdmin();

        SalaryComponent::factory()->for($tenant)->create([
            'is_active' => true,
            'name' => 'Subsídio Transporte',
            'code' => 'TRANSP',
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Outubro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-10-01',
            'period_end' => '2026-10-31',
            'status' => 'open',
        ]);

        $report = app(PayrollValidationService::class)->validate($period);

        $warningCodes = array_column($report['warnings'], 'code');
        $this->assertContains('UNREGULATED_COMPONENT', $warningCodes);
        $this->assertGreaterThan(0, $report['warning_count']);
    }

    public function test_pending_leave_in_period_returns_warning(): void
    {
        [$tenant] = $this->setupTenantWithAdmin();

        $employee = Employee::factory()->for($tenant)->create(['status' => 'active']);

        $leaveType = LeaveType::create([
            'tenant_id' => $tenant->id,
            'name' => 'Férias',
            'code' => 'vacation',
            'category' => 'vacation',
            'days_per_year' => 22,
            'is_paid' => true,
            'is_active' => true,
        ]);

        LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $leaveType->id,
            'start_date' => '2026-11-10',
            'end_date' => '2026-11-14',
            'total_days' => 5,
            'status' => 'pending',
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $report = app(PayrollValidationService::class)->validate($period);

        $warningCodes = array_column($report['warnings'], 'code');
        $this->assertContains('PENDING_LEAVES', $warningCodes);
    }

    public function test_process_job_skips_when_lock_held_and_status_not_processable(): void
    {
        [$tenant] = $this->setupTenantWithAdmin();

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Dezembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-12-01',
            'period_end' => '2026-12-31',
            'status' => 'paid',
        ]);

        // Lock já detido por outra operação → block() lança LockTimeoutException
        $lock = Cache::lock("payroll:period:{$period->id}", 3600);
        $this->assertTrue($lock->get());

        try {
            $job = new ProcessPayrollJob($period->id);
            $this->expectException(LockTimeoutException::class);
            $job->handle(app(PayrollEngineService::class));
        } finally {
            $lock->release();
        }
    }

    public function test_process_job_is_idempotent_for_paid_period(): void
    {
        [$tenant] = $this->setupTenantWithAdmin();

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Janeiro/2027',
            'period_type' => 'monthly',
            'period_start' => '2027-01-01',
            'period_end' => '2027-01-31',
            'status' => 'paid',
        ]);

        // Estado não processável → o job sai sem alterar o período
        (new ProcessPayrollJob($period->id))->handle(app(PayrollEngineService::class));

        $this->assertEquals('paid', $period->fresh()->status);
        $this->assertEquals(0, $period->records()->count());
    }

    public function test_year_long_inss_and_irt_rules_cover_all_periods_of_the_year(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();

        PayrollInssRule::factory()->for($tenant)->create([
            'effective_from' => '2026-01-01',
            'effective_to' => '2026-12-31',
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $admin->id,
        ]);

        PayrollIrtTable::factory()->for($tenant)->create([
            'effective_from' => '2026-01-01',
            'effective_to' => '2026-12-31',
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $admin->id,
        ]);

        $employee = Employee::factory()->for($tenant)->create(['status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'start_date' => '2026-01-01',
            'end_date' => null,
            'is_active' => true,
            'base_salary' => 300000,
        ]);

        $service = app(PayrollValidationService::class);

        foreach ([
            ['2026-02-01', '2026-02-28'],
            ['2026-06-01', '2026-06-30'],
            ['2026-11-01', '2026-11-30'],
        ] as [$start, $end]) {
            $period = PayrollPeriod::create([
                'tenant_id' => $tenant->id,
                'name' => "Período {$start}",
                'period_type' => 'monthly',
                'period_start' => $start,
                'period_end' => $end,
                'status' => 'open',
            ]);

            $report = $service->validate($period);
            $errorCodes = array_column($report['errors'], 'code');

            $this->assertNotContains('MISSING_INSS_RULE', $errorCodes, "Regra anual deve cobrir período {$start}");
            $this->assertNotContains('MISSING_IRT_TABLE', $errorCodes, "Tabela anual deve cobrir período {$start}");
        }
    }

    public function test_expired_contract_is_warning_not_blocking_and_excluded_from_processing(): void
    {
        [$tenant] = $this->setupTenantWithAdmin();

        $expiredEmployee = Employee::factory()->for($tenant)->create(['status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $expiredEmployee->id,
            'start_date' => '2025-01-01',
            'end_date' => now()->subDays(10)->toDateString(),
            'is_active' => true,
            'base_salary' => 200000,
        ]);

        $activeEmployee = Employee::factory()->for($tenant)->create(['status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $activeEmployee->id,
            'start_date' => '2026-01-01',
            'end_date' => null,
            'is_active' => true,
            'base_salary' => 400000,
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $report = app(PayrollValidationService::class)->validate($period);
        $warningCodes = array_column($report['warnings'], 'code');
        $errorCodes = array_column($report['errors'], 'code');

        $this->assertContains('EXPIRED_CONTRACT', $warningCodes);
        $this->assertNotContains('MISSING_CONTRACT', $errorCodes);
        $this->assertTrue($report['is_valid'] || ! in_array('MISSING_CONTRACT', $errorCodes, true));

        $engine = app(PayrollEngineService::class);
        $result = $engine->processPeriod($period);

        $this->assertSame(1, $result['processed'], 'Apenas o funcionário com contrato válido deve ser processado');
        $this->assertDatabaseMissing('payroll_records', [
            'payroll_period_id' => $period->id,
            'employee_id' => $expiredEmployee->id,
        ]);
        $this->assertDatabaseHas('payroll_records', [
            'payroll_period_id' => $period->id,
            'employee_id' => $activeEmployee->id,
        ]);
        $this->assertSame('pending_validation', $period->fresh()->status);
        $this->assertFalse($expiredEmployee->fresh()->contracts()->where('is_active', true)->exists());
    }

    public function test_deactivate_expired_contracts_command_does_not_change_employee_status(): void
    {
        [$tenant] = $this->setupTenantWithAdmin();

        $employee = Employee::factory()->for($tenant)->create(['status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'start_date' => '2025-06-01',
            'end_date' => now()->subDay()->toDateString(),
            'is_active' => true,
        ]);

        $this->artisan('humancore:deactivate-expired-contracts')->assertSuccessful();

        $this->assertFalse($employee->contracts()->first()->is_active);
        $this->assertSame('active', $employee->fresh()->status);
    }

    public function test_employee_without_contract_still_blocks_processing(): void
    {
        [$tenant] = $this->setupTenantWithAdmin();

        Employee::factory()->for($tenant)->create(['status' => 'active']);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Dezembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-12-01',
            'period_end' => '2026-12-31',
            'status' => 'open',
        ]);

        $report = app(PayrollValidationService::class)->validate($period);
        $errorCodes = array_column($report['errors'], 'code');

        $this->assertContains('MISSING_CONTRACT', $errorCodes);
        $this->assertFalse($report['is_valid']);
    }

    public function test_no_records_is_warning_not_error(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Janeiro/2027',
            'period_type' => 'monthly',
            'period_start' => '2027-01-01',
            'period_end' => '2027-01-31',
            'status' => 'open',
        ]);

        $report = app(PayrollValidationService::class)->validate($period);
        $warningCodes = array_column($report['warnings'], 'code');
        $errorCodes = array_column($report['errors'], 'code');

        $this->assertContains('NO_RECORDS', $warningCodes);
        $this->assertNotContains('NO_RECORDS', $errorCodes);
    }

    public function test_process_endpoint_excludes_expired_contract_and_exposes_progress(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        $expiredEmployee = Employee::factory()->for($tenant)->create(['status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $expiredEmployee->id,
            'start_date' => '2025-01-01',
            'end_date' => now()->subDays(5)->toDateString(),
            'is_active' => true,
            'base_salary' => 150000,
        ]);

        $activeEmployee = Employee::factory()->for($tenant)->create(['status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $activeEmployee->id,
            'start_date' => '2026-01-01',
            'end_date' => null,
            'is_active' => true,
            'base_salary' => 350000,
        ]);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $processable = $this->getJson("/api/v1/payroll/periods/{$period->id}/processable-employees")
            ->assertOk()
            ->json('data');

        $byId = collect($processable)->keyBy('id');
        $this->assertTrue($byId[$activeEmployee->id]['eligible']);
        $this->assertFalse($byId[$activeEmployee->id]['is_contract_expired']);
        $this->assertTrue($byId[$expiredEmployee->id]['is_contract_expired']);
        $this->assertFalse($byId[$expiredEmployee->id]['eligible']);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process", [
            'employee_ids' => [$activeEmployee->id],
        ])->assertOk()->assertJsonPath('data.processed', 1);

        $progress = $this->getJson("/api/v1/payroll/periods/{$period->id}/progress")
            ->assertOk()
            ->json('data');

        $this->assertSame(1, $progress['progress_total']);
        $this->assertSame(1, $progress['progress_done']);
        $this->assertNotEmpty($progress['progress_message']);
        $this->assertDatabaseMissing('payroll_records', [
            'payroll_period_id' => $period->id,
            'employee_id' => $expiredEmployee->id,
        ]);
        $this->assertDatabaseHas('payroll_records', [
            'payroll_period_id' => $period->id,
            'employee_id' => $activeEmployee->id,
        ]);
    }

    public function test_process_endpoint_rejects_empty_employee_ids(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Fevereiro/2027',
            'period_type' => 'monthly',
            'period_start' => '2027-02-01',
            'period_end' => '2027-02-28',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process", [
            'employee_ids' => [],
        ])->assertUnprocessable();
    }
}
