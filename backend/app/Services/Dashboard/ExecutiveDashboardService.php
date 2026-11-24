<?php

namespace App\Services\Dashboard;

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
use App\Models\OnboardingTask;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\PerformanceEvaluation;
use App\Models\Position;
use App\Models\SubscriptionInvoice;
use App\Models\SubscriptionPayment;
use App\Models\Tenant;
use App\Models\TenantMonthlyUsage;
use App\Models\TenantRelationship;
use App\Models\TenantSubscription;
use App\Models\Training;
use App\Models\TrainingAssignment;
use App\Models\User;
use App\Scopes\TenantScope;
use App\Services\Payroll\CompanyPayrollDossierService;
use App\Services\Tenant\TenantManager;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ExecutiveDashboardService
{
    public const SECTIONS = [
        'alerts',
        'workforce',
        'payroll',
        'attendance',
        'leaves',
        'compliance',
        'talent',
        'saas',
        'audit',
        'companies',
    ];

    public const CRITICAL_AUDIT_MODELS = [
        PayrollPeriod::class,
        PayrollRecord::class,
        EmployeeContract::class,
        Employee::class,
        Tenant::class,
        TenantSubscription::class,
        SubscriptionPayment::class,
        SubscriptionInvoice::class,
        User::class,
        Deduction::class,
        LeaveRequest::class,
        EmployeeEducation::class,
    ];

    public function __construct(
        private readonly TenantManager $tenantManager,
        private readonly CompanyPayrollDossierService $dossierService,
    ) {}

    /**
     * Resolve custom date range or periodicity range for the executive dashboard.
     *
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function resolveDateRange(array $params): array
    {
        if (! empty($params['start_date']) || ! empty($params['end_date'])) {
            $end = ! empty($params['end_date'])
                ? Carbon::parse((string) $params['end_date'])->startOfDay()
                : Carbon::today()->startOfDay();
            $start = ! empty($params['start_date'])
                ? Carbon::parse((string) $params['start_date'])->startOfDay()
                : $end->copy()->subDays(30)->startOfDay();

            if ($start->gt($end)) {
                [$start, $end] = [$end->copy(), $start->copy()];
            }

            return [
                'periodicity' => 'custom',
                'year' => (int) $end->year,
                'month' => (int) $end->month,
                'quarter' => null,
                'semester' => null,
                'start' => $start,
                'end' => $end,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'label' => $start->format('d/m/Y').' — '.$end->format('d/m/Y'),
                'label_zh' => $start->format('Y-m-d').' ~ '.$end->format('Y-m-d'),
                'code' => $start->format('Ymd').'-'.$end->format('Ymd'),
            ];
        }

        return $this->dossierService->resolvePeriodRange(
            periodicity: (string) ($params['periodicity'] ?? 'monthly'),
            year: isset($params['year']) ? (int) $params['year'] : (int) now()->year,
            month: isset($params['month']) ? (int) $params['month'] : (int) now()->month,
            quarter: isset($params['quarter']) ? (int) $params['quarter'] : null,
            semester: isset($params['semester']) ? (int) $params['semester'] : null,
        );
    }

    /**
     * Build the consolidated Super-Admin Executive Dashboard payload.
     *
     * @param  Collection<int, Tenant>  $tenants
     * @param  array<string, mixed>  $range
     * @param  array<int, string>  $sections
     * @param  array<string, mixed>  $options
     * @return array<string, mixed>
     */
    public function build(Collection $tenants, array $range, array $sections = [], array $options = []): array
    {
        $activeSections = $this->normalizeSections($sections);
        $limit = max(1, min(100, (int) ($options['limit'] ?? 15)));
        $auditScope = ($options['audit_scope'] ?? 'critical') === 'all' ? 'all' : 'critical';
        $auditDetails = (bool) ($options['audit_details'] ?? false);

        $previousTenant = $this->tenantManager->get();
        $this->tenantManager->clear();

        try {
            $tenantIds = $tenants->pluck('id')->map(fn ($id) => (int) $id)->values()->all();
            $tenantMap = $tenants->keyBy('id');

            $startDay = $range['start']->copy()->startOfDay();
            $endDay = $range['end']->copy()->endOfDay();
            $startDate = $range['start_date'];
            $endDate = $range['end_date'];
            $today = Carbon::today();
            $todayDate = $today->toDateString();

            $ctx = [
                'tenants' => $tenants,
                'tenantIds' => $tenantIds,
                'tenantMap' => $tenantMap,
                'range' => $range,
                'startDay' => $startDay,
                'endDay' => $endDay,
                'startDate' => $startDate,
                'endDate' => $endDate,
                'today' => $today,
                'todayDate' => $todayDate,
                'limit' => $limit,
                'auditScope' => $auditScope,
                'auditDetails' => $auditDetails,
                'memo' => [],
            ];

            $payload = [
                'meta' => [
                    'generated_at' => now()->toIso8601String(),
                    'cached' => false,
                    'date_range' => [
                        'periodicity' => $range['periodicity'],
                        'start_date' => $startDate,
                        'end_date' => $endDate,
                        'label' => $range['label'],
                        'code' => $range['code'],
                    ],
                    'scope' => [
                        'tenants_count' => $tenants->count(),
                        'tenant_ids' => $tenantIds,
                        'sections' => $activeSections,
                        'limit' => $limit,
                    ],
                ],
                'summary' => [],
            ];

            $builtSections = [];
            foreach ($activeSections as $section) {
                $builtSections[$section] = match ($section) {
                    'alerts' => $this->buildAlertsSection($ctx),
                    'workforce' => $this->buildWorkforceSection($ctx),
                    'payroll' => $this->buildPayrollSection($ctx),
                    'attendance' => $this->buildAttendanceSection($ctx),
                    'leaves' => $this->buildLeavesSection($ctx),
                    'compliance' => $this->buildComplianceSection($ctx),
                    'talent' => $this->buildTalentSection($ctx),
                    'saas' => $this->buildSaasSection($ctx),
                    'audit' => $this->buildAuditSection($ctx),
                    'companies' => $this->buildCompaniesScorecard($ctx),
                };
            }

            $payload['summary'] = $this->buildExecutiveSummary($ctx, $builtSections);

            foreach ($builtSections as $sectionKey => $sectionData) {
                $payload[$sectionKey] = $sectionData;
            }

            return $payload;
        } finally {
            if ($previousTenant) {
                $this->tenantManager->set($previousTenant);
            }
        }
    }

    /**
     * @param  array<int, string>  $sections
     * @return array<int, string>
     */
    private function normalizeSections(array $sections): array
    {
        if ($sections === []) {
            return self::SECTIONS;
        }

        $normalized = array_values(array_unique(array_filter(
            $sections,
            fn (string $s) => in_array($s, self::SECTIONS, true),
        )));

        return $normalized === [] ? self::SECTIONS : $normalized;
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function getPayrollOverview(array &$ctx): array
    {
        if (! isset($ctx['memo']['payroll_overview'])) {
            $ctx['memo']['payroll_overview'] = $this->dossierService->buildOverview(
                $ctx['tenants'],
                $ctx['range'],
            );
        }

        return $ctx['memo']['payroll_overview'];
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function getSharedCounts(array &$ctx): array
    {
        if (isset($ctx['memo']['shared_counts'])) {
            return $ctx['memo']['shared_counts'];
        }

        $tenantIds = $ctx['tenantIds'];
        $todayDate = $ctx['todayDate'];

        if ($tenantIds === []) {
            return $ctx['memo']['shared_counts'] = [
                'active_approved_employee_ids' => [],
                'scheduled_employee_ids' => [],
                'employees_without_shift_ids' => [],
                'on_leave_today_employee_ids' => [],
                'on_leave_today_by_tenant' => [],
                'pending_leaves_count' => 0,
                'pending_payroll_approvals_count' => 0,
                'pending_employees_count' => 0,
                'pending_deductions_count' => 0,
                'pending_evaluations_count' => 0,
                'pending_payments_count' => 0,
                'expiring_30_contracts_count' => 0,
                'expiring_90_contracts_count' => 0,
                'expired_active_contracts_count' => 0,
                'outdated_payroll_records_count' => 0,
                'unverified_documents_count' => 0,
                'expired_documents_count' => 0,
                'unsigned_warnings_count' => 0,
                'overdue_onboarding_count' => 0,
                'damaged_lost_assets_count' => 0,
                'overdue_invoices_count' => 0,
            ];
        }

        $activeApprovedIds = Employee::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'active')
            ->where('approval_status', 'approved')
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $scheduledIds = EmployeeSchedule::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('is_active', true)
            ->whereDate('effective_from', '<=', $todayDate)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhereDate('effective_to', '>=', $todayDate))
            ->distinct()
            ->pluck('employee_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $withoutShiftIds = array_values(array_diff($activeApprovedIds, $scheduledIds));

        $onLeaveTodayRows = LeaveRequest::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $todayDate)
            ->whereDate('end_date', '>=', $todayDate)
            ->get(['tenant_id', 'employee_id']);

        $onLeaveTodayEmployeeIds = $onLeaveTodayRows->pluck('employee_id')->unique()->map(fn ($id) => (int) $id)->values()->all();
        $onLeaveTodayByTenant = $onLeaveTodayRows
            ->groupBy('tenant_id')
            ->map(fn (Collection $rows) => $rows->pluck('employee_id')->unique()->count())
            ->all();

        $date30 = $ctx['today']->copy()->addDays(30)->toDateString();
        $date90 = $ctx['today']->copy()->addDays(90)->toDateString();

        $shared = [
            'active_approved_employee_ids' => $activeApprovedIds,
            'scheduled_employee_ids' => $scheduledIds,
            'employees_without_shift_ids' => $withoutShiftIds,
            'on_leave_today_employee_ids' => $onLeaveTodayEmployeeIds,
            'on_leave_today_by_tenant' => $onLeaveTodayByTenant,
            'pending_leaves_count' => LeaveRequest::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('status', 'pending')
                ->count(),
            'pending_payroll_approvals_count' => PayrollPeriod::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->whereIn('status', ['pending_approval', 'completed'])
                ->count(),
            'pending_employees_count' => Employee::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('approval_status', 'pending')
                ->count(),
            'pending_deductions_count' => Deduction::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('status', 'active')
                ->whereNull('approved_at')
                ->count(),
            'pending_evaluations_count' => PerformanceEvaluation::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('status', 'submitted')
                ->count(),
            'pending_payments_count' => SubscriptionPayment::query()
                ->whereIn('tenant_id', $tenantIds)
                ->where('status', 'pending')
                ->count(),
            'expiring_30_contracts_count' => EmployeeContract::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('is_active', true)
                ->whereNotNull('end_date')
                ->whereDate('end_date', '>=', $todayDate)
                ->whereDate('end_date', '<=', $date30)
                ->count(),
            'expiring_90_contracts_count' => EmployeeContract::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('is_active', true)
                ->whereNotNull('end_date')
                ->whereDate('end_date', '>=', $todayDate)
                ->whereDate('end_date', '<=', $date90)
                ->count(),
            'expired_active_contracts_count' => EmployeeContract::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('is_active', true)
                ->whereNotNull('end_date')
                ->whereDate('end_date', '<', $todayDate)
                ->count(),
            'outdated_payroll_records_count' => PayrollRecord::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('is_outdated', true)
                ->count(),
            'unverified_documents_count' => EmployeeDocument::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('is_verified', false)
                ->count(),
            'expired_documents_count' => EmployeeDocument::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->whereNotNull('expiry_date')
                ->whereDate('expiry_date', '<', $todayDate)
                ->count(),
            'unsigned_warnings_count' => EmployeeEducation::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->whereNull('signed_document_path')
                ->count(),
            'overdue_onboarding_count' => OnboardingTask::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->whereIn('status', ['pending', 'in_progress'])
                ->whereNotNull('due_date')
                ->whereDate('due_date', '<', $todayDate)
                ->count(),
            'damaged_lost_assets_count' => EmployeeAsset::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->whereIn('status', ['damaged_pending', 'lost_unreturned'])
                ->count(),
            'overdue_invoices_count' => SubscriptionInvoice::query()
                ->whereIn('tenant_id', $tenantIds)
                ->where(function ($q) use ($todayDate): void {
                    $q->where('status', 'overdue')
                        ->orWhere(fn ($sub) => $sub->where('status', 'open')->whereDate('due_date', '<', $todayDate));
                })
                ->count(),
        ];

        return $ctx['memo']['shared_counts'] = $shared;
    }

    /**
     * @param  array<string, mixed>  $ctx
     * @param  array<string, array<string, mixed>>  $builtSections
     * @return array<string, mixed>
     */
    private function buildExecutiveSummary(array &$ctx, array $builtSections): array
    {
        $tenantIds = $ctx['tenantIds'];
        $tenants = $ctx['tenants'];
        $shared = $this->getSharedCounts($ctx);
        $overview = $this->getPayrollOverview($ctx);

        $activeTenants = $tenants->where('status', 'active')->count();
        $suspendedTenants = $tenants->where('status', 'suspended')->count();

        if ($tenantIds === []) {
            return [
                'companies_total' => 0,
                'companies_active' => 0,
                'companies_suspended' => 0,
                'employees_total' => 0,
                'employees_active' => 0,
                'present_today' => 0,
                'late_today' => 0,
                'absent_today' => 0,
                'on_leave_today' => 0,
                'monthly_base_payroll' => 0.0,
                'period_gross_payroll' => 0.0,
                'period_net_payroll' => 0.0,
                'period_employer_cost' => 0.0,
                'pending_approvals_total' => 0,
                'critical_risks_total' => 0,
                'open_billing_amount' => 0.0,
                'pending_payments_count' => 0,
            ];
        }

        $empCounts = $builtSections['workforce']['kpis'] ?? null;
        $employeesTotal = $empCounts['total_employees']
            ?? Employee::withoutGlobalScope(TenantScope::class)->whereIn('tenant_id', $tenantIds)->count();
        $employeesActive = $empCounts['active_employees']
            ?? Employee::withoutGlobalScope(TenantScope::class)->whereIn('tenant_id', $tenantIds)->where('status', 'active')->count();

        $attToday = $builtSections['attendance']['today'] ?? null;
        if ($attToday === null) {
            $todayStatuses = AttendanceRecord::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->whereDate('date', $ctx['todayDate'])
                ->selectRaw('status, COUNT(*) as total')
                ->groupBy('status')
                ->pluck('total', 'status');

            $presentToday = (int) ($todayStatuses['present'] ?? 0) + (int) ($todayStatuses['late'] ?? 0) + (int) ($todayStatuses['half_day'] ?? 0);
            $lateToday = (int) ($todayStatuses['late'] ?? 0);
            $absentToday = (int) ($todayStatuses['absent'] ?? 0);
        } else {
            $presentToday = (int) ($attToday['present'] ?? 0) + (int) ($attToday['late'] ?? 0) + (int) ($attToday['half_day'] ?? 0);
            $lateToday = (int) ($attToday['late'] ?? 0);
            $absentToday = (int) ($attToday['absent'] ?? 0);
        }

        $monthlyBasePayroll = $builtSections['payroll']['kpis']['active_base_salary_monthly']
            ?? round((float) EmployeeContract::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('is_active', true)
                ->sum('base_salary'), 2);

        $openBillingAmount = $builtSections['saas']['billing']['open_total']
            ?? round((float) SubscriptionInvoice::query()
                ->whereIn('tenant_id', $tenantIds)
                ->whereIn('status', ['open', 'overdue'])
                ->sum('total_amount'), 2);

        $pendingApprovalsTotal = $shared['pending_payroll_approvals_count']
            + $shared['pending_leaves_count']
            + $shared['pending_employees_count']
            + $shared['pending_deductions_count']
            + $shared['pending_evaluations_count']
            + $shared['pending_payments_count'];

        $criticalRisksTotal = $shared['contracts_expiring_30_plus_expired'] ?? (
            $shared['expiring_30_contracts_count']
            + $shared['expired_active_contracts_count']
            + count($shared['employees_without_shift_ids'])
            + $shared['outdated_payroll_records_count']
            + $shared['overdue_invoices_count']
            + $suspendedTenants
        );

        return [
            'companies_total' => $tenants->count(),
            'companies_active' => $activeTenants,
            'companies_suspended' => $suspendedTenants,
            'employees_total' => $employeesTotal,
            'employees_active' => $employeesActive,
            'present_today' => $presentToday,
            'late_today' => $lateToday,
            'absent_today' => $absentToday,
            'on_leave_today' => count($shared['on_leave_today_employee_ids']),
            'monthly_base_payroll' => $monthlyBasePayroll,
            'period_gross_payroll' => (float) ($overview['totals']['total_gross'] ?? 0),
            'period_net_payroll' => (float) ($overview['totals']['total_net'] ?? 0),
            'period_employer_cost' => (float) ($overview['totals']['total_employer_cost'] ?? 0),
            'pending_approvals_total' => $pendingApprovalsTotal,
            'critical_risks_total' => $criticalRisksTotal,
            'open_billing_amount' => $openBillingAmount,
            'pending_payments_count' => $shared['pending_payments_count'],
        ];
    }

    /**
     * Block 1: Executive Summary & Critical Alerts.
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildAlertsSection(array &$ctx): array
    {
        $tenantIds = $ctx['tenantIds'];
        $tenantMap = $ctx['tenantMap'];
        $shared = $this->getSharedCounts($ctx);
        $overview = $this->getPayrollOverview($ctx);
        $limit = $ctx['limit'];
        $todayDate = $ctx['todayDate'];

        $pendingApprovals = [
            'payroll_periods' => $shared['pending_payroll_approvals_count'],
            'leave_requests' => $shared['pending_leaves_count'],
            'employees' => $shared['pending_employees_count'],
            'deductions' => $shared['pending_deductions_count'],
            'performance_evaluations' => $shared['pending_evaluations_count'],
            'subscription_payments' => $shared['pending_payments_count'],
        ];
        $pendingApprovals['total'] = array_sum($pendingApprovals);

        $suspendedTenants = $ctx['tenants']->where('status', 'suspended')->count();
        $gracePeriodTenants = $tenantIds === []
            ? 0
            : TenantSubscription::query()
                ->whereIn('tenant_id', $tenantIds)
                ->whereIn('status', ['grace_period', 'past_due'])
                ->count();

        $periodsMissingInssProof = max(
            0,
            (int) ($overview['totals']['periods_count'] ?? 0) - (int) ($overview['totals']['inss_proof_attached_count'] ?? 0),
        );

        $operationalRisks = [
            'contracts_expiring_30d' => $shared['expiring_30_contracts_count'],
            'contracts_expiring_90d' => $shared['expiring_90_contracts_count'],
            'contracts_expired_still_active' => $shared['expired_active_contracts_count'],
            'employees_without_shift' => count($shared['employees_without_shift_ids']),
            'outdated_payroll_records' => $shared['outdated_payroll_records_count'],
            'unverified_documents' => $shared['unverified_documents_count'],
            'expired_documents' => $shared['expired_documents_count'],
            'unsigned_warnings' => $shared['unsigned_warnings_count'],
            'overdue_onboarding_tasks' => $shared['overdue_onboarding_count'],
            'damaged_or_lost_assets' => $shared['damaged_lost_assets_count'],
            'overdue_invoices' => $shared['overdue_invoices_count'],
            'suspended_tenants' => $suspendedTenants,
            'grace_period_tenants' => $gracePeriodTenants,
            'periods_missing_inss_proof' => $periodsMissingInssProof,
        ];
        $operationalRisks['total'] = array_sum(array_diff_key($operationalRisks, ['contracts_expiring_90d' => true]));

        $items = [];
        if ($tenantIds !== []) {
            $perBucket = max(3, (int) ceil($limit / 2));

            $pendingPayrolls = PayrollPeriod::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->whereIn('status', ['pending_approval', 'completed'])
                ->orderBy('period_end')
                ->limit($perBucket)
                ->get(['id', 'tenant_id', 'name', 'status', 'period_end']);

            foreach ($pendingPayrolls as $period) {
                $items[] = [
                    'severity' => 'high',
                    'category' => 'payroll_approval',
                    'tenant_id' => $period->tenant_id,
                    'tenant_name' => $tenantMap->get($period->tenant_id)?->name,
                    'title' => "Folha salarial aguarda aprovação ({$period->name})",
                    'reference_id' => $period->id,
                    'due_date' => $period->period_end?->format('Y-m-d'),
                ];
            }

            $pendingPayments = SubscriptionPayment::query()
                ->whereIn('tenant_id', $tenantIds)
                ->where('status', 'pending')
                ->with('invoice:id,invoice_number')
                ->latest('id')
                ->limit($perBucket)
                ->get(['id', 'tenant_id', 'invoice_id', 'amount', 'currency', 'payment_date']);

            foreach ($pendingPayments as $payment) {
                $items[] = [
                    'severity' => 'high',
                    'category' => 'subscription_payment',
                    'tenant_id' => $payment->tenant_id,
                    'tenant_name' => $tenantMap->get($payment->tenant_id)?->name,
                    'title' => 'Comprovativo de pagamento SaaS pendente ('.($payment->invoice?->invoice_number ?? '#'.$payment->id).')',
                    'reference_id' => $payment->id,
                    'amount' => (float) $payment->amount,
                    'currency' => $payment->currency,
                    'due_date' => $payment->payment_date?->format('Y-m-d'),
                ];
            }

            $overdueInvoices = SubscriptionInvoice::query()
                ->whereIn('tenant_id', $tenantIds)
                ->where(function ($q) use ($todayDate): void {
                    $q->where('status', 'overdue')
                        ->orWhere(fn ($sub) => $sub->where('status', 'open')->whereDate('due_date', '<', $todayDate));
                })
                ->orderBy('due_date')
                ->limit($perBucket)
                ->get(['id', 'tenant_id', 'invoice_number', 'total_amount', 'currency', 'due_date']);

            foreach ($overdueInvoices as $inv) {
                $items[] = [
                    'severity' => 'critical',
                    'category' => 'overdue_invoice',
                    'tenant_id' => $inv->tenant_id,
                    'tenant_name' => $tenantMap->get($inv->tenant_id)?->name,
                    'title' => "Fatura vencida ({$inv->invoice_number})",
                    'reference_id' => $inv->id,
                    'amount' => (float) $inv->total_amount,
                    'currency' => $inv->currency,
                    'due_date' => $inv->due_date?->format('Y-m-d'),
                ];
            }

            $expiringContracts = EmployeeContract::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->where('is_active', true)
                ->whereNotNull('end_date')
                ->whereDate('end_date', '<=', $ctx['today']->copy()->addDays(30)->toDateString())
                ->with('employee:id,first_name,last_name,employee_code')
                ->orderBy('end_date')
                ->limit($perBucket)
                ->get(['id', 'tenant_id', 'employee_id', 'end_date', 'contract_type']);

            foreach ($expiringContracts as $contract) {
                $isExpired = $contract->end_date && $contract->end_date->lt($ctx['today']);
                $empName = $contract->employee?->full_name ?: '#'.$contract->employee_id;
                $items[] = [
                    'severity' => $isExpired ? 'critical' : 'medium',
                    'category' => $isExpired ? 'contract_expired' : 'contract_expiring',
                    'tenant_id' => $contract->tenant_id,
                    'tenant_name' => $tenantMap->get($contract->tenant_id)?->name,
                    'title' => ($isExpired ? 'Contrato expirado ainda ativo: ' : 'Contrato a expirar em breve: ').$empName,
                    'reference_id' => $contract->id,
                    'due_date' => $contract->end_date?->format('Y-m-d'),
                ];
            }
        }

        $severityOrder = ['critical' => 0, 'high' => 1, 'medium' => 2, 'low' => 3];
        usort($items, fn (array $a, array $b) => ($severityOrder[$a['severity']] ?? 9) <=> ($severityOrder[$b['severity']] ?? 9));

        return [
            'pending_approvals' => $pendingApprovals,
            'operational_risks' => $operationalRisks,
            'items' => array_slice($items, 0, $limit),
        ];
    }

    /**
     * Block 2: Workforce & Organization (Headcount, Structure & Turnover).
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildWorkforceSection(array &$ctx): array
    {
        $tenantIds = $ctx['tenantIds'];
        $tenantMap = $ctx['tenantMap'];
        $shared = $this->getSharedCounts($ctx);
        $startDate = $ctx['startDate'];
        $endDate = $ctx['endDate'];
        $today = $ctx['today'];
        $todayDate = $ctx['todayDate'];
        $limit = $ctx['limit'];

        if ($tenantIds === []) {
            return [
                'kpis' => [
                    'total_employees' => 0,
                    'active_employees' => 0,
                    'inactive_employees' => 0,
                    'suspended_employees' => 0,
                    'terminated_employees' => 0,
                    'on_leave_employees' => 0,
                    'pending_approval_employees' => 0,
                    'hired_in_range' => 0,
                    'terminated_in_range' => 0,
                    'turnover_rate' => 0.0,
                    'probation_or_internship_count' => 0,
                    'departments_count' => 0,
                    'branches_count' => 0,
                    'positions_count' => 0,
                ],
                'by_status' => ['active' => 0, 'inactive' => 0, 'suspended' => 0, 'terminated' => 0],
                'by_company' => [],
                'by_department' => [],
                'by_branch' => [],
                'headcount_trend' => [],
                'termination_reasons' => [],
                'upcoming_birthdays' => [],
            ];
        }

        $employees = Employee::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->get([
                'id',
                'tenant_id',
                'department_id',
                'first_name',
                'last_name',
                'employee_code',
                'status',
                'approval_status',
                'hired_at',
                'termination_at',
                'termination_reason',
                'probation_end',
                'birth_date',
            ]);

        $statusCounts = [
            'active' => 0,
            'inactive' => 0,
            'suspended' => 0,
            'terminated' => 0,
        ];
        $pendingApproval = 0;
        $hiredInRange = 0;
        $terminatedInRange = 0;
        $terminationReasons = [];
        $companyStats = [];

        foreach ($ctx['tenants'] as $t) {
            $companyStats[$t->id] = [
                'tenant_id' => $t->id,
                'tenant_name' => $t->name,
                'total' => 0,
                'active' => 0,
                'hired_in_range' => 0,
                'terminated_in_range' => 0,
            ];
        }

        $hiredBeforeStart = 0;
        $terminatedBeforeStart = 0;
        $probationEmployeeIds = [];

        foreach ($employees as $emp) {
            $st = $emp->status ?? 'active';
            $statusCounts[$st] = ($statusCounts[$st] ?? 0) + 1;

            if (($emp->approval_status ?? 'approved') === 'pending') {
                $pendingApproval++;
            }

            if (isset($companyStats[$emp->tenant_id])) {
                $companyStats[$emp->tenant_id]['total']++;
                if ($st === 'active') {
                    $companyStats[$emp->tenant_id]['active']++;
                }
            }

            $hiredStr = $emp->hired_at?->toDateString();
            if ($hiredStr !== null) {
                if ($hiredStr < $startDate) {
                    $hiredBeforeStart++;
                } elseif ($hiredStr <= $endDate) {
                    $hiredInRange++;
                    if (isset($companyStats[$emp->tenant_id])) {
                        $companyStats[$emp->tenant_id]['hired_in_range']++;
                    }
                }
            }

            $termStr = $emp->termination_at?->toDateString();
            if ($st === 'terminated' && $termStr !== null) {
                if ($termStr < $startDate) {
                    $terminatedBeforeStart++;
                } elseif ($termStr <= $endDate) {
                    $terminatedInRange++;
                    if (isset($companyStats[$emp->tenant_id])) {
                        $companyStats[$emp->tenant_id]['terminated_in_range']++;
                    }
                    $reason = $emp->termination_reason ?: 'Não informado';
                    $terminationReasons[$reason] = ($terminationReasons[$reason] ?? 0) + 1;
                }
            }

            if ($st === 'active' && $emp->probation_end && $emp->probation_end->gte($today)) {
                $probationEmployeeIds[$emp->id] = true;
            }
        }

        $probationContractIds = EmployeeContract::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('is_active', true)
            ->whereIn('contract_type', ['probation', 'internship'])
            ->where(fn ($q) => $q->whereNull('end_date')->orWhereDate('end_date', '>=', $todayDate))
            ->pluck('employee_id')
            ->all();
        foreach ($probationContractIds as $empId) {
            $probationEmployeeIds[(int) $empId] = true;
        }

        $startHeadcount = max(0, $hiredBeforeStart - $terminatedBeforeStart);
        $endHeadcount = max(0, $startHeadcount + $hiredInRange - $terminatedInRange);
        $avgHeadcount = ($startHeadcount + $endHeadcount) / 2;
        $turnoverRate = $avgHeadcount > 0
            ? round(($terminatedInRange / $avgHeadcount) * 100, 2)
            : ($employees->count() > 0 && $terminatedInRange > 0
                ? round(($terminatedInRange / $employees->count()) * 100, 2)
                : 0.0);

        $departmentsCount = Department::withoutGlobalScope(TenantScope::class)->whereIn('tenant_id', $tenantIds)->count();
        $branchesCount = Branch::withoutGlobalScope(TenantScope::class)->whereIn('tenant_id', $tenantIds)->count();
        $positionsCount = Position::withoutGlobalScope(TenantScope::class)->whereIn('tenant_id', $tenantIds)->count();

        $byDepartment = Department::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->withCount(['employees' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)])
            ->orderByDesc('employees_count')
            ->limit($limit)
            ->get(['id', 'tenant_id', 'name'])
            ->map(fn (Department $dept) => [
                'tenant_id' => $dept->tenant_id,
                'tenant_name' => $tenantMap->get($dept->tenant_id)?->name,
                'department_id' => $dept->id,
                'department_name' => $dept->name,
                'employees_count' => (int) $dept->employees_count,
            ])
            ->values()
            ->all();

        $branchEmployeeCounts = DB::table('employees')
            ->join('departments', 'departments.id', '=', 'employees.department_id')
            ->whereIn('employees.tenant_id', $tenantIds)
            ->whereNull('employees.deleted_at')
            ->whereNull('departments.deleted_at')
            ->whereNotNull('departments.branch_id')
            ->groupBy('departments.branch_id')
            ->selectRaw('departments.branch_id, COUNT(employees.id) as total')
            ->pluck('total', 'departments.branch_id');

        $byBranch = Branch::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->withCount(['departments' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)])
            ->orderByDesc('departments_count')
            ->limit($limit)
            ->get(['id', 'tenant_id', 'name', 'is_headquarter', 'status'])
            ->map(fn (Branch $branch) => [
                'tenant_id' => $branch->tenant_id,
                'tenant_name' => $tenantMap->get($branch->tenant_id)?->name,
                'branch_id' => $branch->id,
                'branch_name' => $branch->name,
                'is_headquarter' => (bool) $branch->is_headquarter,
                'status' => $branch->status,
                'departments_count' => (int) $branch->departments_count,
                'employees_count' => (int) ($branchEmployeeCounts[$branch->id] ?? 0),
            ])
            ->values()
            ->all();

        // 12-month headcount trend computed cleanly in PHP for SQLite/MySQL/Postgres compatibility
        $headcountTrend = collect(range(11, 0))->map(function (int $monthsAgo) use ($employees) {
            $monthStart = now()->startOfMonth()->subMonths($monthsAgo);
            $monthEnd = $monthStart->copy()->endOfMonth();
            $nextMonth = $monthStart->copy()->addMonth();
            $mStartStr = $monthStart->toDateString();
            $mEndStr = $monthEnd->toDateString();
            $nextStr = $nextMonth->toDateString();

            $activeHeadcount = 0;
            $hired = 0;
            $terminated = 0;

            foreach ($employees as $emp) {
                $hStr = $emp->hired_at?->toDateString();
                $tStr = $emp->termination_at?->toDateString();

                if (($hStr === null || $hStr < $nextStr) && ($tStr === null || $tStr >= $nextStr)) {
                    $activeHeadcount++;
                }
                if ($hStr !== null && $hStr >= $mStartStr && $hStr <= $mEndStr) {
                    $hired++;
                }
                if ($emp->status === 'terminated' && $tStr !== null && $tStr >= $mStartStr && $tStr <= $mEndStr) {
                    $terminated++;
                }
            }

            return [
                'month' => $monthStart->format('Y-m'),
                'label' => $monthStart->format('M/Y'),
                'active_headcount' => $activeHeadcount,
                'hired' => $hired,
                'terminated' => $terminated,
            ];
        })->values()->all();

        arsort($terminationReasons);
        $formattedReasons = [];
        foreach ($terminationReasons as $reason => $total) {
            $formattedReasons[] = ['reason' => $reason, 'total' => $total];
        }

        $birthdays = $employees
            ->filter(fn (Employee $e) => $e->status === 'active' && $e->birth_date !== null)
            ->map(function (Employee $e) use ($today, $tenantMap) {
                $birthMonth = $e->birth_date->month;
                $candidateYear = $birthMonth < $today->month
                    ? $today->year + 1
                    : $today->year;
                $daysInMonth = Carbon::createFromDate($candidateYear, $birthMonth, 1)->daysInMonth;
                $targetDay = min($e->birth_date->day, $daysInMonth);
                $upcoming = Carbon::createFromDate($candidateYear, $birthMonth, $targetDay)->startOfDay();
                if ($upcoming->lt($today)) {
                    $candidateYear++;
                    $daysInMonth = Carbon::createFromDate($candidateYear, $birthMonth, 1)->daysInMonth;
                    $targetDay = min($e->birth_date->day, $daysInMonth);
                    $upcoming = Carbon::createFromDate($candidateYear, $birthMonth, $targetDay)->startOfDay();
                }

                $daysUntil = (int) $today->diffInDays($upcoming, false);

                return [
                    'tenant_id' => $e->tenant_id,
                    'tenant_name' => $tenantMap->get($e->tenant_id)?->name,
                    'employee_id' => $e->id,
                    'employee_name' => $e->full_name,
                    'birth_date' => $e->birth_date->format('d/m'),
                    'upcoming_date' => $upcoming->toDateString(),
                    'days_until' => $daysUntil,
                ];
            })
            ->filter(fn (array $b) => $b['days_until'] >= 0 && $b['days_until'] <= 30)
            ->sortBy([['days_until', 'asc'], ['employee_name', 'asc']])
            ->take($limit)
            ->values()
            ->all();

        $byCompany = array_values($companyStats);
        usort($byCompany, fn (array $a, array $b) => $b['total'] <=> $a['total']);

        return [
            'kpis' => [
                'total_employees' => $employees->count(),
                'active_employees' => $statusCounts['active'],
                'inactive_employees' => $statusCounts['inactive'],
                'suspended_employees' => $statusCounts['suspended'],
                'terminated_employees' => $statusCounts['terminated'],
                'on_leave_employees' => count($shared['on_leave_today_employee_ids']),
                'pending_approval_employees' => $pendingApproval,
                'hired_in_range' => $hiredInRange,
                'terminated_in_range' => $terminatedInRange,
                'turnover_rate' => $turnoverRate,
                'probation_or_internship_count' => count($probationEmployeeIds),
                'departments_count' => $departmentsCount,
                'branches_count' => $branchesCount,
                'positions_count' => $positionsCount,
            ],
            'by_status' => $statusCounts,
            'by_company' => $byCompany,
            'by_department' => $byDepartment,
            'by_branch' => $byBranch,
            'headcount_trend' => $headcountTrend,
            'termination_reasons' => $formattedReasons,
            'upcoming_birthdays' => $birthdays,
        ];
    }

    /**
     * Block 3: Payroll, INSS, IRT, Benefits & Deductions.
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildPayrollSection(array &$ctx): array
    {
        $tenantIds = $ctx['tenantIds'];
        $overview = $this->getPayrollOverview($ctx);
        $shared = $this->getSharedCounts($ctx);
        $startDate = $ctx['startDate'];
        $endDate = $ctx['endDate'];
        $limit = $ctx['limit'];

        if ($tenantIds === []) {
            return [
                'kpis' => [
                    'active_base_salary_monthly' => 0.0,
                    'periods_total_in_range' => 0,
                    'reportable_periods_count' => 0,
                    'companies_with_approved_payroll' => 0,
                    'companies_ready_for_dossier' => 0,
                    'inss_paid_periods_count' => 0,
                    'inss_proof_attached_count' => 0,
                    'total_gross' => 0.0,
                    'total_net' => 0.0,
                    'total_inss_employee' => 0.0,
                    'total_inss_employer' => 0.0,
                    'total_inss' => 0.0,
                    'total_irt' => 0.0,
                    'total_deductions' => 0.0,
                    'total_employer_cost' => 0.0,
                    'total_overtime_paid' => 0.0,
                    'outdated_records_count' => 0,
                ],
                'periods_by_status' => [],
                'by_company' => [],
                'by_department' => [],
                'monthly_trend' => [],
                'benefits_summary' => ['active_count' => 0, 'monthly_fixed_total' => 0.0],
                'deductions_summary' => [
                    'active_count' => 0,
                    'pending_approval_count' => 0,
                    'total_amount' => 0.0,
                    'paid_amount' => 0.0,
                    'remaining_amount' => 0.0,
                    'by_type' => [],
                ],
            ];
        }

        $activeBaseByTenant = EmployeeContract::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('is_active', true)
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, SUM(base_salary) as total_base')
            ->pluck('total_base', 'tenant_id');

        $activeBaseTotal = round((float) $activeBaseByTenant->sum(), 2);

        $allPeriodsInRange = PayrollPeriod::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereDate('period_start', '<=', $endDate)
            ->whereDate('period_end', '>=', $startDate)
            ->get(['id', 'status']);

        $periodsByStatus = $allPeriodsInRange->countBy('status')->all();

        $reportablePeriodIds = collect($overview['period_rows'] ?? [])->pluck('period_id')->all();
        $totalOvertimePaid = $reportablePeriodIds === []
            ? 0.0
            : round((float) PayrollRecord::withoutGlobalScope(TenantScope::class)
                ->whereIn('payroll_period_id', $reportablePeriodIds)
                ->sum('overtime_amount'), 2);

        $byDepartment = $reportablePeriodIds === []
            ? []
            : DB::table('payroll_records')
                ->join('employees', 'employees.id', '=', 'payroll_records.employee_id')
                ->leftJoin('departments', function ($join): void {
                    $join->on('departments.id', '=', 'employees.department_id')
                        ->whereNull('departments.deleted_at');
                })
                ->join('tenants', 'tenants.id', '=', 'payroll_records.tenant_id')
                ->whereIn('payroll_records.payroll_period_id', $reportablePeriodIds)
                ->whereNull('employees.deleted_at')
                ->whereNull('tenants.deleted_at')
                ->groupBy('payroll_records.tenant_id', 'tenants.name', 'departments.id', 'departments.name')
                ->selectRaw('
                    payroll_records.tenant_id,
                    tenants.name as tenant_name,
                    departments.id as department_id,
                    COALESCE(departments.name, \'Sem departamento\') as department_name,
                    COUNT(payroll_records.id) as records_count,
                    SUM(payroll_records.gross_salary) as total_gross,
                    SUM(payroll_records.net_salary) as total_net,
                    SUM(payroll_records.employer_cost) as total_employer_cost
                ')
                ->orderByDesc('total_gross')
                ->limit($limit)
                ->get()
                ->map(fn ($row) => [
                    'tenant_id' => (int) $row->tenant_id,
                    'tenant_name' => $row->tenant_name,
                    'department_id' => $row->department_id !== null ? (int) $row->department_id : null,
                    'department_name' => $row->department_name,
                    'records_count' => (int) $row->records_count,
                    'total_gross' => round((float) $row->total_gross, 2),
                    'total_net' => round((float) $row->total_net, 2),
                    'total_employer_cost' => round((float) $row->total_employer_cost, 2),
                ])
                ->values()
                ->all();

        $byCompany = collect($overview['companies'] ?? [])
            ->map(fn (array $c) => [
                'tenant_id' => $c['tenant_id'],
                'name' => $c['name'],
                'currency' => $c['currency'],
                'active_base_salary_monthly' => round((float) ($activeBaseByTenant[$c['tenant_id']] ?? 0), 2),
                'periods_count' => $c['periods_count'],
                'has_approved_payroll' => $c['has_approved_payroll'],
                'ready_for_dossier' => $c['ready_for_dossier'],
                'employees_count' => $c['employees_count'],
                'total_gross' => $c['total_gross'],
                'total_inss_employee' => $c['total_inss_employee'],
                'total_inss_employer' => $c['total_inss_employer'],
                'total_inss' => $c['total_inss'],
                'total_irt' => $c['total_irt'],
                'total_deductions' => $c['total_deductions'],
                'total_net' => $c['total_net'],
                'total_employer_cost' => $c['total_employer_cost'],
                'compliance' => $c['compliance'],
            ])
            ->values()
            ->all();

        $activeBenefitsQuery = Benefit::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'active');
        $benefitsCount = (clone $activeBenefitsQuery)->count();
        $benefitsFixedTotal = round((float) (clone $activeBenefitsQuery)->where('amount_type', 'fixed')->sum('amount'), 2);

        $activeDeductions = Deduction::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'active')
            ->get(['deduction_type', 'amount_type', 'amount', 'total_amount', 'paid_amount', 'approved_at']);

        $dedTotal = 0.0;
        $dedPaid = 0.0;
        $dedPending = 0;
        $dedByType = [];

        foreach ($activeDeductions as $ded) {
            $amt = $ded->total_amount !== null ? (float) $ded->total_amount : (float) ($ded->amount ?? 0);
            $paid = (float) ($ded->paid_amount ?? 0);
            $dedTotal += $amt;
            $dedPaid += $paid;
            if ($ded->approved_at === null) {
                $dedPending++;
            }
            $type = $ded->deduction_type ?: 'other';
            if (! isset($dedByType[$type])) {
                $dedByType[$type] = ['type' => $type, 'count' => 0, 'total_amount' => 0.0];
            }
            $dedByType[$type]['count']++;
            $dedByType[$type]['total_amount'] = round($dedByType[$type]['total_amount'] + $amt, 2);
        }

        $totals = $overview['totals'] ?? [];

        return [
            'kpis' => [
                'active_base_salary_monthly' => $activeBaseTotal,
                'periods_total_in_range' => $allPeriodsInRange->count(),
                'reportable_periods_count' => (int) ($totals['periods_count'] ?? 0),
                'companies_with_approved_payroll' => (int) ($totals['companies_with_approved_payroll'] ?? 0),
                'companies_ready_for_dossier' => (int) ($totals['companies_ready_for_dossier'] ?? 0),
                'inss_paid_periods_count' => (int) ($totals['inss_paid_periods_count'] ?? 0),
                'inss_proof_attached_count' => (int) ($totals['inss_proof_attached_count'] ?? 0),
                'total_gross' => (float) ($totals['total_gross'] ?? 0),
                'total_net' => (float) ($totals['total_net'] ?? 0),
                'total_inss_employee' => (float) ($totals['total_inss_employee'] ?? 0),
                'total_inss_employer' => (float) ($totals['total_inss_employer'] ?? 0),
                'total_inss' => (float) ($totals['total_inss'] ?? 0),
                'total_irt' => (float) ($totals['total_irt'] ?? 0),
                'total_deductions' => (float) ($totals['total_deductions'] ?? 0),
                'total_employer_cost' => (float) ($totals['total_employer_cost'] ?? 0),
                'total_overtime_paid' => $totalOvertimePaid,
                'outdated_records_count' => $shared['outdated_payroll_records_count'],
            ],
            'periods_by_status' => $periodsByStatus,
            'by_company' => $byCompany,
            'by_department' => $byDepartment,
            'monthly_trend' => $overview['monthly_timeline'] ?? [],
            'benefits_summary' => [
                'active_count' => $benefitsCount,
                'monthly_fixed_total' => $benefitsFixedTotal,
            ],
            'deductions_summary' => [
                'active_count' => $activeDeductions->count(),
                'pending_approval_count' => $dedPending,
                'total_amount' => round($dedTotal, 2),
                'paid_amount' => round($dedPaid, 2),
                'remaining_amount' => round(max(0.0, $dedTotal - $dedPaid), 2),
                'by_type' => array_values($dedByType),
            ],
        ];
    }

    /**
     * Block 4: Attendance, Punctuality & Absenteeism.
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildAttendanceSection(array &$ctx): array
    {
        $tenantIds = $ctx['tenantIds'];
        $tenantMap = $ctx['tenantMap'];
        $shared = $this->getSharedCounts($ctx);
        $startDate = $ctx['startDate'];
        $endDate = $ctx['endDate'];
        $todayDate = $ctx['todayDate'];
        $limit = $ctx['limit'];

        if ($tenantIds === []) {
            return [
                'today' => [
                    'date' => $todayDate,
                    'total_active_employees' => 0,
                    'scheduled_today' => 0,
                    'present' => 0,
                    'late' => 0,
                    'absent' => 0,
                    'half_day' => 0,
                    'justified' => 0,
                    'on_leave_or_vacation' => 0,
                    'not_clocked_in_yet' => 0,
                    'attendance_rate_today' => 0.0,
                ],
                'period_summary' => [
                    'total_records' => 0,
                    'present_count' => 0,
                    'late_count' => 0,
                    'absent_count' => 0,
                    'half_day_count' => 0,
                    'justified_count' => 0,
                    'deductible_absences_count' => 0,
                    'attendance_rate' => 0.0,
                    'absenteeism_rate' => 0.0,
                    'total_worked_hours' => 0.0,
                    'total_late_minutes' => 0,
                    'total_overtime_hours' => 0.0,
                    'total_overtime_amount' => 0.0,
                    'lateness_events_count' => 0,
                    'employees_without_shift_count' => 0,
                ],
                'by_status' => [],
                'by_company' => [],
                'top_late_departments' => [],
            ];
        }

        $todayRecords = AttendanceRecord::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereDate('date', $todayDate)
            ->get(['tenant_id', 'employee_id', 'status']);

        $todayStatusCounts = $todayRecords->countBy('status');
        $recordedTodayEmpIds = $todayRecords->pluck('employee_id')->unique()->map(fn ($id) => (int) $id)->all();
        $onLeaveTodayIds = $shared['on_leave_today_employee_ids'];
        $scheduledActiveIds = array_values(array_intersect(
            $shared['active_approved_employee_ids'],
            $shared['scheduled_employee_ids'],
        ));
        $notClockedInIds = array_diff($scheduledActiveIds, $recordedTodayEmpIds, $onLeaveTodayIds);

        $todayPresent = (int) ($todayStatusCounts['present'] ?? 0);
        $todayLate = (int) ($todayStatusCounts['late'] ?? 0);
        $todayHalfDay = (int) ($todayStatusCounts['half_day'] ?? 0);
        $todayAbsent = (int) ($todayStatusCounts['absent'] ?? 0);
        $todayJustified = (int) ($todayStatusCounts['justified'] ?? 0);
        $todayLeaveRecords = (int) ($todayStatusCounts['vacation'] ?? 0) + (int) ($todayStatusCounts['sick'] ?? 0);
        $onLeaveOrVacationToday = max(count($onLeaveTodayIds), $todayLeaveRecords);

        $scheduledCount = count($scheduledActiveIds);
        $attendedToday = $todayPresent + $todayLate + $todayHalfDay;
        $attendanceRateToday = $scheduledCount > 0
            ? round(($attendedToday / $scheduledCount) * 100, 2)
            : 0.0;

        $totalActiveEmployees = Employee::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'active')
            ->count();

        $periodRecords = AttendanceRecord::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereDate('date', '>=', $startDate)
            ->whereDate('date', '<=', $endDate)
            ->get([
                'tenant_id',
                'employee_id',
                'status',
                'deduct_from_salary',
                'total_worked',
                'late_minutes',
                'overtime_minutes',
                'overtime_amount',
            ]);

        $byStatus = [];
        $deductibleAbsences = 0;
        $totalWorkedMinutes = 0;
        $totalLateMinutes = 0;
        $totalOvertimeMinutes = 0;
        $totalOvertimeAmount = 0.0;
        $companyStats = [];

        foreach ($ctx['tenants'] as $t) {
            $companyStats[$t->id] = [
                'tenant_id' => $t->id,
                'tenant_name' => $t->name,
                'records' => 0,
                'present' => 0,
                'late' => 0,
                'absent' => 0,
                'worked_hours' => 0.0,
                'late_minutes' => 0,
                'overtime_hours' => 0.0,
                'overtime_amount' => 0.0,
            ];
        }

        foreach ($periodRecords as $rec) {
            $st = $rec->status ?? 'present';
            $byStatus[$st] = ($byStatus[$st] ?? 0) + 1;
            if ($st === 'absent' && $rec->deduct_from_salary) {
                $deductibleAbsences++;
            }

            $worked = (int) ($rec->total_worked ?? 0);
            $late = (int) ($rec->late_minutes ?? 0);
            $otMin = (int) ($rec->overtime_minutes ?? 0);
            $otAmt = (float) ($rec->overtime_amount ?? 0);

            $totalWorkedMinutes += $worked;
            $totalLateMinutes += $late;
            $totalOvertimeMinutes += $otMin;
            $totalOvertimeAmount += $otAmt;

            if (isset($companyStats[$rec->tenant_id])) {
                $companyStats[$rec->tenant_id]['records']++;
                if (in_array($st, ['present', 'late', 'half_day'], true)) {
                    $companyStats[$rec->tenant_id]['present']++;
                }
                if ($st === 'late') {
                    $companyStats[$rec->tenant_id]['late']++;
                }
                if ($st === 'absent') {
                    $companyStats[$rec->tenant_id]['absent']++;
                }
                $companyStats[$rec->tenant_id]['worked_hours'] += $worked / 60;
                $companyStats[$rec->tenant_id]['late_minutes'] += $late;
                $companyStats[$rec->tenant_id]['overtime_hours'] += $otMin / 60;
                $companyStats[$rec->tenant_id]['overtime_amount'] += $otAmt;
            }
        }

        foreach ($companyStats as &$cs) {
            $cs['worked_hours'] = round($cs['worked_hours'], 2);
            $cs['overtime_hours'] = round($cs['overtime_hours'], 2);
            $cs['overtime_amount'] = round($cs['overtime_amount'], 2);
        }
        unset($cs);

        $totalRecords = $periodRecords->count();
        $presentCount = (int) ($byStatus['present'] ?? 0);
        $lateCount = (int) ($byStatus['late'] ?? 0);
        $absentCount = (int) ($byStatus['absent'] ?? 0);
        $halfDayCount = (int) ($byStatus['half_day'] ?? 0);
        $justifiedCount = (int) ($byStatus['justified'] ?? 0);

        $attendedPeriod = $presentCount + $lateCount + $halfDayCount;
        $attendanceRate = $totalRecords > 0 ? round(($attendedPeriod / $totalRecords) * 100, 2) : 0.0;
        $absenteeismRate = $totalRecords > 0 ? round(($absentCount / $totalRecords) * 100, 2) : 0.0;

        $latenessEventsCount = EmployeeLatenessEvent::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereDate('occurred_on', '>=', $startDate)
            ->whereDate('occurred_on', '<=', $endDate)
            ->count();

        $topLateDepartments = DB::table('attendance_records')
            ->join('employees', 'employees.id', '=', 'attendance_records.employee_id')
            ->leftJoin('departments', function ($join): void {
                $join->on('departments.id', '=', 'employees.department_id')
                    ->whereNull('departments.deleted_at');
            })
            ->whereIn('attendance_records.tenant_id', $tenantIds)
            ->whereNull('employees.deleted_at')
            ->whereDate('attendance_records.date', '>=', $startDate)
            ->whereDate('attendance_records.date', '<=', $endDate)
            ->groupBy('attendance_records.tenant_id', 'departments.id', 'departments.name')
            ->selectRaw('
                attendance_records.tenant_id,
                departments.id as department_id,
                COALESCE(departments.name, \'Sem departamento\') as department_name,
                SUM(COALESCE(attendance_records.late_minutes, 0)) as late_minutes,
                SUM(CASE WHEN attendance_records.status = \'absent\' THEN 1 ELSE 0 END) as absent_count,
                COUNT(attendance_records.id) as records_count
            ')
            ->orderByDesc('late_minutes')
            ->orderByDesc('absent_count')
            ->limit($limit)
            ->get()
            ->map(fn ($row) => [
                'tenant_id' => (int) $row->tenant_id,
                'tenant_name' => $tenantMap->get((int) $row->tenant_id)?->name,
                'department_id' => $row->department_id !== null ? (int) $row->department_id : null,
                'department_name' => $row->department_name,
                'late_minutes' => (int) $row->late_minutes,
                'absent_count' => (int) $row->absent_count,
                'records_count' => (int) $row->records_count,
            ])
            ->values()
            ->all();

        return [
            'today' => [
                'date' => $todayDate,
                'total_active_employees' => $totalActiveEmployees,
                'scheduled_today' => $scheduledCount,
                'present' => $todayPresent,
                'late' => $todayLate,
                'absent' => $todayAbsent,
                'half_day' => $todayHalfDay,
                'justified' => $todayJustified,
                'on_leave_or_vacation' => $onLeaveOrVacationToday,
                'not_clocked_in_yet' => count($notClockedInIds),
                'attendance_rate_today' => $attendanceRateToday,
            ],
            'period_summary' => [
                'total_records' => $totalRecords,
                'present_count' => $presentCount,
                'late_count' => $lateCount,
                'absent_count' => $absentCount,
                'half_day_count' => $halfDayCount,
                'justified_count' => $justifiedCount,
                'deductible_absences_count' => $deductibleAbsences,
                'attendance_rate' => $attendanceRate,
                'absenteeism_rate' => $absenteeismRate,
                'total_worked_hours' => round($totalWorkedMinutes / 60, 2),
                'total_late_minutes' => $totalLateMinutes,
                'total_overtime_hours' => round($totalOvertimeMinutes / 60, 2),
                'total_overtime_amount' => round($totalOvertimeAmount, 2),
                'lateness_events_count' => $latenessEventsCount,
                'employees_without_shift_count' => count($shared['employees_without_shift_ids']),
            ],
            'by_status' => $byStatus,
            'by_company' => array_values($companyStats),
            'top_late_departments' => $topLateDepartments,
        ];
    }

    /**
     * Block 5A: Leaves & Absences.
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildLeavesSection(array &$ctx): array
    {
        $tenantIds = $ctx['tenantIds'];
        $tenantMap = $ctx['tenantMap'];
        $shared = $this->getSharedCounts($ctx);
        $startDate = $ctx['startDate'];
        $endDate = $ctx['endDate'];
        $todayDate = $ctx['todayDate'];
        $next30Date = $ctx['today']->copy()->addDays(30)->toDateString();
        $limit = $ctx['limit'];

        if ($tenantIds === []) {
            return [
                'kpis' => [
                    'pending_count' => 0,
                    'approved_in_range' => 0,
                    'rejected_in_range' => 0,
                    'on_leave_today_count' => 0,
                    'upcoming_30d_count' => 0,
                    'total_approved_days_in_range' => 0,
                ],
                'by_type' => [],
                'by_company' => [],
                'pending_list' => [],
                'on_leave_today' => [],
                'upcoming' => [],
            ];
        }

        $approvedInRangeQuery = LeaveRequest::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $endDate)
            ->whereDate('end_date', '>=', $startDate);

        $approvedInRange = (clone $approvedInRangeQuery)->count();
        $totalApprovedDaysInRange = (int) (clone $approvedInRangeQuery)->sum('total_days');

        $rejectedInRange = LeaveRequest::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'rejected')
            ->whereDate('start_date', '<=', $endDate)
            ->whereDate('end_date', '>=', $startDate)
            ->count();

        $upcoming30Query = LeaveRequest::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'approved')
            ->whereDate('start_date', '>', $todayDate)
            ->whereDate('start_date', '<=', $next30Date);

        $upcoming30Count = (clone $upcoming30Query)->count();

        $byType = DB::table('leave_requests')
            ->leftJoin('leave_types', 'leave_types.id', '=', 'leave_requests.leave_type_id')
            ->whereIn('leave_requests.tenant_id', $tenantIds)
            ->where('leave_requests.status', 'approved')
            ->whereDate('leave_requests.start_date', '<=', $endDate)
            ->whereDate('leave_requests.end_date', '>=', $startDate)
            ->groupBy('leave_types.name')
            ->selectRaw('COALESCE(leave_types.name, \'Outro\') as leave_type, COUNT(leave_requests.id) as requests_count, SUM(COALESCE(leave_requests.total_days, 0)) as total_days')
            ->orderByDesc('total_days')
            ->get()
            ->map(fn ($r) => [
                'leave_type' => $r->leave_type,
                'requests_count' => (int) $r->requests_count,
                'total_days' => (int) $r->total_days,
            ])
            ->values()
            ->all();

        $pendingByTenant = LeaveRequest::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'pending')
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, COUNT(*) as total')
            ->pluck('total', 'tenant_id');

        $approvedByTenant = (clone $approvedInRangeQuery)
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, COUNT(*) as total')
            ->pluck('total', 'tenant_id');

        $byCompany = $ctx['tenants']->map(fn (Tenant $t) => [
            'tenant_id' => $t->id,
            'tenant_name' => $t->name,
            'pending_count' => (int) ($pendingByTenant[$t->id] ?? 0),
            'approved_in_range' => (int) ($approvedByTenant[$t->id] ?? 0),
            'on_leave_today_count' => (int) ($shared['on_leave_today_by_tenant'][$t->id] ?? 0),
        ])->values()->all();

        $mapLeaveItem = fn (LeaveRequest $leave) => [
            'id' => $leave->id,
            'tenant_id' => $leave->tenant_id,
            'tenant_name' => $tenantMap->get($leave->tenant_id)?->name,
            'employee_id' => $leave->employee_id,
            'employee_name' => $leave->employee?->full_name,
            'leave_type' => $leave->leaveType?->name,
            'start_date' => $leave->start_date?->toDateString(),
            'end_date' => $leave->end_date?->toDateString(),
            'total_days' => (int) $leave->total_days,
            'status' => $leave->status,
        ];

        $pendingList = LeaveRequest::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'pending')
            ->with([
                'employee' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->select('id', 'first_name', 'last_name'),
                'leaveType' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->select('id', 'name'),
            ])
            ->orderBy('start_date')
            ->limit($limit)
            ->get()
            ->map($mapLeaveItem)
            ->values()
            ->all();

        $onLeaveToday = LeaveRequest::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $todayDate)
            ->whereDate('end_date', '>=', $todayDate)
            ->with([
                'employee' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->select('id', 'first_name', 'last_name'),
                'leaveType' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->select('id', 'name'),
            ])
            ->orderBy('end_date')
            ->limit($limit)
            ->get()
            ->map($mapLeaveItem)
            ->values()
            ->all();

        $upcoming = (clone $upcoming30Query)
            ->with([
                'employee' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->select('id', 'first_name', 'last_name'),
                'leaveType' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->select('id', 'name'),
            ])
            ->orderBy('start_date')
            ->limit($limit)
            ->get()
            ->map($mapLeaveItem)
            ->values()
            ->all();

        return [
            'kpis' => [
                'pending_count' => $shared['pending_leaves_count'],
                'approved_in_range' => $approvedInRange,
                'rejected_in_range' => $rejectedInRange,
                'on_leave_today_count' => count($shared['on_leave_today_employee_ids']),
                'upcoming_30d_count' => $upcoming30Count,
                'total_approved_days_in_range' => $totalApprovedDaysInRange,
            ],
            'by_type' => $byType,
            'by_company' => $byCompany,
            'pending_list' => $pendingList,
            'on_leave_today' => $onLeaveToday,
            'upcoming' => $upcoming,
        ];
    }

    /**
     * Block 5B: Compliance (Contracts, Documents, Disciplinary Warnings & Assets).
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildComplianceSection(array &$ctx): array
    {
        $tenantIds = $ctx['tenantIds'];
        $tenantMap = $ctx['tenantMap'];
        $shared = $this->getSharedCounts($ctx);
        $startDate = $ctx['startDate'];
        $endDate = $ctx['endDate'];
        $today = $ctx['today'];
        $todayDate = $ctx['todayDate'];
        $date60 = $today->copy()->addDays(60)->toDateString();
        $date90 = $today->copy()->addDays(90)->toDateString();
        $date30 = $today->copy()->addDays(30)->toDateString();
        $limit = $ctx['limit'];

        if ($tenantIds === []) {
            return [
                'contracts' => [
                    'active_count' => 0,
                    'expiring_30d_count' => 0,
                    'expiring_60d_count' => 0,
                    'expiring_90d_count' => 0,
                    'expired_still_active_count' => 0,
                    'terminated_in_range_count' => 0,
                    'settlement_net_total_in_range' => 0.0,
                    'by_type' => [],
                    'expiring_soon' => [],
                ],
                'documents' => [
                    'total_count' => 0,
                    'verified_count' => 0,
                    'unverified_count' => 0,
                    'expired_count' => 0,
                    'expiring_30d_count' => 0,
                ],
                'disciplinary_warnings' => [
                    'total_in_range' => 0,
                    'signed_count' => 0,
                    'unsigned_count' => 0,
                    'recent' => [],
                ],
                'assets' => [
                    'total_count' => 0,
                    'by_status' => [],
                    'by_category' => [],
                    'total_estimated_value' => 0.0,
                    'pending_liability_total' => 0.0,
                    'overdue_returns_count' => 0,
                ],
            ];
        }

        $activeContracts = EmployeeContract::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('is_active', true)
            ->get(['id', 'tenant_id', 'employee_id', 'contract_type', 'end_date']);

        $contractsByType = $activeContracts->countBy('contract_type')->all();
        $expiring60 = $activeContracts
            ->filter(fn (EmployeeContract $c) => $c->end_date !== null && $c->end_date->toDateString() >= $todayDate && $c->end_date->toDateString() <= $date60)
            ->count();

        $terminatedContracts = EmployeeContract::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereNotNull('terminated_at')
            ->whereDate('terminated_at', '>=', $startDate)
            ->whereDate('terminated_at', '<=', $endDate)
            ->get(['net_settlement']);

        $expiringSoon = EmployeeContract::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('is_active', true)
            ->whereNotNull('end_date')
            ->whereDate('end_date', '>=', $todayDate)
            ->whereDate('end_date', '<=', $date90)
            ->with(['employee' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->select('id', 'first_name', 'last_name', 'employee_code')])
            ->orderBy('end_date')
            ->limit($limit)
            ->get()
            ->map(fn (EmployeeContract $c) => [
                'id' => $c->id,
                'tenant_id' => $c->tenant_id,
                'tenant_name' => $tenantMap->get($c->tenant_id)?->name,
                'employee_id' => $c->employee_id,
                'employee_name' => $c->employee?->full_name,
                'employee_code' => $c->employee?->employee_code,
                'contract_type' => $c->contract_type,
                'end_date' => $c->end_date?->toDateString(),
                'days_remaining' => (int) $today->diffInDays($c->end_date->copy()->startOfDay(), false),
            ])
            ->values()
            ->all();

        $totalDocs = EmployeeDocument::withoutGlobalScope(TenantScope::class)->whereIn('tenant_id', $tenantIds)->count();
        $verifiedDocs = EmployeeDocument::withoutGlobalScope(TenantScope::class)->whereIn('tenant_id', $tenantIds)->where('is_verified', true)->count();
        $expiring30Docs = EmployeeDocument::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereNotNull('expiry_date')
            ->whereDate('expiry_date', '>=', $todayDate)
            ->whereDate('expiry_date', '<=', $date30)
            ->count();

        $warningsInRangeQuery = EmployeeEducation::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where(function ($q) use ($startDate, $endDate): void {
                $q->where(fn ($sub) => $sub->whereNotNull('occurred_on')->whereDate('occurred_on', '>=', $startDate)->whereDate('occurred_on', '<=', $endDate))
                    ->orWhere(fn ($sub) => $sub->whereNull('occurred_on')->whereDate('created_at', '>=', $startDate)->whereDate('created_at', '<=', $endDate));
            });

        $warningsInRangeCount = (clone $warningsInRangeQuery)->count();
        $warningsSignedTotal = EmployeeEducation::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereNotNull('signed_document_path')
            ->count();

        $recentWarnings = (clone $warningsInRangeQuery)
            ->with(['employee' => fn ($q) => $q->withoutGlobalScope(TenantScope::class)->select('id', 'first_name', 'last_name')])
            ->latest('id')
            ->limit($limit)
            ->get()
            ->map(fn (EmployeeEducation $w) => [
                'id' => $w->id,
                'tenant_id' => $w->tenant_id,
                'tenant_name' => $tenantMap->get($w->tenant_id)?->name,
                'employee_id' => $w->employee_id,
                'employee_name' => $w->employee?->full_name,
                'title' => $w->title,
                'occurred_on' => $w->occurred_on?->toDateString(),
                'is_signed' => $w->signed_document_path !== null,
            ])
            ->values()
            ->all();

        $assets = EmployeeAsset::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->get([
                'id',
                'tenant_id',
                'category',
                'condition',
                'status',
                'estimated_value',
                'chargeable_amount',
                'deduct_on_termination',
                'is_settled',
                'expected_return_at',
            ]);

        $assetsEstimatedTotal = 0.0;
        $assetsLiabilityTotal = 0.0;
        $overdueReturnsCount = 0;

        foreach ($assets as $asset) {
            $assetsEstimatedTotal += (float) ($asset->estimated_value ?? 0);
            $assetsLiabilityTotal += $asset->pendingLiabilityAmount();
            if (
                $asset->status === 'assigned'
                && $asset->expected_return_at !== null
                && $asset->expected_return_at->lt($today)
            ) {
                $overdueReturnsCount++;
            }
        }

        return [
            'contracts' => [
                'active_count' => $activeContracts->count(),
                'expiring_30d_count' => $shared['expiring_30_contracts_count'],
                'expiring_60d_count' => $expiring60,
                'expiring_90d_count' => $shared['expiring_90_contracts_count'],
                'expired_still_active_count' => $shared['expired_active_contracts_count'],
                'terminated_in_range_count' => $terminatedContracts->count(),
                'settlement_net_total_in_range' => round((float) $terminatedContracts->sum('net_settlement'), 2),
                'by_type' => $contractsByType,
                'expiring_soon' => $expiringSoon,
            ],
            'documents' => [
                'total_count' => $totalDocs,
                'verified_count' => $verifiedDocs,
                'unverified_count' => $shared['unverified_documents_count'],
                'expired_count' => $shared['expired_documents_count'],
                'expiring_30d_count' => $expiring30Docs,
            ],
            'disciplinary_warnings' => [
                'total_in_range' => $warningsInRangeCount,
                'signed_count' => $warningsSignedTotal,
                'unsigned_count' => $shared['unsigned_warnings_count'],
                'recent' => $recentWarnings,
            ],
            'assets' => [
                'total_count' => $assets->count(),
                'by_status' => $assets->countBy('status')->all(),
                'by_category' => $assets->countBy('category')->all(),
                'total_estimated_value' => round($assetsEstimatedTotal, 2),
                'pending_liability_total' => round($assetsLiabilityTotal, 2),
                'overdue_returns_count' => $overdueReturnsCount,
            ],
        ];
    }

    /**
     * Block 6: Talent & HR Operations (Recruitment, Performance, Trainings & Onboarding).
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildTalentSection(array &$ctx): array
    {
        $tenantIds = $ctx['tenantIds'];
        $shared = $this->getSharedCounts($ctx);
        $startDay = $ctx['startDay'];
        $endDay = $ctx['endDay'];

        if ($tenantIds === []) {
            return [
                'recruitment' => [
                    'open_jobs_count' => 0,
                    'total_openings_positions' => 0,
                    'candidates_total' => 0,
                    'candidates_in_range' => 0,
                    'hired_in_range' => 0,
                    'candidates_by_stage' => [],
                ],
                'performance' => [
                    'total_in_range' => 0,
                    'by_status' => [],
                    'pending_approval_count' => 0,
                    'average_score' => null,
                ],
                'trainings' => [
                    'total_trainings' => 0,
                    'active_or_planned_count' => 0,
                    'completed_count' => 0,
                    'total_cost_in_range' => 0.0,
                    'assignments_total' => 0,
                    'assignments_completed' => 0,
                    'completion_rate' => 0.0,
                ],
                'onboarding' => [
                    'pending_count' => 0,
                    'in_progress_count' => 0,
                    'completed_in_range' => 0,
                    'overdue_count' => 0,
                ],
            ];
        }

        $openJobs = JobOpening::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'open')
            ->get(['id', 'openings_count']);

        $candidates = Candidate::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->get(['id', 'status', 'applied_at', 'last_status_at', 'created_at']);

        $candidatesInRange = 0;
        $hiredInRange = 0;
        foreach ($candidates as $cand) {
            $appliedRef = $cand->applied_at ?? $cand->created_at;
            if ($appliedRef && $appliedRef->between($startDay, $endDay)) {
                $candidatesInRange++;
            }
            $hiredRef = $cand->last_status_at ?? $cand->created_at;
            if ($cand->status === 'hired' && $hiredRef && $hiredRef->between($startDay, $endDay)) {
                $hiredInRange++;
            }
        }

        $evaluationsInRange = PerformanceEvaluation::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereBetween('created_at', [$startDay, $endDay])
            ->get(['status', 'score']);

        $scores = $evaluationsInRange->pluck('score')->filter(fn ($s) => $s !== null)->map(fn ($s) => (float) $s);

        $trainings = Training::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->get(['status', 'cost', 'start_date', 'created_at']);

        $trainingCostInRange = 0.0;
        foreach ($trainings as $tr) {
            $ref = $tr->start_date?->startOfDay() ?? $tr->created_at;
            if ($ref && $ref->between($startDay, $endDay)) {
                $trainingCostInRange += (float) ($tr->cost ?? 0);
            }
        }

        $assignmentsTotal = TrainingAssignment::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->count();
        $assignmentsCompleted = TrainingAssignment::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'completed')
            ->count();

        $onboardingPending = OnboardingTask::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'pending')
            ->count();
        $onboardingInProgress = OnboardingTask::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'in_progress')
            ->count();
        $onboardingCompletedInRange = OnboardingTask::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'completed')
            ->whereBetween('completed_at', [$startDay, $endDay])
            ->count();

        return [
            'recruitment' => [
                'open_jobs_count' => $openJobs->count(),
                'total_openings_positions' => (int) $openJobs->sum('openings_count'),
                'candidates_total' => $candidates->count(),
                'candidates_in_range' => $candidatesInRange,
                'hired_in_range' => $hiredInRange,
                'candidates_by_stage' => $candidates->countBy('status')->all(),
            ],
            'performance' => [
                'total_in_range' => $evaluationsInRange->count(),
                'by_status' => $evaluationsInRange->countBy('status')->all(),
                'pending_approval_count' => $shared['pending_evaluations_count'],
                'average_score' => $scores->isNotEmpty() ? round($scores->avg(), 2) : null,
            ],
            'trainings' => [
                'total_trainings' => $trainings->count(),
                'active_or_planned_count' => $trainings->whereIn('status', ['planned', 'open', 'in_progress'])->count(),
                'completed_count' => $trainings->where('status', 'completed')->count(),
                'total_cost_in_range' => round($trainingCostInRange, 2),
                'assignments_total' => $assignmentsTotal,
                'assignments_completed' => $assignmentsCompleted,
                'completion_rate' => $assignmentsTotal > 0 ? round(($assignmentsCompleted / $assignmentsTotal) * 100, 2) : 0.0,
            ],
            'onboarding' => [
                'pending_count' => $onboardingPending,
                'in_progress_count' => $onboardingInProgress,
                'completed_in_range' => $onboardingCompletedInRange,
                'overdue_count' => $shared['overdue_onboarding_count'],
            ],
        ];
    }

    /**
     * Block 7: SaaS Platform, Subscriptions, Billing & Quotas.
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildSaasSection(array &$ctx): array
    {
        $tenants = $ctx['tenants'];
        $tenantIds = $ctx['tenantIds'];
        $tenantMap = $ctx['tenantMap'];
        $startDay = $ctx['startDay'];
        $endDay = $ctx['endDay'];
        $today = $ctx['today'];
        $todayDate = $ctx['todayDate'];
        $limit = $ctx['limit'];

        if ($tenantIds === []) {
            return [
                'tenants' => [
                    'total' => 0,
                    'active' => 0,
                    'inactive' => 0,
                    'suspended' => 0,
                    'new_in_range' => 0,
                    'segments' => ['small' => 0, 'medium' => 0, 'large' => 0],
                    'tenant_trend' => [],
                ],
                'users' => [
                    'total_users' => 0,
                    'active_users' => 0,
                    'super_admins' => 0,
                    'logged_in_last_30d' => 0,
                ],
                'subscriptions' => [
                    'by_status' => [],
                    'expiring_30d_count' => 0,
                    'by_plan' => [],
                ],
                'billing' => [
                    'invoiced_in_range' => 0.0,
                    'paid_in_range' => 0.0,
                    'paid_this_month' => 0.0,
                    'open_total' => 0.0,
                    'overdue_total' => 0.0,
                    'overdue_count' => 0,
                    'under_review_count' => 0,
                    'pending_payments_count' => 0,
                    'pending_payments_amount' => 0.0,
                    'recent_pending_payments' => [],
                    'overdue_invoices' => [],
                ],
                'usage' => [
                    'year_month' => now()->format('Y-m'),
                    'ocr_requests_this_month' => 0,
                    'payroll_runs_this_month' => 0,
                    'active_agency_relationships' => 0,
                ],
            ];
        }

        $empCountsByTenant = Employee::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, COUNT(*) as total')
            ->pluck('total', 'tenant_id');

        $segments = ['small' => 0, 'medium' => 0, 'large' => 0];
        foreach ($tenants as $tenant) {
            $cnt = (int) ($empCountsByTenant[$tenant->id] ?? 0);
            if ($cnt <= 10) {
                $segments['small']++;
            } elseif ($cnt <= 50) {
                $segments['medium']++;
            } else {
                $segments['large']++;
            }
        }

        $tenantTrend = collect(range(11, 0))->map(function (int $monthsAgo) use ($tenants) {
            $monthStart = now()->startOfMonth()->subMonths($monthsAgo);
            $monthEnd = $monthStart->copy()->endOfMonth();

            $count = $tenants->filter(
                fn (Tenant $t) => $t->created_at !== null && $t->created_at->between($monthStart, $monthEnd)
            )->count();

            return [
                'month' => $monthStart->format('Y-m'),
                'label' => $monthStart->format('M/y'),
                'count' => $count,
            ];
        })->values()->all();

        $usersQuery = User::query()->where(function ($q) use ($tenantIds): void {
            $q->whereIn('tenant_id', $tenantIds)
                ->orWhereHas('tenantAccesses', fn ($aq) => $aq->whereIn('tenant_id', $tenantIds)->where('is_active', true));
        });

        $totalUsers = (clone $usersQuery)->count();
        $activeUsers = (clone $usersQuery)->where('is_active', true)->count();
        $loggedLast30d = (clone $usersQuery)->where('last_login_at', '>=', now()->subDays(30))->count();
        $superAdminsCount = User::query()
            ->whereHas('roles', fn ($q) => $q->whereIn('name', ['super-admin', 'super-admin-limited']))
            ->count();

        $latestSubIds = TenantSubscription::query()
            ->whereIn('tenant_id', $tenantIds)
            ->selectRaw('MAX(id) as id')
            ->groupBy('tenant_id')
            ->pluck('id')
            ->all();

        $subscriptions = $latestSubIds === []
            ? collect()
            : TenantSubscription::query()
                ->whereIn('id', $latestSubIds)
                ->with('plan:id,name,slug,base_price,currency')
                ->get();

        $subsByStatus = $subscriptions->countBy('status')->all();
        $expiring30Subs = $subscriptions->filter(function (TenantSubscription $sub) use ($today, $todayDate) {
            if (! in_array($sub->status, TenantSubscription::ACTIVE_STATUSES, true) || $sub->ends_at === null) {
                return false;
            }
            $endStr = $sub->ends_at->toDateString();

            return $endStr >= $todayDate && $endStr <= $today->copy()->addDays(30)->toDateString();
        })->count();

        $byPlan = [];
        foreach ($subscriptions as $sub) {
            $planKey = $sub->plan_id ?? 0;
            if (! isset($byPlan[$planKey])) {
                $byPlan[$planKey] = [
                    'plan_id' => $sub->plan_id,
                    'plan_name' => $sub->plan?->name ?? 'Sem plano',
                    'currency' => $sub->plan?->currency ?? 'AOA',
                    'total_subscriptions' => 0,
                    'active_subscriptions' => 0,
                    'estimated_recurring_revenue' => 0.0,
                ];
            }
            $byPlan[$planKey]['total_subscriptions']++;
            if (in_array($sub->status, TenantSubscription::ACTIVE_STATUSES, true)) {
                $byPlan[$planKey]['active_subscriptions']++;
                $byPlan[$planKey]['estimated_recurring_revenue'] = round(
                    $byPlan[$planKey]['estimated_recurring_revenue'] + $sub->effectiveBasePrice(),
                    2,
                );
            }
        }

        $invoices = SubscriptionInvoice::query()
            ->whereIn('tenant_id', $tenantIds)
            ->get(['id', 'invoice_number', 'tenant_id', 'total_amount', 'currency', 'status', 'due_date', 'paid_at', 'created_at']);

        $invoicedInRange = 0.0;
        $paidInRange = 0.0;
        $paidThisMonth = 0.0;
        $openTotal = 0.0;
        $overdueTotal = 0.0;
        $overdueCount = 0;
        $underReviewCount = 0;
        $overdueList = [];

        $curYear = now()->year;
        $curMonth = now()->month;

        foreach ($invoices as $inv) {
            $amt = (float) ($inv->total_amount ?? 0);
            if ($inv->created_at && $inv->created_at->between($startDay, $endDay)) {
                $invoicedInRange += $amt;
            }
            if ($inv->status === 'paid' && $inv->paid_at) {
                if ($inv->paid_at->between($startDay, $endDay)) {
                    $paidInRange += $amt;
                }
                if ((int) $inv->paid_at->year === $curYear && (int) $inv->paid_at->month === $curMonth) {
                    $paidThisMonth += $amt;
                }
            }
            if (in_array($inv->status, ['open', 'overdue'], true)) {
                $openTotal += $amt;
            }
            if ($inv->status === 'under_review') {
                $underReviewCount++;
            }
            $isOverdue = $inv->status === 'overdue'
                || ($inv->status === 'open' && $inv->due_date !== null && $inv->due_date->toDateString() < $todayDate);
            if ($isOverdue) {
                $overdueTotal += $amt;
                $overdueCount++;
                $overdueList[] = [
                    'id' => $inv->id,
                    'invoice_number' => $inv->invoice_number,
                    'tenant_id' => $inv->tenant_id,
                    'tenant_name' => $tenantMap->get($inv->tenant_id)?->name,
                    'total_amount' => round($amt, 2),
                    'currency' => $inv->currency,
                    'due_date' => $inv->due_date?->toDateString(),
                    'status' => $inv->status,
                ];
            }
        }

        usort($overdueList, fn (array $a, array $b) => strcmp((string) $a['due_date'], (string) $b['due_date']));

        $pendingPayments = SubscriptionPayment::query()
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'pending')
            ->with(['invoice:id,invoice_number', 'submitter:id,name,email'])
            ->latest('id')
            ->get();

        $recentPendingPayments = $pendingPayments->take($limit)->map(fn (SubscriptionPayment $p) => [
            'id' => $p->id,
            'tenant_id' => $p->tenant_id,
            'tenant_name' => $tenantMap->get($p->tenant_id)?->name,
            'invoice_id' => $p->invoice_id,
            'invoice_number' => $p->invoice?->invoice_number,
            'amount' => round((float) $p->amount, 2),
            'currency' => $p->currency,
            'payment_method' => $p->payment_method,
            'payment_date' => $p->payment_date?->toDateString(),
            'submitted_by' => $p->submitter?->name,
        ])->values()->all();

        $yearMonth = now()->format('Y-m');
        $usage = TenantMonthlyUsage::query()
            ->whereIn('tenant_id', $tenantIds)
            ->where('year_month', $yearMonth)
            ->selectRaw('SUM(ocr_requests) as ocr_total, SUM(payroll_runs) as payroll_total')
            ->first();

        $activeRelationships = TenantRelationship::query()
            ->where('status', 'active')
            ->where(function ($q) use ($tenantIds): void {
                $q->whereIn('manager_tenant_id', $tenantIds)
                    ->orWhereIn('managed_tenant_id', $tenantIds);
            })
            ->count();

        return [
            'tenants' => [
                'total' => $tenants->count(),
                'active' => $tenants->where('status', 'active')->count(),
                'inactive' => $tenants->where('status', 'inactive')->count(),
                'suspended' => $tenants->where('status', 'suspended')->count(),
                'new_in_range' => $tenants->filter(fn (Tenant $t) => $t->created_at && $t->created_at->between($startDay, $endDay))->count(),
                'segments' => $segments,
                'tenant_trend' => $tenantTrend,
            ],
            'users' => [
                'total_users' => $totalUsers,
                'active_users' => $activeUsers,
                'super_admins' => $superAdminsCount,
                'logged_in_last_30d' => $loggedLast30d,
            ],
            'subscriptions' => [
                'by_status' => $subsByStatus,
                'expiring_30d_count' => $expiring30Subs,
                'by_plan' => array_values($byPlan),
            ],
            'billing' => [
                'invoiced_in_range' => round($invoicedInRange, 2),
                'paid_in_range' => round($paidInRange, 2),
                'paid_this_month' => round($paidThisMonth, 2),
                'open_total' => round($openTotal, 2),
                'overdue_total' => round($overdueTotal, 2),
                'overdue_count' => $overdueCount,
                'under_review_count' => $underReviewCount,
                'pending_payments_count' => $pendingPayments->count(),
                'pending_payments_amount' => round((float) $pendingPayments->sum('amount'), 2),
                'recent_pending_payments' => $recentPendingPayments,
                'overdue_invoices' => array_slice($overdueList, 0, $limit),
            ],
            'usage' => [
                'year_month' => $yearMonth,
                'ocr_requests_this_month' => (int) ($usage->ocr_total ?? 0),
                'payroll_runs_this_month' => (int) ($usage->payroll_total ?? 0),
                'active_agency_relationships' => $activeRelationships,
            ],
        ];
    }

    /**
     * Block 8: Audit & Traceability Feed.
     *
     * @param  array<string, mixed>  $ctx
     * @return array<string, mixed>
     */
    private function buildAuditSection(array &$ctx): array
    {
        $tenantIds = $ctx['tenantIds'];
        $tenantMap = $ctx['tenantMap'];
        $startDay = $ctx['startDay'];
        $endDay = $ctx['endDay'];
        $limit = $ctx['limit'];
        $auditScope = $ctx['auditScope'];
        $auditDetails = $ctx['auditDetails'];

        if ($tenantIds === []) {
            return [
                'summary' => [
                    'total_in_range' => 0,
                    'by_event' => [],
                    'by_resource' => [],
                ],
                'recent' => [],
            ];
        }

        $baseQuery = Audit::withoutGlobalScope(TenantScope::class)
            ->where(function ($q) use ($tenantIds): void {
                $q->whereIn('tenant_id', $tenantIds)
                    ->orWhere(function ($sq) use ($tenantIds): void {
                        $sq->where('auditable_type', Tenant::class)
                            ->whereIn('auditable_id', $tenantIds);
                    });
            })
            ->whereBetween('created_at', [$startDay, $endDay]);

        $totalInRange = (clone $baseQuery)->count();

        $byEvent = (clone $baseQuery)
            ->groupBy('event')
            ->selectRaw('event, COUNT(*) as total')
            ->pluck('total', 'event')
            ->map(fn ($v) => (int) $v)
            ->all();

        $byResource = (clone $baseQuery)
            ->groupBy('auditable_type')
            ->selectRaw('auditable_type, COUNT(*) as total')
            ->orderByDesc('total')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'resource' => class_basename((string) $row->auditable_type),
                'total' => (int) $row->total,
            ])
            ->values()
            ->all();

        $recentQuery = (clone $baseQuery)
            ->when($auditScope === 'critical', fn ($q) => $q->whereIn('auditable_type', self::CRITICAL_AUDIT_MODELS))
            ->with('user:id,name,email')
            ->orderByDesc('id')
            ->limit($limit)
            ->get();

        $recent = $recentQuery->map(function (Audit $audit) use ($tenantMap, $auditDetails) {
            $resolvedTenantId = $audit->tenant_id ?? ($audit->auditable_type === Tenant::class ? (int) $audit->auditable_id : null);
            $entry = [
                'id' => $audit->id,
                'event' => $audit->event,
                'resource' => class_basename((string) $audit->auditable_type),
                'auditable_id' => $audit->auditable_id,
                'tenant_id' => $resolvedTenantId,
                'tenant_name' => $resolvedTenantId ? $tenantMap->get($resolvedTenantId)?->name : null,
                'user_id' => $audit->user_id,
                'user_name' => $audit->user?->name,
                'ip_address' => $audit->ip_address,
                'created_at' => $audit->created_at?->toIso8601String(),
            ];

            if ($auditDetails) {
                $entry['old_values'] = $audit->old_values;
                $entry['new_values'] = $audit->new_values;
            }

            return $entry;
        })->values()->all();

        return [
            'summary' => [
                'total_in_range' => $totalInRange,
                'by_event' => $byEvent,
                'by_resource' => $byResource,
            ],
            'recent' => $recent,
        ];
    }

    /**
     * Master per-company scorecard combining HR, Attendance, Contracts, Payroll & Billing KPIs.
     *
     * @param  array<string, mixed>  $ctx
     * @return array<int, array<string, mixed>>
     */
    private function buildCompaniesScorecard(array &$ctx): array
    {
        $tenants = $ctx['tenants'];
        $tenantIds = $ctx['tenantIds'];
        $shared = $this->getSharedCounts($ctx);
        $overview = $this->getPayrollOverview($ctx);
        $todayDate = $ctx['todayDate'];
        $date90 = $ctx['today']->copy()->addDays(90)->toDateString();

        if ($tenantIds === []) {
            return [];
        }

        $overviewByTenant = collect($overview['companies'] ?? [])->keyBy('tenant_id');

        $empRows = Employee::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->groupBy('tenant_id')
            ->selectRaw('
                tenant_id,
                COUNT(*) as total_count,
                SUM(CASE WHEN status = \'active\' THEN 1 ELSE 0 END) as active_count
            ')
            ->get()
            ->keyBy('tenant_id');

        $userCounts = User::query()
            ->whereIn('tenant_id', $tenantIds)
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, COUNT(*) as total')
            ->pluck('total', 'tenant_id');

        $attTodayRows = AttendanceRecord::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereDate('date', $todayDate)
            ->groupBy('tenant_id')
            ->selectRaw('
                tenant_id,
                SUM(CASE WHEN status IN (\'present\', \'late\', \'half_day\') THEN 1 ELSE 0 END) as present_count,
                SUM(CASE WHEN status = \'late\' THEN 1 ELSE 0 END) as late_count,
                SUM(CASE WHEN status = \'absent\' THEN 1 ELSE 0 END) as absent_count
            ')
            ->get()
            ->keyBy('tenant_id');

        $pendingLeaves = LeaveRequest::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('status', 'pending')
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, COUNT(*) as total')
            ->pluck('total', 'tenant_id');

        $expiring90 = EmployeeContract::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('is_active', true)
            ->whereNotNull('end_date')
            ->whereDate('end_date', '>=', $todayDate)
            ->whereDate('end_date', '<=', $date90)
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, COUNT(*) as total')
            ->pluck('total', 'tenant_id');

        $baseSalaries = EmployeeContract::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->where('is_active', true)
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, SUM(base_salary) as total_base')
            ->pluck('total_base', 'tenant_id');

        $pendingPayrolls = PayrollPeriod::withoutGlobalScope(TenantScope::class)
            ->whereIn('tenant_id', $tenantIds)
            ->whereIn('status', ['open', 'processing', 'pending_validation', 'pending_approval', 'completed'])
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, COUNT(*) as total')
            ->pluck('total', 'tenant_id');

        $openInvoices = SubscriptionInvoice::query()
            ->whereIn('tenant_id', $tenantIds)
            ->whereIn('status', ['open', 'overdue'])
            ->groupBy('tenant_id')
            ->selectRaw('tenant_id, SUM(total_amount) as total')
            ->pluck('total', 'tenant_id');

        $latestSubIds = TenantSubscription::query()
            ->whereIn('tenant_id', $tenantIds)
            ->selectRaw('MAX(id) as id')
            ->groupBy('tenant_id')
            ->pluck('id')
            ->all();

        $subsByTenant = $latestSubIds === []
            ? collect()
            : TenantSubscription::query()
                ->whereIn('id', $latestSubIds)
                ->with('plan:id,name')
                ->get()
                ->keyBy('tenant_id');

        return $tenants->map(function (Tenant $t) use (
            $empRows,
            $userCounts,
            $attTodayRows,
            $shared,
            $pendingLeaves,
            $expiring90,
            $baseSalaries,
            $overviewByTenant,
            $pendingPayrolls,
            $openInvoices,
            $subsByTenant
        ) {
            $emp = $empRows->get($t->id);
            $att = $attTodayRows->get($t->id);
            $ov = $overviewByTenant->get($t->id);
            $sub = $subsByTenant->get($t->id);

            return [
                'id' => $t->id,
                'name' => $t->name,
                'slug' => $t->slug,
                'tax_id' => $t->tax_id,
                'status' => $t->status,
                'province' => $t->province,
                'economic_sector' => $t->economic_sector,
                'currency' => $t->currency ?? 'AOA',
                'plan_name' => $sub?->plan?->name,
                'subscription_status' => $sub?->status,
                'subscription_ends_at' => $sub?->ends_at?->toIso8601String(),
                'employees_total' => (int) ($emp->total_count ?? 0),
                'employees_active' => (int) ($emp->active_count ?? 0),
                'users_count' => (int) ($userCounts[$t->id] ?? 0),
                'present_today' => (int) ($att->present_count ?? 0),
                'late_today' => (int) ($att->late_count ?? 0),
                'absent_today' => (int) ($att->absent_count ?? 0),
                'on_leave_today' => (int) ($shared['on_leave_today_by_tenant'][$t->id] ?? 0),
                'pending_leaves' => (int) ($pendingLeaves[$t->id] ?? 0),
                'contracts_expiring_90d' => (int) ($expiring90[$t->id] ?? 0),
                'monthly_base_payroll' => round((float) ($baseSalaries[$t->id] ?? 0), 2),
                'period_gross_payroll' => round((float) ($ov['total_gross'] ?? 0), 2),
                'period_net_payroll' => round((float) ($ov['total_net'] ?? 0), 2),
                'period_employer_cost' => round((float) ($ov['total_employer_cost'] ?? 0), 2),
                'pending_payrolls' => (int) ($pendingPayrolls[$t->id] ?? 0),
                'inss_paid' => (bool) ($ov['compliance']['inss_paid'] ?? false),
                'open_invoices_amount' => round((float) ($openInvoices[$t->id] ?? 0), 2),
            ];
        })->values()->all();
    }
}
