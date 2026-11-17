<?php

namespace App\Services\Attendance;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeSchedule;
use App\Models\Holiday;
use App\Models\LeaveRequest;
use App\Models\Setting;
use App\Models\Shift;
use App\Models\Tenant;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class BiometricAttendanceService
{
    public function __construct(
        private readonly OvertimePayCalculator $overtimeCalculator,
        private readonly WorkedHoursCalculator $workedHoursCalculator,
    ) {}

    public function syncEmployees(int $tenantId, array $items, bool $createMissing = false): array
    {
        $summary = [
            'processed' => 0,
            'updated' => 0,
            'created' => 0,
            'not_found' => 0,
            'errors' => 0,
            'items' => [],
        ];

        foreach ($items as $index => $item) {
            $summary['processed']++;
            $employee = $this->resolveEmployee($tenantId, $item);

            if (! $employee && ! $createMissing) {
                $summary['not_found']++;
                $summary['items'][] = [
                    'index' => $index,
                    'status' => 'not_found',
                    'biometric_code' => $item['biometric_code'] ?? $item['biometric_id'] ?? null,
                    'employee_code' => $item['employee_code'] ?? null,
                    'message' => 'Funcionário não encontrado neste tenant.',
                ];

                continue;
            }

            if (! $employee) {
                [$firstName, $lastName] = $this->splitName($item);
                if ($firstName === '') {
                    $summary['errors']++;
                    $summary['items'][] = [
                        'index' => $index,
                        'status' => 'error',
                        'message' => 'Informe first_name/last_name ou full_name para criar funcionário em falta.',
                    ];

                    continue;
                }

                $biometricCode = $this->extractBiometricCode($item);
                $code = ! empty($item['employee_code'])
                    ? trim((string) $item['employee_code'])
                    : $this->generateEmployeeCode($tenantId);

                $employee = Employee::query()->create([
                    'tenant_id' => $tenantId,
                    'employee_code' => $code,
                    'biometric_code' => $biometricCode,
                    'first_name' => $firstName,
                    'last_name' => $lastName,
                    'email' => $item['email'] ?? null,
                    'phone' => $item['phone'] ?? null,
                    'id_document_number' => $item['id_document_number'] ?? null,
                    'department_id' => $item['department_id'] ?? null,
                    'position_id' => $item['position_id'] ?? null,
                    'status' => 'active',
                    'approval_status' => 'pending',
                ]);

                $summary['created']++;
                $summary['items'][] = [
                    'index' => $index,
                    'status' => 'created',
                    'employee_id' => $employee->id,
                    'employee_code' => $employee->employee_code,
                    'biometric_code' => $employee->biometric_code,
                    'full_name' => $employee->full_name,
                ];

                continue;
            }

            $biometricCode = $this->extractBiometricCode($item);
            $updates = [];
            if ($biometricCode !== null && $biometricCode !== '' && $employee->biometric_code !== $biometricCode) {
                $updates['biometric_code'] = $biometricCode;
            }
            if (array_key_exists('phone', $item) && filled($item['phone']) && empty($employee->phone)) {
                $updates['phone'] = (string) $item['phone'];
            }
            if (array_key_exists('email', $item) && filled($item['email']) && empty($employee->email)) {
                $updates['email'] = (string) $item['email'];
            }

            if ($updates !== []) {
                $employee->update($updates);
            }

            $summary['updated']++;
            $summary['items'][] = [
                'index' => $index,
                'status' => 'updated',
                'employee_id' => $employee->id,
                'employee_code' => $employee->employee_code,
                'biometric_code' => $employee->biometric_code,
                'full_name' => $employee->full_name,
            ];
        }

        return $summary;
    }

    public function ingestBatch(
        int $tenantId,
        array $items,
        ?string $defaultDevice = null,
        ?string $ipAddress = null,
        int $debounceSeconds = 120,
    ): array {
        $summary = [
            'processed' => 0,
            'created' => 0,
            'updated' => 0,
            'ignored_duplicates' => 0,
            'failed' => 0,
            'results' => [],
        ];

        $timezone = $this->tenantTimezone($tenantId);

        foreach ($items as $index => $item) {
            $summary['processed']++;
            try {
                $result = $this->ingestSingle(
                    $tenantId,
                    $item,
                    $timezone,
                    $defaultDevice,
                    $ipAddress,
                    $debounceSeconds,
                );
                $action = $result['action'];
                if ($action === 'created') {
                    $summary['created']++;
                } elseif ($action === 'updated') {
                    $summary['updated']++;
                } elseif ($action === 'ignored_duplicate') {
                    $summary['ignored_duplicates']++;
                }
                $summary['results'][] = array_merge(['index' => $index], $result);
            } catch (\Throwable $e) {
                $summary['failed']++;
                $summary['results'][] = [
                    'index' => $index,
                    'action' => 'error',
                    'employee_id' => $item['employee_id'] ?? null,
                    'employee_code' => $item['employee_code'] ?? null,
                    'biometric_code' => $this->extractBiometricCode($item),
                    'message' => $e->getMessage(),
                ];
            }
        }

        return $summary;
    }

    public function closeDay(
        int $tenantId,
        string $date,
        bool $deductFromSalary = false,
        ?array $employeeIds = null,
    ): array {
        $timezone = $this->tenantTimezone($tenantId);
        $targetDate = Carbon::parse($date, $timezone)->startOfDay();
        if ($targetDate->greaterThan(Carbon::now($timezone)->startOfDay())) {
            throw new \InvalidArgumentException('Não é permitido fechar presenças para datas futuras.');
        }

        $dateStr = $targetDate->toDateString();
        $holiday = $this->holidayOnDate($tenantId, $targetDate);

        if ($holiday) {
            return [
                'date' => $dateStr,
                'is_holiday' => true,
                'holiday_name' => $holiday->name,
                'marked_absent_count' => 0,
                'skipped_existing_count' => 0,
                'skipped_leave_count' => 0,
                'skipped_offday_count' => 0,
                'absent_employee_ids' => [],
            ];
        }

        $employees = Employee::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'active')
            ->where('approval_status', 'approved')
            ->when($employeeIds !== null && count($employeeIds) > 0, fn ($q) => $q->whereIn('id', $employeeIds))
            ->orderBy('id')
            ->get();

        $existingEmployeeIds = AttendanceRecord::query()
            ->where('tenant_id', $tenantId)
            ->whereDate('date', $dateStr)
            ->pluck('employee_id')
            ->unique()
            ->all();
        $existingSet = array_flip($existingEmployeeIds);

        $leaveEmployeeIds = LeaveRequest::query()
            ->where('tenant_id', $tenantId)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $dateStr)
            ->whereDate('end_date', '>=', $dateStr)
            ->pluck('employee_id')
            ->unique()
            ->all();
        $leaveSet = array_flip($leaveEmployeeIds);

        $markedAbsentIds = [];
        $skippedExisting = 0;
        $skippedLeave = 0;
        $skippedOffday = 0;

        DB::transaction(function () use (
            $employees,
            $tenantId,
            $dateStr,
            $targetDate,
            $deductFromSalary,
            $existingSet,
            $leaveSet,
            &$markedAbsentIds,
            &$skippedExisting,
            &$skippedLeave,
            &$skippedOffday
        ): void {
            foreach ($employees as $employee) {
                if (isset($existingSet[$employee->id])) {
                    $skippedExisting++;

                    continue;
                }
                if (isset($leaveSet[$employee->id])) {
                    $skippedLeave++;

                    continue;
                }

                $schedules = $this->activeSchedulesForDate($employee, $dateStr);
                if (! $this->isScheduledWorkday($schedules, $targetDate)) {
                    $skippedOffday++;

                    continue;
                }

                $shiftId = $schedules->count() === 1 ? $schedules->first()?->shift_id : null;

                AttendanceRecord::query()->create([
                    'tenant_id' => $tenantId,
                    'employee_id' => $employee->id,
                    'shift_id' => $shiftId,
                    'date' => $dateStr,
                    'status' => 'absent',
                    'deduct_from_salary' => $deductFromSalary,
                    'late_minutes' => 0,
                    'overtime_minutes' => 0,
                    'overtime_amount' => null,
                    'total_worked' => 0,
                    'device_info' => 'Biometric Auto-Close',
                    'notes' => 'Ausência automática por falta de marcação biométrica.',
                ]);

                $markedAbsentIds[] = $employee->id;
            }
        });

        return [
            'date' => $dateStr,
            'is_holiday' => false,
            'holiday_name' => null,
            'marked_absent_count' => count($markedAbsentIds),
            'skipped_existing_count' => $skippedExisting,
            'skipped_leave_count' => $skippedLeave,
            'skipped_offday_count' => $skippedOffday,
            'absent_employee_ids' => $markedAbsentIds,
        ];
    }

    private function ingestSingle(
        int $tenantId,
        array $item,
        string $timezone,
        ?string $defaultDevice,
        ?string $ipAddress,
        int $debounceSeconds,
    ): array {
        $employee = $this->resolveEmployee($tenantId, $item);
        if (! $employee) {
            throw new \RuntimeException('Funcionário não encontrado neste tenant.');
        }
        if (! $employee->isApproved()) {
            throw new \RuntimeException("Funcionário {$employee->full_name} aguarda aprovação e verificação dos documentos.");
        }
        if ($employee->status !== 'active') {
            throw new \RuntimeException("Funcionário {$employee->full_name} encontra-se com estado '{$employee->status}'.");
        }

        $deviceInfo = substr((string) ($item['device_name'] ?? $item['device_id'] ?? $defaultDevice ?? 'Biometric Terminal'), 0, 250);
        $hasPunchedAt = ! empty($item['punched_at']);

        if ($hasPunchedAt) {
            $punchedAt = Carbon::parse((string) $item['punched_at'], $timezone)->setTimezone($timezone);
            if ($punchedAt->copy()->startOfDay()->greaterThan(Carbon::now($timezone)->startOfDay())) {
                throw new \InvalidArgumentException('Não é permitido registar presenças para datas futuras.');
            }

            $dateStr = $punchedAt->toDateString();
            $schedule = $this->resolveScheduleForPunch($employee, $dateStr, $item['shift_id'] ?? null, $punchedAt, $timezone);
            $shift = $schedule?->shift;
            $shiftId = $schedule?->shift_id;

            return DB::transaction(function () use (
                $tenantId,
                $employee,
                $dateStr,
                $shiftId,
                $shift,
                $punchedAt,
                $item,
                $timezone,
                $deviceInfo,
                $ipAddress,
                $debounceSeconds
            ): array {
                $record = $this->recordForShift($employee->id, $dateStr, $shiftId)->first();
                $direction = strtolower((string) ($item['direction'] ?? 'auto'));
                $force = (bool) ($item['force'] ?? false);

                if ($direction === 'auto' && $record && $record->clock_in) {
                    if (! $force && abs((int) Carbon::parse($record->clock_in)->diffInSeconds($punchedAt)) < $debounceSeconds) {
                        return [
                            'action' => 'ignored_duplicate',
                            'employee_id' => $employee->id,
                            'employee_code' => $employee->employee_code,
                            'biometric_code' => $employee->biometric_code,
                            'date' => $dateStr,
                            'attendance_record_id' => $record->id,
                            'status' => $record->status,
                            'message' => 'Leitura biométrica duplicada ignorada dentro da janela de tolerância.',
                        ];
                    }
                    $direction = 'out';
                } elseif ($direction === 'auto') {
                    $direction = 'in';
                }

                $existed = $record !== null;
                if (! $record) {
                    $record = new AttendanceRecord([
                        'tenant_id' => $tenantId,
                        'employee_id' => $employee->id,
                        'shift_id' => $shiftId,
                        'date' => $dateStr,
                    ]);
                }

                if ($direction === 'in') {
                    $record->clock_in = $punchedAt;
                    $record->late_minutes = $this->lateMinutes($tenantId, $dateStr, $punchedAt, $shift, $timezone);
                    $record->status = ! empty($item['status'])
                        ? (string) $item['status']
                        : ($record->late_minutes > 0 ? 'late' : 'present');
                    if ($record->clock_out) {
                        $record->total_worked = $this->workedMinutes(
                            Carbon::parse($record->clock_in),
                            Carbon::parse($record->clock_out),
                            $shift,
                            $record->break_start ? Carbon::parse($record->break_start) : null,
                            $record->break_end ? Carbon::parse($record->break_end) : null,
                        );
                        $record->overtime_minutes = $this->overtimeMinutes($tenantId, $dateStr, Carbon::parse($record->clock_out), $shift, $timezone);
                        $record->overtime_amount = $this->overtimeCalculator->amount($employee, (int) $record->overtime_minutes);
                        $record->status = ! empty($item['status']) ? (string) $item['status'] : $this->resolveStatus($tenantId, $record, $shift);
                    }
                } else {
                    if (! $record->clock_in) {
                        $record->clock_in = $punchedAt;
                        $record->late_minutes = $this->lateMinutes($tenantId, $dateStr, $punchedAt, $shift, $timezone);
                        $record->status = $record->late_minutes > 0 ? 'late' : 'present';
                    } else {
                        $record->clock_out = $punchedAt;
                        $record->total_worked = $this->workedMinutes(
                            Carbon::parse($record->clock_in),
                            Carbon::parse($record->clock_out),
                            $shift,
                            $record->break_start ? Carbon::parse($record->break_start) : null,
                            $record->break_end ? Carbon::parse($record->break_end) : null,
                        );
                        $record->overtime_minutes = $this->overtimeMinutes($tenantId, $dateStr, $punchedAt, $shift, $timezone);
                        $record->overtime_amount = $this->overtimeCalculator->amount($employee, (int) $record->overtime_minutes);
                        $record->status = ! empty($item['status'])
                            ? (string) $item['status']
                            : $this->resolveStatus($tenantId, $record, $shift);
                    }
                }

                $record->device_info = $deviceInfo;
                $record->ip_address = $ipAddress;
                if (array_key_exists('deduct_from_salary', $item)) {
                    $record->deduct_from_salary = (bool) $item['deduct_from_salary'];
                }
                if (array_key_exists('notes', $item) && $item['notes'] !== null) {
                    $record->notes = (string) $item['notes'];
                }
                $record->save();

                return $this->formatIngestResult($existed ? 'updated' : 'created', $employee, $record);
            });
        }

        // Daily summary mode: date + optional clock_in / clock_out / status
        $dateStr = Carbon::parse((string) $item['date'], $timezone)->toDateString();
        if (Carbon::parse($dateStr, $timezone)->startOfDay()->greaterThan(Carbon::now($timezone)->startOfDay())) {
            throw new \InvalidArgumentException('Não é permitido registar presenças para datas futuras.');
        }

        $schedule = $this->resolveScheduleForPunch($employee, $dateStr, $item['shift_id'] ?? null, null, $timezone);
        $shift = $schedule?->shift;
        $shiftId = $schedule?->shift_id;

        $inDateTime = ! empty($item['clock_in'])
            ? $this->parseTimeOnDate($dateStr, (string) $item['clock_in'], $timezone)
            : null;
        $outDateTime = ! empty($item['clock_out'])
            ? $this->parseClockOut($dateStr, (string) $item['clock_out'], $inDateTime, $shift, $timezone)
            : null;

        $lateMinutes = array_key_exists('late_minutes', $item) && $item['late_minutes'] !== null
            ? max(0, (int) $item['late_minutes'])
            : ($inDateTime ? $this->lateMinutes($tenantId, $dateStr, $inDateTime, $shift, $timezone) : 0);

        $overtimeMinutes = array_key_exists('overtime_minutes', $item) && $item['overtime_minutes'] !== null
            ? max(0, (int) $item['overtime_minutes'])
            : ($outDateTime ? $this->overtimeMinutes($tenantId, $dateStr, $outDateTime, $shift, $timezone) : 0);

        $totalWorked = $inDateTime && $outDateTime
            ? $this->workedMinutes($inDateTime, $outDateTime, $shift)
            : 0;

        $existing = $this->recordForShift($employee->id, $dateStr, $shiftId)->first();
        $existed = $existing !== null;

        $status = (string) ($item['status'] ?? '');
        if ($status === '') {
            if ($inDateTime && $outDateTime) {
                $probe = new AttendanceRecord(['total_worked' => $totalWorked, 'late_minutes' => $lateMinutes]);
                $status = $this->resolveStatus($tenantId, $probe, $shift);
            } else {
                $status = $lateMinutes > 0 ? 'late' : 'present';
            }
        } elseif ($status === 'present' && $lateMinutes > 0) {
            $status = 'late';
        }

        $record = AttendanceRecord::query()->updateOrCreate(
            [
                'employee_id' => $employee->id,
                'date' => $dateStr,
                'shift_id' => $shiftId,
            ],
            [
                'tenant_id' => $tenantId,
                'shift_id' => $shiftId,
                'clock_in' => $inDateTime,
                'clock_out' => $outDateTime,
                'total_worked' => $totalWorked,
                'late_minutes' => $lateMinutes,
                'overtime_minutes' => $overtimeMinutes,
                'overtime_amount' => $this->overtimeCalculator->amount($employee, $overtimeMinutes),
                'status' => $status,
                'deduct_from_salary' => (bool) ($item['deduct_from_salary'] ?? false),
                'device_info' => $deviceInfo,
                'ip_address' => $ipAddress,
                'notes' => $item['notes'] ?? null,
            ],
        );

        return $this->formatIngestResult($existed ? 'updated' : 'created', $employee, $record);
    }

    private function formatIngestResult(string $action, Employee $employee, AttendanceRecord $record): array
    {
        return [
            'action' => $action,
            'attendance_record_id' => $record->id,
            'employee_id' => $employee->id,
            'employee_code' => $employee->employee_code,
            'biometric_code' => $employee->biometric_code,
            'date' => $record->date?->format('Y-m-d'),
            'clock_in' => $record->clock_in?->format('H:i:s'),
            'clock_out' => $record->clock_out?->format('H:i:s'),
            'total_worked' => (int) ($record->total_worked ?? 0),
            'late_minutes' => (int) ($record->late_minutes ?? 0),
            'overtime_minutes' => (int) ($record->overtime_minutes ?? 0),
            'overtime_amount' => $record->overtime_amount === null ? null : (float) $record->overtime_amount,
            'status' => $record->status,
        ];
    }

    public function resolveEmployee(int $tenantId, array $payload): ?Employee
    {
        $base = fn () => Employee::query()->where('tenant_id', $tenantId);

        if (! empty($payload['employee_id'])) {
            $found = $base()->find((int) $payload['employee_id']);
            if ($found) {
                return $found;
            }
        }

        $biometricCode = $this->extractBiometricCode($payload);
        if ($biometricCode !== null && $biometricCode !== '') {
            $found = $base()->where('biometric_code', $biometricCode)->first();
            if ($found) {
                return $found;
            }
        }

        if (! empty($payload['employee_code'])) {
            $code = trim((string) $payload['employee_code']);
            $found = $base()->where('employee_code', $code)->first();
            if ($found) {
                return $found;
            }
        }

        if (! empty($payload['id_document_number'])) {
            $doc = trim((string) $payload['id_document_number']);
            $found = $base()->where('id_document_number', $doc)->first();
            if ($found) {
                return $found;
            }
        }

        return null;
    }

    private function extractBiometricCode(array $payload): ?string
    {
        $val = $payload['biometric_code'] ?? $payload['biometric_id'] ?? null;

        return $val !== null && $val !== '' ? trim((string) $val) : null;
    }

    private function splitName(array $item): array
    {
        $first = trim((string) ($item['first_name'] ?? ''));
        $last = trim((string) ($item['last_name'] ?? ''));
        if ($first !== '') {
            return [$first, $last !== '' ? $last : '-'];
        }

        $full = trim((string) ($item['full_name'] ?? ''));
        if ($full === '') {
            return ['', ''];
        }

        $parts = preg_split('/\s+/', $full) ?: [];
        $first = array_shift($parts) ?? '';
        $last = count($parts) > 0 ? implode(' ', $parts) : '-';

        return [$first, $last];
    }

    private function generateEmployeeCode(int $tenantId): string
    {
        $count = Employee::withTrashed()->where('tenant_id', $tenantId)->count() + 1;
        do {
            $candidate = 'EMP-'.str_pad((string) $count, 4, '0', STR_PAD_LEFT);
            $exists = Employee::withTrashed()->where('tenant_id', $tenantId)->where('employee_code', $candidate)->exists();
            $count++;
        } while ($exists);

        return $candidate;
    }

    private function activeSchedulesForDate(Employee $employee, string $date): Collection
    {
        return $employee->schedules()
            ->with('shift')
            ->whereDate('effective_from', '<=', $date)
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date))
            ->where('is_active', true)
            ->get();
    }

    private function resolveScheduleForPunch(
        Employee $employee,
        string $date,
        mixed $shiftId,
        ?Carbon $punchedAt,
        string $timezone,
    ): ?EmployeeSchedule {
        $schedules = $this->activeSchedulesForDate($employee, $date)
            ->filter(function (EmployeeSchedule $schedule) use ($date) {
                $days = $schedule->custom_days ?? $schedule->shift?->working_days;

                return $days === null || in_array(Carbon::parse($date)->dayOfWeek, array_map('intval', $days), true);
            })
            ->values();

        if ($shiftId !== null && $shiftId !== '') {
            return $schedules->firstWhere('shift_id', (int) $shiftId);
        }

        if ($schedules->count() <= 1) {
            return $schedules->first();
        }

        if ($punchedAt) {
            return $schedules->sortBy(function (EmployeeSchedule $schedule) use ($date, $punchedAt, $timezone) {
                $start = $schedule->shift?->start_time;
                if (! $start) {
                    return PHP_INT_MAX;
                }

                return abs((int) Carbon::parse($date.' '.$start, $timezone)->diffInSeconds($punchedAt));
            })->first();
        }

        return $schedules->first();
    }

    private function isScheduledWorkday(Collection $schedules, Carbon $targetDate): bool
    {
        if ($schedules->isEmpty()) {
            return in_array((int) $targetDate->dayOfWeek, [1, 2, 3, 4, 5], true);
        }

        foreach ($schedules as $schedule) {
            $days = $schedule->custom_days ?? $schedule->shift?->working_days ?? [1, 2, 3, 4, 5];
            if (in_array((int) $targetDate->dayOfWeek, array_map('intval', $days), true)) {
                return true;
            }
        }

        return false;
    }

    private function holidayOnDate(int $tenantId, Carbon $targetDate): ?Holiday
    {
        $dateStr = $targetDate->toDateString();
        $holidays = Holiday::query()->where('tenant_id', $tenantId)->get();

        return $holidays->first(function (Holiday $holiday) use ($dateStr, $targetDate) {
            if (! $holiday->date) {
                return false;
            }
            if ($holiday->date->toDateString() === $dateStr) {
                return true;
            }

            return $holiday->is_recurring
                && $holiday->date->format('m-d') === $targetDate->format('m-d');
        });
    }

    private function recordForShift(int $employeeId, string $date, ?int $shiftId)
    {
        $query = AttendanceRecord::query()
            ->where('employee_id', $employeeId)
            ->whereDate('date', $date);

        return $shiftId === null
            ? $query->whereNull('shift_id')
            : $query->where('shift_id', $shiftId);
    }

    private function lateMinutes(int $tenantId, string $date, \DateTimeInterface $clockIn, ?Shift $shift, string $timezone): int
    {
        $time = $shift?->start_time ?: (string) ($this->setting($tenantId, 'hr.work_start_time') ?? '');
        $grace = (int) ($shift?->late_tolerance_minutes ?? (int) ($this->setting($tenantId, 'hr.late_grace_minutes') ?? 10));

        if (! $time) {
            return 0;
        }

        $expected = Carbon::parse($date.' '.$time, $timezone);
        $actual = Carbon::parse($clockIn)->setTimezone($timezone);
        $latestOnTime = $expected->copy()->addMinutes($grace);

        return $actual->greaterThan($latestOnTime)
            ? (int) $latestOnTime->diffInMinutes($actual)
            : 0;
    }

    private function overtimeMinutes(int $tenantId, string $date, \DateTimeInterface $clockOut, ?Shift $shift, string $timezone): int
    {
        $endTime = $shift?->end_time ?: (string) ($this->setting($tenantId, 'hr.work_end_time') ?? '');

        if (! $endTime) {
            return 0;
        }

        $expected = Carbon::parse($date.' '.$endTime, $timezone);
        if ($this->isNightShift($date, $endTime, $shift, $timezone)) {
            $expected->addDay();
        }

        $actual = Carbon::parse($clockOut)->setTimezone($timezone);
        if ($actual->lessThanOrEqualTo($expected)) {
            return 0;
        }

        return (int) $expected->diffInMinutes($actual);
    }

    private function resolveStatus(int $tenantId, AttendanceRecord $record, ?Shift $shift = null): string
    {
        $dailyHours = (float) ($shift?->work_hours ?: ($this->setting($tenantId, 'hr.daily_hours') ?? 8));
        $threshold = (int) round($dailyHours * 30);

        if (($record->total_worked ?? 0) < $threshold) {
            return 'half_day';
        }

        return ($record->late_minutes ?? 0) > 0 ? 'late' : 'present';
    }

    private function parseTimeOnDate(string $date, string $timeOrDateTime, string $timezone): Carbon
    {
        if (preg_match('/^\d{2}:\d{2}(:\d{2})?$/', trim($timeOrDateTime))) {
            return Carbon::parse($date.' '.trim($timeOrDateTime), $timezone);
        }

        return Carbon::parse($timeOrDateTime, $timezone)->setTimezone($timezone);
    }

    private function parseClockOut(string $date, string $clockOut, ?Carbon $inDateTime, ?Shift $shift, string $timezone): Carbon
    {
        $outDateTime = $this->parseTimeOnDate($date, $clockOut, $timezone);

        if ($inDateTime && $outDateTime->lessThanOrEqualTo($inDateTime)) {
            $outDateTime->addDay();
        } elseif (! $inDateTime && $shift?->end_time && $this->isNightShift($date, $shift->end_time, $shift, $timezone)) {
            $startRef = $shift->start_time ? Carbon::parse($date.' '.$shift->start_time, $timezone) : null;
            if ($startRef && $outDateTime->lessThanOrEqualTo($startRef)) {
                $outDateTime->addDay();
            }
        }

        return $outDateTime;
    }

    private function workedMinutes(
        Carbon $clockIn,
        Carbon $clockOut,
        ?Shift $shift,
        ?Carbon $breakStart = null,
        ?Carbon $breakEnd = null,
    ): int {
        return $this->workedHoursCalculator->workedMinutes($clockIn, $clockOut, $shift, $breakStart, $breakEnd);
    }

    private function isNightShift(string $date, string $endTime, ?Shift $shift, string $timezone): bool
    {
        if ($shift?->is_night_shift) {
            return true;
        }
        if (! $shift?->start_time) {
            return false;
        }

        return Carbon::parse($date.' '.$endTime, $timezone)
            ->lessThanOrEqualTo(Carbon::parse($date.' '.$shift->start_time, $timezone));
    }

    private function setting(int $tenantId, string $key): mixed
    {
        [$group, $k] = explode('.', $key, 2);

        return Setting::query()
            ->where('tenant_id', $tenantId)
            ->where('group', $group)
            ->where('key', $k)
            ->first()?->value;
    }

    private function tenantTimezone(int $tenantId): string
    {
        return Tenant::query()->whereKey($tenantId)->value('timezone') ?: config('app.timezone', 'Africa/Luanda');
    }
}
