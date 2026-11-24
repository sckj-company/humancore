<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Audit;
use App\Models\Benefit;
use App\Models\Branch;
use App\Models\Candidate;
use App\Models\Deduction;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeAsset;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Models\EmployeeEducation;
use App\Models\EmployeeLatenessEvent;
use App\Models\EmployeeSchedule;
use App\Models\JobOpening;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\OnboardingTask;
use App\Models\OnboardingTemplate;
use App\Models\PayrollPeriod;
use App\Models\PayrollPeriodReport;
use App\Models\PayrollPeriodReportDocument;
use App\Models\PayrollRecord;
use App\Models\PayrollRecordItem;
use App\Models\PerformanceEvaluation;
use App\Models\Plan;
use App\Models\Position;
use App\Models\Shift;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPayment;
use App\Models\Tenant;
use App\Models\TenantMonthlyUsage;
use App\Models\TenantRelationship;
use App\Models\TenantSubscription;
use App\Models\Training;
use App\Models\TrainingAssignment;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ExecutiveDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_non_super_admin_cannot_access_executive_dashboard(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'is_active' => true]);
        $admin->assignRole('admin');

        $employee = User::factory()->create(['tenant_id' => $tenant->id, 'is_active' => true]);
        $employee->assignRole('employee');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/superadmin/executive-dashboard')
            ->assertForbidden();

        $this->actingAs($employee, 'sanctum')
            ->getJson('/api/v1/superadmin/executive-dashboard')
            ->assertForbidden();

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/superadmin/executive-dashboard/companies/{$tenant->id}")
            ->assertForbidden();
    }

    public function test_super_admin_receives_consolidated_data_across_all_8_areas_and_multiple_tenants(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        $plan = Plan::query()->create([
            'name' => 'Enterprise Plus',
            'slug' => 'enterprise-plus',
            'currency' => 'AOA',
            'base_price' => 150000,
            'features' => ['payroll' => true],
            'limits' => ['max_employees' => 500],
            'agency_config' => ['can_manage_other_tenants' => true],
            'is_active' => true,
        ]);

        // Tenant 1
        $t1 = Tenant::factory()->create(['name' => 'Alpha Angola', 'status' => 'active', 'province' => 'Luanda']);
        $sub1 = TenantSubscription::query()->create([
            'tenant_id' => $t1->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now()->subMonth(),
            'ends_at' => now()->addDays(15),
        ]);

        $branch1 = Branch::factory()->create(['tenant_id' => $t1->id, 'name' => 'Sede Luanda', 'is_headquarter' => true]);
        $dept1 = Department::factory()->create(['tenant_id' => $t1->id, 'branch_id' => $branch1->id, 'name' => 'Tecnologia']);
        $pos1 = Position::factory()->create(['tenant_id' => $t1->id, 'department_id' => $dept1->id, 'title' => 'Engenheiro']);
        $shift1 = Shift::query()->create([
            'tenant_id' => $t1->id,
            'name' => 'Turno Dia',
            'code' => 'TD-1',
            'start_time' => '08:00:00',
            'end_time' => '17:00:00',
            'work_hours' => 8,
            'working_days' => [1, 2, 3, 4, 5],
            'is_active' => true,
        ]);

        $emp1 = Employee::factory()->create([
            'tenant_id' => $t1->id,
            'department_id' => $dept1->id,
            'position_id' => $pos1->id,
            'first_name' => 'Ana',
            'last_name' => 'Silva',
            'status' => 'active',
            'approval_status' => 'approved',
            'hired_at' => now()->subMonths(6)->toDateString(),
            'birth_date' => now()->addDays(5)->subYears(28)->toDateString(),
        ]);
        $emp1Pending = Employee::factory()->create([
            'tenant_id' => $t1->id,
            'department_id' => $dept1->id,
            'status' => 'active',
            'approval_status' => 'pending',
            'hired_at' => now()->toDateString(),
        ]);
        // Soft-deleted employee must NOT be counted
        $emp1Deleted = Employee::factory()->create([
            'tenant_id' => $t1->id,
            'department_id' => $dept1->id,
            'status' => 'active',
            'approval_status' => 'approved',
        ]);
        $emp1Deleted->delete();

        EmployeeSchedule::query()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'shift_id' => $shift1->id,
            'effective_from' => now()->subMonth()->toDateString(),
            'is_active' => true,
        ]);

        $contract1 = EmployeeContract::factory()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'position_id' => $pos1->id,
            'department_id' => $dept1->id,
            'base_salary' => 500000,
            'contract_type' => 'fixed_term',
            'end_date' => now()->addDays(15)->toDateString(),
            'is_active' => true,
        ]);

        AttendanceRecord::query()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'shift_id' => $shift1->id,
            'date' => now()->toDateString(),
            'status' => 'late',
            'total_worked' => 480,
            'late_minutes' => 25,
            'overtime_minutes' => 60,
            'overtime_amount' => 5000,
        ]);
        EmployeeLatenessEvent::query()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'event_key' => 'late-1',
            'event_type' => 'late',
            'occurred_on' => now()->toDateString(),
            'week_start' => now()->startOfWeek()->toDateString(),
            'minutes' => 25,
            'amount' => 0,
        ]);

        $leaveType1 = LeaveType::query()->create([
            'tenant_id' => $t1->id,
            'name' => 'Férias Anuais',
            'code' => 'FER',
            'category' => 'vacation',
            'days_per_year' => 22,
            'is_paid' => true,
            'is_active' => true,
        ]);
        LeaveRequest::query()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'leave_type_id' => $leaveType1->id,
            'occurrence_type' => 'vacation',
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addDays(7)->toDateString(),
            'total_days' => 3,
            'status' => 'pending',
        ]);

        $period1 = PayrollPeriod::query()->create([
            'tenant_id' => $t1->id,
            'name' => 'Folha Atual',
            'period_type' => 'monthly',
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'status' => 'approved',
        ]);
        $record1 = PayrollRecord::query()->create([
            'tenant_id' => $t1->id,
            'payroll_period_id' => $period1->id,
            'employee_id' => $emp1->id,
            'contract_id' => $contract1->id,
            'base_salary' => 500000,
            'gross_salary' => 600000,
            'total_earnings' => 600000,
            'total_deductions' => 18000,
            'total_taxes' => 45000,
            'net_salary' => 537000,
            'inss_base' => 600000,
            'employer_inss_base' => 600000,
            'employer_inss' => 48000,
            'irt_taxable_base' => 582000,
            'employer_cost' => 648000,
            'overtime_hours' => 1,
            'overtime_amount' => 5000,
            'status' => 'approved',
            'is_outdated' => true,
        ]);
        PayrollRecordItem::query()->create([
            'tenant_id' => $t1->id,
            'payroll_record_id' => $record1->id,
            'code' => 'inss',
            'name' => 'INSS Trabalhador',
            'category' => 'tax',
            'rate' => 3,
            'amount' => -18000,
        ]);
        PayrollRecordItem::query()->create([
            'tenant_id' => $t1->id,
            'payroll_record_id' => $record1->id,
            'code' => 'employer_inss',
            'name' => 'INSS Entidade Patronal',
            'category' => 'employer_contribution',
            'rate' => 8,
            'amount' => 48000,
        ]);
        PayrollRecordItem::query()->create([
            'tenant_id' => $t1->id,
            'payroll_record_id' => $record1->id,
            'code' => 'irt',
            'name' => 'IRT',
            'category' => 'tax',
            'amount' => -45000,
        ]);

        $report1 = PayrollPeriodReport::query()->create([
            'tenant_id' => $t1->id,
            'payroll_period_id' => $period1->id,
            'inss_payment_proof_sent' => true,
            'inss_paid' => true,
            'is_summary_complete' => true,
        ]);
        PayrollPeriodReportDocument::query()->create([
            'tenant_id' => $t1->id,
            'payroll_period_report_id' => $report1->id,
            'document_type' => 'inss_payment_proof',
            'title' => 'Comprovativo INSS',
            'file_path' => 'proofs/inss.pdf',
            'file_name' => 'inss.pdf',
            'is_paid' => true,
            'is_sent' => true,
        ]);

        Benefit::factory()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'amount_type' => 'fixed',
            'amount' => 25000,
            'status' => 'active',
        ]);
        Deduction::factory()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'deduction_type' => 'loan',
            'amount_type' => 'fixed',
            'amount' => 10000,
            'total_amount' => 50000,
            'paid_amount' => 10000,
            'status' => 'active',
            'approved_at' => null,
        ]);

        EmployeeDocument::factory()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'is_verified' => false,
            'expiry_date' => now()->subDay()->toDateString(),
        ]);
        EmployeeEducation::query()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'title' => 'Advertência Escrita',
            'reason' => 'Atraso recorrente',
            'occurred_on' => now()->toDateString(),
            'signed_document_path' => null,
        ]);
        EmployeeAsset::query()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'name' => 'MacBook Pro',
            'category' => 'computer',
            'status' => 'damaged_pending',
            'estimated_value' => 900000,
            'chargeable_amount' => 450000,
            'expected_return_at' => now()->subDays(2)->toDateString(),
        ]);

        $job1 = JobOpening::factory()->open()->create([
            'tenant_id' => $t1->id,
            'openings_count' => 2,
        ]);
        Candidate::factory()->forJob($job1)->create(['status' => 'interview']);
        PerformanceEvaluation::factory()->submitted()->create([
            'tenant_id' => $t1->id,
            'employee_id' => $emp1->id,
            'score' => 4.5,
        ]);
        $training1 = Training::factory()->inProgress()->create([
            'tenant_id' => $t1->id,
            'cost' => 120000,
            'start_date' => now()->toDateString(),
        ]);
        TrainingAssignment::query()->create([
            'tenant_id' => $t1->id,
            'training_id' => $training1->id,
            'employee_id' => $emp1->id,
            'status' => 'completed',
            'completed_at' => now(),
        ]);
        $tpl1 = OnboardingTemplate::query()->create(['tenant_id' => $t1->id, 'name' => 'Base', 'is_active' => true]);
        OnboardingTask::factory()->create([
            'tenant_id' => $t1->id,
            'template_id' => $tpl1->id,
            'employee_id' => $emp1->id,
            'status' => 'pending',
            'due_date' => now()->subDays(3)->toDateString(),
        ]);

        $inv1 = SubscriptionInvoice::query()->create([
            'invoice_number' => 'INV-2026-0001',
            'tenant_id' => $t1->id,
            'subscription_id' => $sub1->id,
            'plan_id' => $plan->id,
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'due_date' => now()->subDays(2)->toDateString(),
            'currency' => 'AOA',
            'subtotal' => 150000,
            'total_amount' => 150000,
            'line_items' => [],
            'status' => 'open',
        ]);
        SubscriptionPayment::query()->create([
            'invoice_id' => $inv1->id,
            'tenant_id' => $t1->id,
            'amount' => 150000,
            'currency' => 'AOA',
            'payment_method' => 'bank_transfer',
            'payment_date' => now()->toDateString(),
            'status' => 'pending',
        ]);
        TenantMonthlyUsage::query()->create([
            'tenant_id' => $t1->id,
            'year_month' => now()->format('Y-m'),
            'ocr_requests' => 12,
            'payroll_runs' => 3,
        ]);

        // Tenant 2
        $t2 = Tenant::factory()->create(['name' => 'Beta Benguela', 'status' => 'suspended', 'province' => 'Benguela']);
        TenantSubscription::query()->create([
            'tenant_id' => $t2->id,
            'plan_id' => $plan->id,
            'status' => 'grace_period',
            'starts_at' => now()->subMonths(2),
            'ends_at' => now()->subDays(1),
            'grace_until' => now()->addDays(4),
        ]);
        TenantRelationship::query()->create([
            'manager_tenant_id' => $t1->id,
            'managed_tenant_id' => $t2->id,
            'relationship_type' => 'holding',
            'status' => 'active',
            'accepted_at' => now()->subMonth(),
        ]);

        $dept2 = Department::factory()->create(['tenant_id' => $t2->id, 'name' => 'Operações']);
        $emp2 = Employee::factory()->create([
            'tenant_id' => $t2->id,
            'department_id' => $dept2->id,
            'status' => 'active',
            'approval_status' => 'approved',
        ]);
        EmployeeContract::factory()->create([
            'tenant_id' => $t2->id,
            'employee_id' => $emp2->id,
            'department_id' => $dept2->id,
            'base_salary' => 300000,
            'is_active' => true,
            'end_date' => now()->subDays(5)->toDateString(),
        ]);
        $leaveType2 = LeaveType::query()->create([
            'tenant_id' => $t2->id,
            'name' => 'Licença Médica',
            'code' => 'MED',
            'category' => 'sick',
            'days_per_year' => 10,
            'is_paid' => true,
            'is_active' => true,
        ]);
        LeaveRequest::query()->create([
            'tenant_id' => $t2->id,
            'employee_id' => $emp2->id,
            'leave_type_id' => $leaveType2->id,
            'occurrence_type' => 'absence',
            'start_date' => now()->subDay()->toDateString(),
            'end_date' => now()->addDay()->toDateString(),
            'total_days' => 3,
            'status' => 'approved',
        ]);
        AttendanceRecord::query()->create([
            'tenant_id' => $t2->id,
            'employee_id' => $emp2->id,
            'date' => now()->toDateString(),
            'status' => 'absent',
            'deduct_from_salary' => true,
        ]);
        PayrollPeriod::query()->create([
            'tenant_id' => $t2->id,
            'name' => 'Folha Pendente T2',
            'period_type' => 'monthly',
            'period_start' => now()->startOfMonth()->toDateString(),
            'period_end' => now()->endOfMonth()->toDateString(),
            'status' => 'pending_approval',
        ]);

        Audit::query()->create([
            'user_id' => $superAdmin->id,
            'tenant_id' => $t1->id,
            'event' => 'updated',
            'auditable_type' => PayrollPeriod::class,
            'auditable_id' => $period1->id,
            'ip_address' => '127.0.0.1',
            'created_at' => now(),
        ]);

        // Set tenant context to T1 before request (simulating SetTenantContext) to verify cross-tenant aggregation still sees T2
        app(TenantManager::class)->set($t1);

        $response = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/executive-dashboard?year='.now()->year.'&month='.now()->month);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.meta.cached', false)
            ->assertJsonPath('data.meta.scope.tenants_count', 2)
            ->assertJsonPath('data.summary.companies_total', 2)
            ->assertJsonPath('data.summary.companies_active', 1)
            ->assertJsonPath('data.summary.companies_suspended', 1)
            ->assertJsonPath('data.summary.employees_total', 3)
            ->assertJsonPath('data.summary.employees_active', 3)
            ->assertJsonPath('data.summary.present_today', 1)
            ->assertJsonPath('data.summary.late_today', 1)
            ->assertJsonPath('data.summary.absent_today', 1)
            ->assertJsonPath('data.summary.on_leave_today', 1)
            ->assertJsonPath('data.summary.monthly_base_payroll', 800000)
            ->assertJsonPath('data.summary.period_gross_payroll', 600000)
            ->assertJsonPath('data.summary.period_net_payroll', 537000)
            ->assertJsonPath('data.summary.period_employer_cost', 648000)
            ->assertJsonPath('data.summary.pending_payments_count', 1)
            ->assertJsonPath('data.alerts.pending_approvals.payroll_periods', 1)
            ->assertJsonPath('data.alerts.pending_approvals.leave_requests', 1)
            ->assertJsonPath('data.alerts.pending_approvals.employees', 1)
            ->assertJsonPath('data.alerts.pending_approvals.deductions', 1)
            ->assertJsonPath('data.alerts.pending_approvals.performance_evaluations', 1)
            ->assertJsonPath('data.alerts.pending_approvals.subscription_payments', 1)
            ->assertJsonPath('data.alerts.pending_approvals.total', 6)
            ->assertJsonPath('data.alerts.operational_risks.contracts_expiring_30d', 1)
            ->assertJsonPath('data.alerts.operational_risks.contracts_expired_still_active', 1)
            ->assertJsonPath('data.alerts.operational_risks.employees_without_shift', 1)
            ->assertJsonPath('data.alerts.operational_risks.outdated_payroll_records', 1)
            ->assertJsonPath('data.alerts.operational_risks.unverified_documents', 1)
            ->assertJsonPath('data.alerts.operational_risks.expired_documents', 1)
            ->assertJsonPath('data.alerts.operational_risks.unsigned_warnings', 1)
            ->assertJsonPath('data.alerts.operational_risks.overdue_onboarding_tasks', 1)
            ->assertJsonPath('data.alerts.operational_risks.damaged_or_lost_assets', 1)
            ->assertJsonPath('data.alerts.operational_risks.overdue_invoices', 1)
            ->assertJsonPath('data.alerts.operational_risks.suspended_tenants', 1)
            ->assertJsonPath('data.alerts.operational_risks.grace_period_tenants', 1)
            ->assertJsonPath('data.workforce.kpis.total_employees', 3)
            ->assertJsonPath('data.workforce.kpis.on_leave_employees', 1)
            ->assertJsonPath('data.workforce.kpis.branches_count', 1)
            ->assertJsonPath('data.workforce.kpis.departments_count', 2)
            ->assertJsonPath('data.payroll.kpis.total_inss', 66000)
            ->assertJsonPath('data.payroll.kpis.total_irt', 45000)
            ->assertJsonPath('data.payroll.kpis.inss_paid_periods_count', 1)
            ->assertJsonPath('data.payroll.benefits_summary.monthly_fixed_total', 25000)
            ->assertJsonPath('data.payroll.deductions_summary.remaining_amount', 40000)
            ->assertJsonPath('data.attendance.period_summary.deductible_absences_count', 1)
            ->assertJsonPath('data.attendance.period_summary.lateness_events_count', 1)
            ->assertJsonPath('data.leaves.kpis.on_leave_today_count', 1)
            ->assertJsonPath('data.compliance.assets.pending_liability_total', 450000)
            ->assertJsonPath('data.talent.recruitment.open_jobs_count', 1)
            ->assertJsonPath('data.talent.performance.average_score', 4.5)
            ->assertJsonPath('data.talent.trainings.completion_rate', 100)
            ->assertJsonPath('data.talent.onboarding.overdue_count', 1)
            ->assertJsonPath('data.saas.billing.open_total', 150000)
            ->assertJsonPath('data.saas.usage.ocr_requests_this_month', 12)
            ->assertJsonPath('data.saas.usage.active_agency_relationships', 1)
            ->assertJsonCount(2, 'data.companies');

        $this->assertNotEmpty($response->json('data.audit.recent'));
    }

    public function test_include_parameter_returns_only_requested_sections_and_rejects_invalid_section(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');
        Tenant::factory()->create();

        $partial = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/executive-dashboard?include=alerts,workforce');

        $partial->assertOk()
            ->assertJsonStructure([
                'data' => ['meta', 'summary', 'alerts', 'workforce'],
            ]);

        $data = $partial->json('data');
        $this->assertArrayNotHasKey('payroll', $data);
        $this->assertArrayNotHasKey('saas', $data);
        $this->assertArrayNotHasKey('audit', $data);

        $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/executive-dashboard?include=alerts,nonexistent_block')
            ->assertStatus(422)
            ->assertJsonValidationErrors(['include']);
    }

    public function test_tenant_ids_filter_company_drilldown_and_scoped_super_admin_limited(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        $t1 = Tenant::factory()->create(['name' => 'Empresa Um']);
        $t2 = Tenant::factory()->create(['name' => 'Empresa Dois']);

        Employee::factory()->create(['tenant_id' => $t1->id, 'status' => 'active']);
        Employee::factory()->count(2)->create(['tenant_id' => $t2->id, 'status' => 'active']);

        $this->actingAs($superAdmin, 'sanctum')
            ->getJson("/api/v1/superadmin/executive-dashboard?tenant_ids={$t1->id}")
            ->assertOk()
            ->assertJsonPath('data.summary.companies_total', 1)
            ->assertJsonPath('data.summary.employees_total', 1)
            ->assertJsonCount(1, 'data.companies');

        $this->actingAs($superAdmin, 'sanctum')
            ->getJson("/api/v1/superadmin/executive-dashboard/companies/{$t2->id}")
            ->assertOk()
            ->assertJsonPath('data.summary.companies_total', 1)
            ->assertJsonPath('data.summary.employees_total', 2)
            ->assertJsonPath('data.company_profile.id', $t2->id)
            ->assertJsonPath('data.company_profile.name', 'Empresa Dois');

        // Scoped super-admin-limited only sees assigned tenant
        Role::firstOrCreate(['name' => 'super-admin-limited', 'guard_name' => 'web']);
        $limited = User::factory()->create(['is_active' => true]);
        $limited->assignRole('super-admin-limited');
        $limited->givePermissionTo('view_any_tenant');
        UserTenantAccess::query()->create([
            'user_id' => $limited->id,
            'tenant_id' => $t1->id,
            'is_active' => true,
        ]);

        $this->actingAs($limited, 'sanctum')
            ->getJson('/api/v1/superadmin/executive-dashboard')
            ->assertOk()
            ->assertJsonPath('data.summary.companies_total', 1)
            ->assertJsonPath('data.companies.0.id', $t1->id);

        $this->actingAs($limited, 'sanctum')
            ->getJson("/api/v1/superadmin/executive-dashboard/companies/{$t2->id}")
            ->assertForbidden();
    }

    public function test_dedicated_artisan_token_command_and_sanctum_ability_enforcement(): void
    {
        $superAdmin = User::factory()->create([
            'email' => 'boss@humancore.ao',
            'is_active' => true,
        ]);
        $superAdmin->assignRole('super-admin');
        Tenant::factory()->create();

        $exitCode = Artisan::call('executive-dashboard:token', [
            '--email' => 'boss@humancore.ao',
            '--name' => 'BossDashboard',
            '--expires-days' => 30,
        ]);
        $this->assertSame(0, $exitCode);

        $output = Artisan::output();
        preg_match('/(\d+\|[A-Za-z0-9]+)/', $output, $matches);
        $this->assertNotEmpty($matches[1] ?? null, 'Token was not output by executive-dashboard:token');
        $plainToken = $matches[1];

        $this->withHeader('Authorization', 'Bearer '.$plainToken)
            ->getJson('/api/v1/superadmin/executive-dashboard?include=alerts')
            ->assertOk()
            ->assertJsonPath('success', true);

        // Reset in-memory auth guard cache between Bearer token requests in the same test
        $this->app['auth']->forgetGuards();

        // Token without executive-dashboard:read ability must be rejected
        $restrictedToken = $superAdmin->createToken('OtherScope', ['other:scope'])->plainTextToken;
        $this->withHeader('Authorization', 'Bearer '.$restrictedToken)
            ->getJson('/api/v1/superadmin/executive-dashboard?include=alerts')
            ->assertForbidden();
    }

    public function test_cache_and_fresh_query_param(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');
        Tenant::factory()->create();

        $url = '/api/v1/superadmin/executive-dashboard?include=alerts';

        $this->actingAs($superAdmin, 'sanctum')
            ->getJson($url)
            ->assertOk()
            ->assertJsonPath('data.meta.cached', false);

        $this->actingAs($superAdmin, 'sanctum')
            ->getJson($url)
            ->assertOk()
            ->assertJsonPath('data.meta.cached', true);

        $this->actingAs($superAdmin, 'sanctum')
            ->getJson($url.'&fresh=1')
            ->assertOk()
            ->assertJsonPath('data.meta.cached', false);
    }
}
