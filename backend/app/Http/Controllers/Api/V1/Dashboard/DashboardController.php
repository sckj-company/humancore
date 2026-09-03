<?php

namespace App\Http\Controllers\Api\V1\Dashboard;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\LeaveRequest;
use App\Models\PayrollPeriod;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class DashboardController extends BaseController
{
    public function __construct(private readonly TenantManager $tenantManager) {}

    public function hr(Request $request): JsonResponse
    {
        $this->authorize('view_any_employee');

        $tenantId = $this->tenantManager->id();

        $today = Carbon::today();
        $monthStart = $today->copy()->startOfMonth();

        $totalActive = Employee::query()->where('status', 'active')->count();
        $totalEmployees = Employee::query()->count();

        $hiredThisMonth = Employee::query()
            ->whereBetween('hired_at', [$monthStart, $today])
            ->count();

        $terminatedThisMonth = Employee::query()
            ->where('status', 'terminated')
            ->whereBetween('termination_at', [$monthStart, $today])
            ->count();

        $averageHires = max(1, Employee::query()->where('hired_at', '>=', now()->subYear())->count() / 12);
        $turnoverRate = $totalEmployees > 0
            ? round(($terminatedThisMonth / max($averageHires, $totalActive)) * 100, 2)
            : 0;

        // Evolução do headcount (últimos 12 meses)
        $headcountTrend = collect(range(11, 0))
            ->map(function ($monthsAgo) {
                $month = now()->startOfMonth()->subMonths($monthsAgo);
                $nextMonth = $month->copy()->addMonth();

                $count = Employee::query()
                    ->where(function ($q) use ($month) {
                        $q->where('hired_at', '<', $month)
                            ->orWhereNull('hired_at');
                    })
                    ->where(function ($q) use ($nextMonth) {
                        $q->whereNull('termination_at')
                            ->orWhere('termination_at', '>=', $nextMonth);
                    })
                    ->count();

                return [
                    'month' => $month->format('Y-m'),
                    'label' => $month->format('M/Y'),
                    'count' => $count,
                ];
            });

        // Distribuição por departamento
        $byDepartment = Department::query()
            ->withCount('employees')
            ->get()
            ->map(fn ($dept) => ['name' => $dept->name, 'count' => $dept->employees_count]);

        // Contratos a expirar
        $expiringContracts = EmployeeContract::query()
            ->where('is_active', true)
            ->whereNotNull('end_date')
            ->whereBetween('end_date', [now(), now()->addDays(90)])
            ->with(['employee:id,first_name,last_name,employee_code'])
            ->orderBy('end_date')
            ->limit(10)
            ->get()
            ->map(fn ($contract) => [
                'id' => $contract->id,
                'employee' => $contract->employee?->full_name,
                'employee_code' => $contract->employee?->employee_code,
                'end_date' => $contract->end_date?->format('Y-m-d'),
                'days_remaining' => now()->diffInDays($contract->end_date, false),
            ]);

        // Férias pendentes
        $pendingLeaves = LeaveRequest::query()
            ->pending()
            ->with(['employee:id,first_name,last_name', 'leaveType:id,name'])
            ->orderBy('created_at')
            ->limit(10)
            ->get()
            ->map(fn ($leave) => [
                'id' => $leave->id,
                'employee' => $leave->employee?->full_name,
                'type' => $leave->leaveType?->name,
                'start_date' => $leave->start_date->format('Y-m-d'),
                'end_date' => $leave->end_date->format('Y-m-d'),
                'days' => $leave->total_days,
            ]);

        // Aniversários do mês
        $birthdays = Employee::query()
            ->where('status', 'active')
            ->whereNotNull('birth_date')
            ->whereMonth('birth_date', $today->month)
            ->get()
            ->sortBy(fn ($e) => $e->birth_date->day)
            ->map(fn ($e) => [
                'id' => $e->id,
                'full_name' => $e->full_name,
                'birth_date' => $e->birth_date->format('d/m'),
                'day' => $e->birth_date->day,
            ])
            ->values();

        // Custo salarial (soma de salários base ativos)
        $payrollCost = EmployeeContract::query()
            ->where('is_active', true)
            ->sum('base_salary');

        // Últimos funcionários admitidos
        $recentHires = Employee::query()
            ->where('status', 'active')
            ->with(['department:id,name', 'position:id,title'])
            ->orderByDesc('hired_at')
            ->limit(5)
            ->get()
            ->map(fn ($e) => [
                'id' => $e->id,
                'full_name' => $e->full_name,
                'employee_code' => $e->employee_code,
                'department' => $e->department?->name,
                'position' => $e->position?->title,
                'hired_at' => $e->hired_at?->format('Y-m-d'),
                'photo_path' => $e->photo_path,
            ]);

        // Distribuição de estados
        $byStatus = collect([
            'active' => Employee::query()->where('status', 'active')->count(),
            'inactive' => Employee::query()->where('status', 'inactive')->count(),
            'suspended' => Employee::query()->where('status', 'suspended')->count(),
            'terminated' => Employee::query()->where('status', 'terminated')->count(),
        ]);

        // Próximo período de payroll
        $nextPayroll = PayrollPeriod::query()
            ->where('status', 'open')
            ->orderByDesc('period_end')
            ->first();

        return $this->success([
            'kpis' => [
                'total_employees' => $totalEmployees,
                'total_active' => $totalActive,
                'hired_this_month' => $hiredThisMonth,
                'terminated_this_month' => $terminatedThisMonth,
                'turnover_rate' => $turnoverRate,
                'monthly_payroll_cost' => (float) $payrollCost,
            ],
            'headcount_trend' => $headcountTrend,
            'by_department' => $byDepartment,
            'by_status' => $byStatus,
            'expiring_contracts' => $expiringContracts,
            'pending_leaves' => $pendingLeaves,
            'birthdays' => $birthdays,
            'recent_hires' => $recentHires,
            'next_payroll' => $nextPayroll ? [
                'id' => $nextPayroll->id,
                'name' => $nextPayroll->name,
                'status' => $nextPayroll->status,
                'period_start' => $nextPayroll->period_start->format('Y-m-d'),
                'period_end' => $nextPayroll->period_end->format('Y-m-d'),
            ] : null,
        ]);
    }

    public function manager(Request $request): JsonResponse
    {
        $this->authorize('view_any_employee');

        $user = $request->user();

        $employee = $user->employee;

        if (! $employee) {
            return $this->error('Utilizador não associado a um funcionário.', 404);
        }

        $team = Employee::query()->where('manager_id', $employee->id)->where('status', 'active')->get();

        $teamIds = $team->pluck('id')->push($employee->id);

        $today = Carbon::today();

        $pendingLeaves = LeaveRequest::query()
            ->whereIn('employee_id', $teamIds)
            ->pending()
            ->with(['employee:id,first_name,last_name', 'leaveType:id,name'])
            ->orderBy('created_at')
            ->limit(10)
            ->get()
            ->map(fn ($leave) => [
                'id' => $leave->id,
                'employee' => $leave->employee?->full_name,
                'type' => $leave->leaveType?->name,
                'start_date' => $leave->start_date->format('Y-m-d'),
                'days' => $leave->total_days,
            ]);

        $onLeaveToday = LeaveRequest::query()
            ->whereIn('employee_id', $teamIds)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $today)
            ->whereDate('end_date', '>=', $today)
            ->with(['employee:id,first_name,last_name'])
            ->get()
            ->map(fn ($leave) => [
                'id' => $leave->employee->id,
                'full_name' => $leave->employee->full_name,
            ]);

        return $this->success([
            'team_size' => $team->count(),
            'team' => $team->map(fn ($member) => [
                'id' => $member->id,
                'full_name' => $member->full_name,
                'position' => $member->position?->title,
                'status' => $member->status,
                'photo_path' => $member->photo_path,
            ]),
            'on_leave_today' => $onLeaveToday,
            'pending_leaves' => $pendingLeaves,
            'pending_count' => $pendingLeaves->count(),
        ]);
    }

    public function employee(Request $request): JsonResponse
    {
        $user = $request->user();

        $employee = $user->employee;

        if (! $employee) {
            return $this->error('Utilizador não associado a um funcionário.', 404);
        }

        $contract = $employee->activeContract()->first();
        $today = Carbon::today();

        $approvedLeavesThisYear = LeaveRequest::query()
            ->where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->whereYear('start_date', $today->year)
            ->get();

        $annualQuota = $employee->tenant?->getSetting('leave.vacation_days_per_year', 22) ?? 22;
        $usedDays = $approvedLeavesThisYear->sum('total_days');
        $remaining = max(0, $annualQuota - $usedDays);

        return $this->success([
            'profile' => [
                'id' => $employee->id,
                'full_name' => $employee->full_name,
                'employee_code' => $employee->employee_code,
                'photo_path' => $employee->photo_path,
                'department' => $employee->department?->name,
                'position' => $employee->position?->title,
                'hired_at' => $employee->hired_at?->format('Y-m-d'),
                'email' => $employee->email,
                'phone' => $employee->phone,
            ],
            'contract' => $contract ? [
                'base_salary' => (float) $contract->base_salary,
                'contract_type' => $contract->contract_type,
                'salary_frequency' => $contract->salary_frequency,
                'start_date' => $contract->start_date?->format('Y-m-d'),
            ] : null,
            'leave' => [
                'annual_quota' => $annualQuota,
                'used_days' => $usedDays,
                'remaining_days' => $remaining,
            ],
            'recent_payslips' => [],
        ]);
    }
}
