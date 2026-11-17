<?php

namespace App\Services\Attendance;

use App\Models\AttendanceRecord;
use App\Models\Department;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;

class AttendanceReportService
{
    public const STATUS_LABELS = [
        'present' => 'Presente',
        'late' => 'Atraso',
        'absent' => 'Falta',
        'half_day' => 'Meio Dia',
        'on_leave' => 'Férias / Ausência',
        'holiday' => 'Feriado',
    ];

    /**
     * @return array<string, mixed>
     */
    public function build(Request $request, ?User $user = null): array
    {
        $periodType = (string) $request->input('period_type', 'monthly');
        if (! in_array($periodType, ['daily', 'weekly', 'monthly', 'custom'], true)) {
            $periodType = 'monthly';
        }

        [$start, $end, $periodLabel] = $this->resolvePeriod($request, $periodType);

        $allowedDeptIds = $user?->allowedDepartmentIds();
        $employeeId = $request->filled('employee_id') ? $request->integer('employee_id') : null;
        $rawEmployeeIds = $request->input('employee_ids');
        $employeeIdsFilter = collect(
            is_array($rawEmployeeIds)
                ? $rawEmployeeIds
                : (is_string($rawEmployeeIds) && trim($rawEmployeeIds) !== '' ? explode(',', $rawEmployeeIds) : [])
        )
            ->map(fn ($id) => (int) trim((string) $id))
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values()
            ->all();
        if ($employeeId !== null && ! in_array($employeeId, $employeeIdsFilter, true)) {
            $employeeIdsFilter[] = $employeeId;
        }

        $departmentId = $request->filled('department_id') ? $request->integer('department_id') : null;
        $employeeStatus = trim((string) $request->input('employee_status', ''));
        $attendanceStatus = trim((string) $request->input('attendance_status', ''));
        $search = trim((string) $request->input('search', ''));
        $canViewOvertime = ! $user || $user->hasFieldPermission('attendance', 'overtime', 'view');

        $employeesQuery = Employee::query()
            ->with(['department:id,name', 'position:id,title', 'tenant'])
            ->when($allowedDeptIds !== null, fn ($q) => $q->whereIn('department_id', $allowedDeptIds))
            ->when(! empty($employeeIdsFilter), fn ($q) => $q->whereIn('id', $employeeIdsFilter))
            ->when($departmentId !== null, fn ($q) => $q->where('department_id', $departmentId))
            ->when($employeeStatus !== '' && $employeeStatus !== 'all', function ($q) use ($employeeStatus): void {
                if ($employeeStatus === 'pending') {
                    $q->where('approval_status', 'pending');
                } else {
                    $q->where('status', $employeeStatus);
                }
            })
            ->when($search !== '', function ($q) use ($search): void {
                $q->where(function ($inner) use ($search): void {
                    $inner->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere('employee_code', 'like', "%{$search}%");
                });
            })
            ->orderBy('first_name')
            ->orderBy('last_name');

        $employees = $employeesQuery->get();
        $employeeIds = $employees->pluck('id')->all();

        $records = empty($employeeIds)
            ? collect()
            : AttendanceRecord::query()
                ->with(['shift:id,name,start_time,end_time'])
                ->whereIn('employee_id', $employeeIds)
                ->whereDate('date', '>=', $start->toDateString())
                ->whereDate('date', '<=', $end->toDateString())
                ->when($attendanceStatus !== '' && $attendanceStatus !== 'all', fn ($q) => $q->where('status', $attendanceStatus))
                ->orderBy('date')
                ->orderBy('employee_id')
                ->orderBy('clock_in')
                ->get();

        $approvedLeaves = empty($employeeIds)
            ? collect()
            : LeaveRequest::query()
                ->with('leaveType:id,name')
                ->whereIn('employee_id', $employeeIds)
                ->where('status', 'approved')
                ->whereDate('start_date', '<=', $end->toDateString())
                ->whereDate('end_date', '>=', $start->toDateString())
                ->get()
                ->groupBy('employee_id');

        $recordsByEmployee = $records->groupBy('employee_id');

        $employeeSummaries = [];
        $totals = [
            'employees_count' => $employees->count(),
            'records_count' => 0,
            'present_count' => 0,
            'late_count' => 0,
            'absent_count' => 0,
            'on_leave_count' => 0,
            'half_day_count' => 0,
            'total_worked_minutes' => 0,
            'total_worked_hours' => 0.0,
            'total_late_minutes' => 0,
            'total_overtime_minutes' => 0,
            'total_overtime_hours' => 0.0,
            'attendance_rate' => 0.0,
        ];

        $entries = [];
        $employeesMap = $employees->keyBy('id');

        foreach ($employees as $employee) {
            $empRecords = $recordsByEmployee->get($employee->id, collect());
            $presentDays = $empRecords->where('status', 'present')->count();
            $lateDays = $empRecords->where('status', 'late')->count();
            $absentDays = $empRecords->where('status', 'absent')->count();
            $halfDays = $empRecords->where('status', 'half_day')->count();
            $leaveRecordDays = $empRecords->where('status', 'on_leave')->count();

            // Count approved leave days inside [start, end] not already duplicated by attendance on_leave rows
            $empLeaves = $approvedLeaves->get($employee->id, collect());
            $approvedLeaveDays = 0;
            foreach ($empLeaves as $leave) {
                $lStart = Carbon::parse($leave->start_date)->max($start);
                $lEnd = Carbon::parse($leave->end_date)->min($end);
                if ($lEnd->gte($lStart)) {
                    $approvedLeaveDays += (int) $lStart->diffInDays($lEnd) + 1;
                }
            }
            $leaveDays = max($leaveRecordDays, $approvedLeaveDays);

            $workedMinutes = (int) $empRecords->sum('total_worked');
            $lateMinutes = (int) $empRecords->sum('late_minutes');
            $overtimeMinutes = $canViewOvertime ? (int) $empRecords->sum('overtime_minutes') : 0;
            $overtimeAmount = $canViewOvertime ? round((float) $empRecords->sum('overtime_amount'), 2) : null;
            $attendedCount = $presentDays + $lateDays + ($halfDays * 0.5);
            $denominator = $presentDays + $lateDays + $absentDays + $halfDays;
            $rate = $denominator > 0 ? round(($attendedCount / $denominator) * 100, 1) : 0.0;

            $employeeSummaries[] = [
                'employee_id' => $employee->id,
                'employee_code' => $employee->employee_code,
                'full_name' => $employee->full_name,
                'department' => $employee->department?->name ?? '—',
                'position' => $employee->position?->title ?? '—',
                'records_count' => $empRecords->count(),
                'present_days' => $presentDays,
                'late_days' => $lateDays,
                'absent_days' => $absentDays,
                'half_days' => $halfDays,
                'leave_days' => $leaveDays,
                'worked_minutes' => $workedMinutes,
                'worked_hours' => round($workedMinutes / 60, 2),
                'late_minutes' => $lateMinutes,
                'overtime_minutes' => $overtimeMinutes,
                'overtime_hours' => round($overtimeMinutes / 60, 2),
                'overtime_amount' => $overtimeAmount,
                'attendance_rate' => $rate,
            ];

            $totals['records_count'] += $empRecords->count();
            $totals['present_count'] += $presentDays;
            $totals['late_count'] += $lateDays;
            $totals['absent_count'] += $absentDays;
            $totals['half_day_count'] += $halfDays;
            $totals['on_leave_count'] += $leaveDays;
            $totals['total_worked_minutes'] += $workedMinutes;
            $totals['total_late_minutes'] += $lateMinutes;
            $totals['total_overtime_minutes'] += $overtimeMinutes;
        }

        foreach ($records as $record) {
            $emp = $employeesMap->get($record->employee_id);
            if (! $emp) {
                continue;
            }
            $entries[] = [
                'id' => $record->id,
                'date' => Carbon::parse($record->date)->toDateString(),
                'date_formatted' => Carbon::parse($record->date)->format('d/m/Y'),
                'employee_id' => $emp->id,
                'employee_code' => $emp->employee_code,
                'employee_name' => $emp->full_name,
                'department' => $emp->department?->name ?? '—',
                'shift_name' => $record->shift?->name ?? '—',
                'clock_in' => $record->clock_in ? Carbon::parse($record->clock_in)->format('H:i') : '—',
                'clock_out' => $record->clock_out ? Carbon::parse($record->clock_out)->format('H:i') : '—',
                'worked_minutes' => (int) ($record->total_worked ?? 0),
                'worked_hours' => round(((int) ($record->total_worked ?? 0)) / 60, 2),
                'late_minutes' => (int) ($record->late_minutes ?? 0),
                'overtime_minutes' => $canViewOvertime ? (int) ($record->overtime_minutes ?? 0) : 0,
                'overtime_hours' => $canViewOvertime ? round(((int) ($record->overtime_minutes ?? 0)) / 60, 2) : 0.0,
                'status' => $record->status,
                'status_label' => self::STATUS_LABELS[$record->status] ?? $record->status,
                'notes' => $record->justification ?? $record->notes ?? null,
            ];
        }

        $totals['total_worked_hours'] = round($totals['total_worked_minutes'] / 60, 2);
        $totals['total_overtime_hours'] = round($totals['total_overtime_minutes'] / 60, 2);
        $totalDenom = $totals['present_count'] + $totals['late_count'] + $totals['absent_count'] + $totals['half_day_count'];
        $totals['attendance_rate'] = $totalDenom > 0
            ? round((($totals['present_count'] + $totals['late_count'] + ($totals['half_day_count'] * 0.5)) / $totalDenom) * 100, 1)
            : 0.0;

        $selectedEmployeeNames = ! empty($employeeIdsFilter)
            ? $employees->pluck('full_name')->values()->all()
            : [];
        $selectedEmployee = count($selectedEmployeeNames) === 1 ? $employees->first() : null;
        $selectedDepartment = $departmentId ? Department::find($departmentId) : null;

        return [
            'period' => [
                'type' => $periodType,
                'label' => $periodLabel,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'days_count' => (int) $start->diffInDays($end) + 1,
            ],
            'filters' => [
                'employee_id' => $employeeId,
                'employee_ids' => $employeeIdsFilter,
                'employee_name' => count($selectedEmployeeNames) > 0 ? implode(', ', $selectedEmployeeNames) : null,
                'department_id' => $departmentId,
                'department_name' => $selectedDepartment?->name,
                'employee_status' => $employeeStatus !== '' ? $employeeStatus : null,
                'attendance_status' => $attendanceStatus !== '' ? $attendanceStatus : null,
                'search' => $search !== '' ? $search : null,
            ],
            'totals' => $totals,
            'employees' => $employeeSummaries,
            'entries' => $entries,
            'tenant' => $employees->first()?->tenant ?? $user?->tenant,
        ];
    }

    /**
     * @return array{0: Carbon, 1: Carbon, 2: string}
     */
    private function resolvePeriod(Request $request, string $periodType): array
    {
        if ($periodType === 'daily') {
            $date = $request->filled('date') ? Carbon::parse((string) $request->input('date')) : now();
            $day = $date->copy()->startOfDay();

            return [$day, $day->copy(), 'Relatório Diário — '.$day->format('d/m/Y')];
        }

        if ($periodType === 'weekly') {
            if ($request->filled('start_date') && $request->filled('end_date')) {
                $start = Carbon::parse((string) $request->input('start_date'))->startOfDay();
                $end = Carbon::parse((string) $request->input('end_date'))->startOfDay();
            } else {
                $base = $request->filled('date') ? Carbon::parse((string) $request->input('date')) : now();
                $start = $base->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
                $end = $start->copy()->addDays(6);
            }

            return [$start, $end, 'Relatório Semanal — '.$start->format('d/m/Y').' a '.$end->format('d/m/Y')];
        }

        if ($periodType === 'custom' && $request->filled('start_date') && $request->filled('end_date')) {
            $start = Carbon::parse((string) $request->input('start_date'))->startOfDay();
            $end = Carbon::parse((string) $request->input('end_date'))->startOfDay();

            return [$start, $end, 'Período — '.$start->format('d/m/Y').' a '.$end->format('d/m/Y')];
        }

        // monthly default (supports month=YYYY-MM OR separate year + month_number)
        $monthInput = trim((string) $request->input('month', ''));
        $yearInput = $request->filled('year') ? $request->integer('year') : null;
        $monthNumberInput = $request->filled('month_number') ? $request->integer('month_number') : null;

        if ($yearInput && $monthNumberInput && $yearInput >= 1990 && $yearInput <= 2100 && $monthNumberInput >= 1 && $monthNumberInput <= 12) {
            $base = Carbon::create($yearInput, $monthNumberInput, 1);
        } elseif (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $monthInput)) {
            $base = Carbon::createFromFormat('Y-m', $monthInput);
        } elseif ($yearInput && ctype_digit($monthInput) && (int) $monthInput >= 1 && (int) $monthInput <= 12 && $yearInput >= 1990 && $yearInput <= 2100) {
            $base = Carbon::create($yearInput, (int) $monthInput, 1);
        } elseif ($request->filled('date')) {
            $base = Carbon::parse((string) $request->input('date'));
        } else {
            $base = now();
        }

        $start = $base->copy()->startOfMonth();
        $end = $base->copy()->endOfMonth();

        return [$start, $end, 'Relatório Mensal — '.$start->format('m/Y')];
    }
}
