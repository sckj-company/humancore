<?php

namespace App\Http\Controllers\Api\V1\Report;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\AttendanceRecord;
use App\Models\Department;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends BaseController
{
    public function __construct(private readonly TenantManager $tenantManager) {}

    public function headcount(Request $request): JsonResponse
    {
        $this->authorize('view_report');

        $tenantId = $this->tenantManager->id();
        [$start, $end] = $this->resolveDateRange($request);

        $byDepartment = Department::query()
            ->withCount(['employees' => function ($q) use ($tenantId) {
                $q->where('tenant_id', $tenantId);
            }])
            ->orderBy('name')
            ->get()
            ->map(fn ($dept) => [
                'department_id' => $dept->id,
                'department' => $dept->name,
                'total' => $dept->employees_count,
            ])
            ->values();

        $byStatus = Employee::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $hiredInRange = Employee::query()
            ->whereBetween('hired_at', [$start, $end])
            ->count();

        $terminatedInRange = Employee::query()
            ->where('status', 'terminated')
            ->whereBetween('termination_at', [$start, $end])
            ->count();

        $activeNow = Employee::query()->where('status', 'active')->count();
        $totalEver = Employee::query()->count();

        $trend = $this->buildMonthlyTrend($start, $end, 'headcount');

        return $this->success([
            'range' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
            'summary' => [
                'total_employees' => $totalEver,
                'active_employees' => $activeNow,
                'hired_in_range' => $hiredInRange,
                'terminated_in_range' => $terminatedInRange,
            ],
            'by_department' => $byDepartment,
            'by_status' => $byStatus,
            'trend' => $trend,
        ], 'Relatório de headcount gerado com sucesso.');
    }

    public function turnover(Request $request): JsonResponse
    {
        $this->authorize('view_report');

        [$start, $end] = $this->resolveDateRange($request, defaultMonths: 12);

        $terminated = Employee::query()
            ->where('status', 'terminated')
            ->whereBetween('termination_at', [$start, $end])
            ->count();

        $hired = Employee::query()
            ->whereBetween('hired_at', [$start, $end])
            ->count();

        $averageHeadcount = $this->averageHeadcount($start, $end);
        $turnoverRate = $averageHeadcount > 0
            ? round(($terminated / $averageHeadcount) * 100, 2)
            : 0.0;

        $monthly = collect();
        $cursor = $start->copy()->startOfMonth();
        $endMonth = $end->copy()->endOfMonth();
        while ($cursor->lte($endMonth)) {
            $monthStart = $cursor->copy()->startOfMonth();
            $monthEnd = $cursor->copy()->endOfMonth();
            $h = Employee::query()->whereBetween('hired_at', [$monthStart, $monthEnd])->count();
            $t = Employee::query()
                ->where('status', 'terminated')
                ->whereBetween('termination_at', [$monthStart, $monthEnd])
                ->count();
            $avg = $this->averageHeadcount($monthStart, $monthEnd);
            $monthly->push([
                'month' => $monthStart->format('Y-m'),
                'label' => $monthStart->format('M/Y'),
                'hired' => $h,
                'terminated' => $t,
                'turnover_rate' => $avg > 0 ? round(($t / $avg) * 100, 2) : 0.0,
            ]);
            $cursor->addMonth();
        }

        $byReason = Employee::query()
            ->where('status', 'terminated')
            ->whereBetween('termination_at', [$start, $end])
            ->selectRaw('COALESCE(termination_reason, \'Não informado\') as reason, COUNT(*) as total')
            ->groupBy('reason')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($r) => ['reason' => $r->reason, 'total' => (int) $r->total])
            ->values();

        return $this->success([
            'range' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
            'summary' => [
                'hired' => $hired,
                'terminated' => $terminated,
                'average_headcount' => $averageHeadcount,
                'turnover_rate' => $turnoverRate,
            ],
            'monthly' => $monthly->values(),
            'by_reason' => $byReason,
        ], 'Relatório de turnover gerado com sucesso.');
    }

    public function payrollSummary(Request $request): JsonResponse
    {
        $this->authorize('view_report');

        [$start, $end] = $this->resolveDateRange($request, defaultMonths: 12);

        $periods = PayrollPeriod::query()
            ->whereIn('status', ['completed', 'closed', 'approved'])
            ->whereBetween('period_end', [$start, $end])
            ->orderBy('period_end')
            ->get(['id', 'name', 'period_start', 'period_end', 'status']);

        $summary = PayrollRecord::query()
            ->whereIn('payroll_period_id', $periods->pluck('id'))
            ->selectRaw('
                payroll_period_id,
                COUNT(*) as employees,
                SUM(gross_salary) as total_gross,
                SUM(net_salary) as total_net,
                SUM(total_taxes) as total_taxes,
                SUM(total_deductions) as total_deductions,
                SUM(overtime_amount) as total_overtime,
                SUM(absent_days) as total_absent_days
            ')
            ->groupBy('payroll_period_id')
            ->get()
            ->keyBy('payroll_period_id');

        $rows = $periods->map(function ($period) use ($summary) {
            $s = $summary->get($period->id);

            return [
                'period_id' => $period->id,
                'name' => $period->name,
                'period_start' => $period->period_start?->format('Y-m-d'),
                'period_end' => $period->period_end?->format('Y-m-d'),
                'status' => $period->status,
                'employees' => (int) ($s->employees ?? 0),
                'total_gross' => (float) ($s->total_gross ?? 0),
                'total_net' => (float) ($s->total_net ?? 0),
                'total_taxes' => (float) ($s->total_taxes ?? 0),
                'total_deductions' => (float) ($s->total_deductions ?? 0),
                'total_overtime' => (float) ($s->total_overtime ?? 0),
                'total_absent_days' => (int) ($s->total_absent_days ?? 0),
            ];
        })->values();

        $totals = [
            'total_gross' => $rows->sum('total_gross'),
            'total_net' => $rows->sum('total_net'),
            'total_taxes' => $rows->sum('total_taxes'),
            'total_deductions' => $rows->sum('total_deductions'),
            'total_overtime' => $rows->sum('total_overtime'),
        ];

        $byDepartment = PayrollRecord::query()
            ->join('employees', 'employees.id', '=', 'payroll_records.employee_id')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->whereIn('payroll_records.payroll_period_id', $periods->pluck('id'))
            ->selectRaw('
                COALESCE(departments.name, \'Sem departamento\') as department,
                COUNT(*) as employees,
                SUM(payroll_records.gross_salary) as total_gross,
                SUM(payroll_records.net_salary) as total_net
            ')
            ->groupBy('departments.name')
            ->orderByDesc('total_gross')
            ->get()
            ->map(fn ($r) => [
                'department' => $r->department,
                'employees' => (int) $r->employees,
                'total_gross' => (float) $r->total_gross,
                'total_net' => (float) $r->total_net,
            ])
            ->values();

        return $this->success([
            'range' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
            'totals' => $totals,
            'rows' => $rows,
            'by_department' => $byDepartment,
        ], 'Resumo de payroll gerado com sucesso.');
    }

    public function attendanceSummary(Request $request): JsonResponse
    {
        $this->authorize('view_report');

        [$start, $end] = $this->resolveDateRange($request, defaultMonths: 3);

        $byStatus = AttendanceRecord::query()
            ->whereBetween('date', [$start, $end])
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $totals = AttendanceRecord::query()
            ->whereBetween('date', [$start, $end])
            ->selectRaw('
                COUNT(*) as records,
                SUM(COALESCE(total_worked, 0)) as total_minutes,
                SUM(COALESCE(late_minutes, 0)) as total_late_minutes,
                SUM(COALESCE(overtime_minutes, 0)) as total_overtime_minutes
            ')
            ->first();

        $byDepartment = AttendanceRecord::query()
            ->join('employees', 'employees.id', '=', 'attendance_records.employee_id')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->whereBetween('attendance_records.date', [$start, $end])
            ->selectRaw('
                COALESCE(departments.name, \'Sem departamento\') as department,
                COUNT(*) as records,
                SUM(COALESCE(attendance_records.total_worked, 0)) as total_minutes,
                SUM(COALESCE(attendance_records.late_minutes, 0)) as late_minutes,
                SUM(COALESCE(attendance_records.overtime_minutes, 0)) as overtime_minutes
            ')
            ->groupBy('departments.name')
            ->orderBy('department')
            ->get()
            ->map(fn ($r) => [
                'department' => $r->department,
                'records' => (int) $r->records,
                'total_hours' => round(((int) $r->total_minutes) / 60, 2),
                'late_minutes' => (int) $r->late_minutes,
                'overtime_minutes' => (int) $r->overtime_minutes,
            ])
            ->values();

        $leavesApproved = LeaveRequest::query()
            ->where('status', 'approved')
            ->whereBetween('start_date', [$start, $end])
            ->count();

        $leavesPending = LeaveRequest::query()
            ->pending()
            ->whereBetween('start_date', [$start, $end])
            ->count();

        return $this->success([
            'range' => ['start' => $start->toDateString(), 'end' => $end->toDateString()],
            'summary' => [
                'records' => (int) ($totals->records ?? 0),
                'total_hours' => round(((int) ($totals->total_minutes ?? 0)) / 60, 2),
                'late_minutes' => (int) ($totals->total_late_minutes ?? 0),
                'overtime_minutes' => (int) ($totals->total_overtime_minutes ?? 0),
                'leaves_approved' => $leavesApproved,
                'leaves_pending' => $leavesPending,
            ],
            'by_status' => $byStatus,
            'by_department' => $byDepartment,
        ], 'Resumo de presenças gerado com sucesso.');
    }

    public function export(Request $request, string $type): StreamedResponse
    {
        $this->authorize('export_report');

        [$start, $end] = $this->resolveDateRange($request, defaultMonths: 6);

        $rows = match ($type) {
            'headcount' => $this->headcountRows($start, $end),
            'turnover' => $this->turnoverRows($start, $end),
            'payroll' => $this->payrollRows($start, $end),
            'attendance' => $this->attendanceRows($start, $end),
            default => abort(400, "Tipo de relatório '{$type}' inválido."),
        };

        $filename = "relatorio-{$type}-{$start->format('Ymd')}-{$end->format('Ymd')}.csv";

        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            if (! empty($rows)) {
                fputcsv($out, array_keys($rows[0]));
                foreach ($rows as $row) {
                    fputcsv($out, $row);
                }
            }
            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /**
     * @return array{0: Carbon, 1: Carbon}
     */
    private function resolveDateRange(Request $request, int $defaultMonths = 6): array
    {
        $start = $request->filled('start_date')
            ? Carbon::parse($request->input('start_date'))->startOfDay()
            : Carbon::today()->subMonths($defaultMonths)->startOfDay();
        $end = $request->filled('end_date')
            ? Carbon::parse($request->input('end_date'))->endOfDay()
            : Carbon::today()->endOfDay();

        if ($start->gt($end)) {
            [$start, $end] = [$end->copy()->startOfDay(), $start->copy()->endOfDay()];
        }

        return [$start, $end];
    }

    private function averageHeadcount(Carbon $start, Carbon $end): float
    {
        $hiredBefore = Employee::query()->where('hired_at', '<', $start)->count();
        $terminatedBefore = Employee::query()
            ->where('status', 'terminated')
            ->where('termination_at', '<', $start)
            ->count();
        $hiredInRange = Employee::query()->whereBetween('hired_at', [$start, $end])->count();
        $terminatedInRange = Employee::query()
            ->where('status', 'terminated')
            ->whereBetween('termination_at', [$start, $end])
            ->count();

        $startHeadcount = max(0, $hiredBefore - $terminatedBefore);
        $endHeadcount = max(0, $startHeadcount + $hiredInRange - $terminatedInRange);

        return ($startHeadcount + $endHeadcount) / 2;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildMonthlyTrend(Carbon $start, Carbon $end, string $type): array
    {
        $rows = [];
        $cursor = $start->copy()->startOfMonth();
        $endMonth = $end->copy()->endOfMonth();
        while ($cursor->lte($endMonth)) {
            $monthStart = $cursor->copy()->startOfMonth();
            $nextMonth = $cursor->copy()->addMonth();

            $count = Employee::query()
                ->where(function ($q) use ($monthStart) {
                    $q->where('hired_at', '<', $monthStart)->orWhereNull('hired_at');
                })
                ->where(function ($q) use ($nextMonth) {
                    $q->whereNull('termination_at')->orWhere('termination_at', '>=', $nextMonth);
                })
                ->count();

            $rows[] = [
                'month' => $monthStart->format('Y-m'),
                'label' => $monthStart->format('M/Y'),
                'count' => $count,
            ];
            $cursor->addMonth();
        }

        return $rows;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function headcountRows(Carbon $start, Carbon $end): array
    {
        return Department::query()
            ->withCount(['employees'])
            ->orderBy('name')
            ->get()
            ->map(fn ($d) => [
                'department' => $d->name,
                'total' => $d->employees_count,
            ])
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function turnoverRows(Carbon $start, Carbon $end): array
    {
        return Employee::query()
            ->where('status', 'terminated')
            ->whereBetween('termination_at', [$start, $end])
            ->with('department:id,name')
            ->orderBy('termination_at')
            ->get()
            ->map(fn ($e) => [
                'employee' => $e->full_name,
                'employee_code' => $e->employee_code,
                'department' => $e->department?->name,
                'termination_date' => $e->termination_at?->format('Y-m-d'),
                'reason' => $e->termination_reason ?? 'Não informado',
            ])
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function payrollRows(Carbon $start, Carbon $end): array
    {
        return PayrollRecord::query()
            ->join('payroll_periods', 'payroll_periods.id', '=', 'payroll_records.payroll_period_id')
            ->join('employees', 'employees.id', '=', 'payroll_records.employee_id')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->whereBetween('payroll_periods.period_end', [$start, $end])
            ->whereIn('payroll_periods.status', ['completed', 'closed', 'approved'])
            ->orderBy('payroll_periods.period_end')
            ->get([
                'payroll_records.base_salary',
                'payroll_records.gross_salary',
                'payroll_records.net_salary',
                'payroll_records.total_taxes',
                'payroll_records.total_deductions',
                'payroll_records.overtime_amount',
                'payroll_records.absent_days',
                'payroll_periods.name as period',
                'payroll_periods.period_start',
                'payroll_periods.period_end',
                'employees.employee_code',
                'employees.first_name',
                'employees.last_name',
                'departments.name as department',
            ])
            ->map(fn ($r) => [
                'period' => $r->period,
                'period_start' => $r->period_start,
                'period_end' => $r->period_end,
                'employee' => trim(($r->first_name ?? '').' '.($r->last_name ?? '')),
                'employee_code' => $r->employee_code,
                'department' => $r->department,
                'base_salary' => (float) $r->base_salary,
                'gross_salary' => (float) $r->gross_salary,
                'net_salary' => (float) $r->net_salary,
                'total_taxes' => (float) $r->total_taxes,
                'total_deductions' => (float) $r->total_deductions,
                'overtime' => (float) $r->overtime_amount,
                'absent_days' => (int) $r->absent_days,
            ])
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function attendanceRows(Carbon $start, Carbon $end): array
    {
        return AttendanceRecord::query()
            ->join('employees', 'employees.id', '=', 'attendance_records.employee_id')
            ->leftJoin('departments', 'departments.id', '=', 'employees.department_id')
            ->whereBetween('attendance_records.date', [$start, $end])
            ->orderBy('attendance_records.date')
            ->get([
                'attendance_records.date',
                'attendance_records.status',
                'attendance_records.total_worked',
                'attendance_records.late_minutes',
                'attendance_records.overtime_minutes',
                'employees.employee_code',
                'employees.first_name',
                'employees.last_name',
                'departments.name as department',
            ])
            ->map(fn ($r) => [
                'date' => $r->date,
                'employee' => trim(($r->first_name ?? '').' '.($r->last_name ?? '')),
                'employee_code' => $r->employee_code,
                'department' => $r->department,
                'status' => $r->status,
                'worked_hours' => round(((int) $r->total_worked) / 60, 2),
                'late_minutes' => (int) $r->late_minutes,
                'overtime_minutes' => (int) $r->overtime_minutes,
            ])
            ->all();
    }
}
