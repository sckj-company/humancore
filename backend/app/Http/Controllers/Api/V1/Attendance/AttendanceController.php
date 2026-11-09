<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\AttendanceResource;
use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeSchedule;
use App\Models\Shift;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class AttendanceController extends BaseController
{
    public function toggle(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'shift_id' => ['nullable', 'integer', 'exists:shifts,id'],
            'date' => ['nullable', 'date', 'before_or_equal:today'],
        ]);
        $employeeId = $request->input('employee_id') ?: auth()->user()->employee?->id;
        $employee = Employee::find($employeeId);
        if (! $employee) {
            return $this->error('Funcionário não encontrado.', 422);
        }

        $today = $validated['date'] ?? now()->toDateString();
        if (Carbon::parse($today)->startOfDay()->isFuture()) {
            return $this->error('Não é permitido registar presenças para datas futuras.', 422);
        }

        $schedule = $this->scheduleForDate($employee, $today, $validated['shift_id'] ?? null);
        $shiftId = $schedule?->shift_id;
        $record = $this->recordForShift($employee->id, $today, $shiftId)->first();

        if ($record && $record->clock_in && $record->clock_out) {
            return $this->error('A entrada e a saída de hoje já foram registadas para este funcionário.', 422);
        }

        if (! $record) {
            $record = AttendanceRecord::create([
                'employee_id' => $employee->id,
                'shift_id' => $shiftId,
                'tenant_id' => tenant_id() ?: $employee->tenant_id,
                'date' => $today,
                'status' => 'present',
            ]);
        }

        if ($record->clock_in && ! $record->clock_out) {
            $record->clock_out = now();
            $record->total_worked = (int) Carbon::parse($record->clock_in)->diffInMinutes($record->clock_out);
            $record->overtime_minutes = $this->overtimeMinutes($today, $record->clock_out, $employee, $schedule?->shift);
            $record->status = $this->resolveStatus($record);
            $record->save();

            return $this->success(new AttendanceResource($record->load('shift')), 'Saída registada.');
        }

        $record->clock_in = now();
        $record->late_minutes = $this->lateMinutes($today, $record->clock_in, $employee, $schedule?->shift);
        $record->status = $record->late_minutes > 0 ? 'late' : 'present';
        $record->ip_address = $request->ip();
        $record->device_info = substr((string) $request->userAgent(), 0, 250);
        $record->save();

        return $this->success(new AttendanceResource($record->load('shift')), 'Entrada registada.');
    }

    public function today(Request $request): JsonResponse
    {
        $employeeId = $request->input('employee_id') ?: auth()->user()->employee?->id;
        if (! $employeeId) {
            return $this->error('Funcionário não especificado.', 422);
        }

        $query = AttendanceRecord::with('shift')
            ->where('employee_id', $employeeId)
            ->whereDate('date', now()->toDateString());
        if ($request->filled('shift_id')) {
            $query->where('shift_id', $request->integer('shift_id'));
        }
        $record = $query->latest('id')->first();

        return $this->success($record ? new AttendanceResource($record) : null);
    }

    public function storeManual(Request $request): JsonResponse
    {
        $this->authorize('create', AttendanceRecord::class);

        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'shift_id' => ['nullable', 'integer', 'exists:shifts,id'],
            'date' => ['required', 'date', 'before_or_equal:today'],
            'clock_in' => ['nullable', 'date_format:H:i'],
            'clock_out' => ['nullable', 'date_format:H:i'],
            'status' => ['required', 'in:present,absent,late,half_day,holiday,vacation,sick,justified'],
            'deduct_from_salary' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
        ], [
            'date.before_or_equal' => 'Não é permitido registar presenças para datas futuras.',
        ]);

        if (Carbon::parse($validated['date'])->startOfDay()->isFuture()) {
            return $this->error('Não é permitido registar presenças para datas futuras.', 422);
        }

        $employee = Employee::findOrFail($validated['employee_id']);
        $schedule = $this->scheduleForDate($employee, $validated['date'], $validated['shift_id'] ?? null);
        $shiftId = $schedule?->shift_id;
        $existing = $this->recordForShift($employee->id, $validated['date'], $shiftId)->first();

        if ($existing && $existing->clock_in && $existing->clock_out) {
            return $this->error('A jornada deste dia já foi fechada e não permite novos registos de presença.', 422);
        }

        $totalMinutes = 0;
        $lateMinutes = 0;
        $overtimeMinutes = 0;

        $inDateTime = null;
        $outDateTime = null;
        if (! empty($validated['clock_in'])) {
            $inDateTime = Carbon::parse($validated['date'] . ' ' . $validated['clock_in']);
            $lateMinutes = $this->lateMinutes($validated['date'], $inDateTime, $employee, $schedule?->shift);
        }
        if (! empty($validated['clock_out'])) {
            $outDateTime = Carbon::parse($validated['date'] . ' ' . $validated['clock_out']);
            $overtimeMinutes = $this->overtimeMinutes($validated['date'], $outDateTime, $employee, $schedule?->shift);
        }
        if ($inDateTime && $outDateTime) {
            $totalMinutes = $this->workedMinutes($inDateTime, $outDateTime, $schedule?->shift);
        }

        $record = AttendanceRecord::updateOrCreate(
            [
                'employee_id' => $employee->id,
                'date' => $validated['date'],
                'shift_id' => $shiftId,
            ],
            [
                'tenant_id' => tenant_id() ?: $employee->tenant_id,
                'shift_id' => $shiftId,
                'clock_in' => $inDateTime,
                'clock_out' => $outDateTime,
                'total_worked' => $totalMinutes,
                'late_minutes' => $lateMinutes,
                'overtime_minutes' => $overtimeMinutes,
                'status' => $validated['status'] === 'late' || $lateMinutes > 0 ? 'late' : $validated['status'],
                'deduct_from_salary' => $request->boolean('deduct_from_salary', false),
                'notes' => $validated['notes'] ?? null,
            ]
        );

        return $this->success(new AttendanceResource($record), 'Presença registada com sucesso.', 201);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', AttendanceRecord::class);

        $records = AttendanceRecord::query()
            ->with(['employee', 'shift'])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->when($request->string('date')->toString(), fn ($q, $d) => $q->where('date', $d))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->string('search')->toString(), function ($q, $s) {
                $q->whereHas('employee', function ($e) use ($s) {
                    $e->where('first_name', 'like', "%{$s}%")
                        ->orWhere('last_name', 'like', "%{$s}%")
                        ->orWhere('employee_code', 'like', "%{$s}%");
                });
            })
            ->orderByDesc('date')
            ->paginate($request->integer('per_page', 20));

        return $this->paginated(AttendanceResource::collection($records));
    }

    public function myHistory(Request $request): JsonResponse
    {
        $employee = auth()->user()->employee;
        if (! $employee) {
            return $this->error('Utilizador sem funcionário associado.', 422);
        }

        $records = AttendanceRecord::with('shift')->where('employee_id', $employee->id)
            ->orderByDesc('date')
            ->paginate($request->integer('per_page', 20));

        return $this->paginated(AttendanceResource::collection($records));
    }

    public function update(Request $request, AttendanceRecord $record): JsonResponse
    {
        $this->authorize('update', $record);

        $validated = $request->validate([
            'date' => ['sometimes', 'required', 'date', 'before_or_equal:today'],
            'shift_id' => ['sometimes', 'nullable', 'integer', 'exists:shifts,id'],
            'clock_in' => ['sometimes', 'nullable', 'date_format:H:i'],
            'clock_out' => ['sometimes', 'nullable', 'date_format:H:i'],
            'status' => ['sometimes', 'required', 'in:present,absent,late,half_day,holiday,vacation,sick,justified'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'deduct_from_salary' => ['sometimes', 'boolean'],
        ]);

        $date = $validated['date'] ?? $record->date->toDateString();
        $shiftId = array_key_exists('shift_id', $validated) ? $validated['shift_id'] : $record->shift_id;
        $attendanceChanged = array_key_exists('date', $validated)
            || array_key_exists('shift_id', $validated)
            || array_key_exists('clock_in', $validated)
            || array_key_exists('clock_out', $validated);

        if ($attendanceChanged) {
            $employee = $record->employee;
            $schedule = $this->scheduleForDate($employee, $date, $shiftId, true);
            $shiftId = $schedule?->shift_id;

            $collision = $this->recordForShift($employee->id, $date, $shiftId)
                ->whereKeyNot($record->id)
                ->exists();
            if ($collision) {
                throw ValidationException::withMessages([
                    'date' => 'Já existe uma marcação para este funcionário, turno e data.',
                ]);
            }

            $clockIn = array_key_exists('clock_in', $validated)
                ? $validated['clock_in']
                : $record->clock_in?->format('H:i');
            $clockOut = array_key_exists('clock_out', $validated)
                ? $validated['clock_out']
                : $record->clock_out?->format('H:i');
            $inDateTime = $clockIn ? Carbon::parse($date.' '.$clockIn) : null;
            $outDateTime = $clockOut ? Carbon::parse($date.' '.$clockOut) : null;

            $validated['date'] = $date;
            $validated['shift_id'] = $shiftId;
            $validated['clock_in'] = $inDateTime;
            $validated['clock_out'] = $outDateTime;
            $validated['total_worked'] = $inDateTime && $outDateTime
                ? $this->workedMinutes($inDateTime, $outDateTime, $schedule?->shift)
                : 0;
            $validated['late_minutes'] = $inDateTime
                ? $this->lateMinutes($date, $inDateTime, $employee, $schedule?->shift)
                : 0;
            $validated['overtime_minutes'] = $outDateTime
                ? $this->overtimeMinutes($date, $outDateTime, $employee, $schedule?->shift)
                : 0;
        }

        $record->update($validated);

        return $this->success(new AttendanceResource($record->fresh(['shift'])), 'Presença atualizada.');
    }

    protected function lateMinutes(string $date, \DateTimeInterface $clockIn, Employee $employee, ?Shift $shift = null): int
    {
        $time = $shift?->start_time ?: (string) ($this->setting('hr.work_start_time') ?? '');
        $grace = (int) ($shift?->late_tolerance_minutes ?? (int) ($this->setting('hr.late_grace_minutes') ?? 10));

        if (! $time) {
            return 0;
        }

        $timezone = tenant()->timezone ?? 'Africa/Luanda';
        $expected = Carbon::parse($date.' '.$time, $timezone);
        $actual = Carbon::parse($clockIn)->setTimezone($timezone);

        $latestOnTime = $expected->copy()->addMinutes($grace);

        return $actual->greaterThan($latestOnTime)
            ? (int) $latestOnTime->diffInMinutes($actual)
            : 0;
    }

    protected function overtimeMinutes(string $date, \DateTimeInterface $clockOut, Employee $employee, ?Shift $shift = null): int
    {
        $endTime = $shift?->end_time ?: (string) ($this->setting('hr.work_end_time') ?? '');

        if (! $endTime) {
            return 0;
        }

        $timezone = tenant()->timezone ?? 'Africa/Luanda';
        $expected = Carbon::parse($date.' '.$endTime, $timezone);
        if ($shift?->is_night_shift || ($shift?->start_time && $endTime <= $shift->start_time)) {
            $expected->addDay();
        }

        $actual = Carbon::parse($clockOut)->setTimezone($timezone);
        if ($actual->lessThanOrEqualTo($expected)) {
            return 0;
        }

        return (int) $expected->diffInMinutes($actual);
    }

    protected function resolveStatus(AttendanceRecord $record): string
    {
        $dailyHours = (int) ($this->setting('hr.daily_hours') ?? 8);
        $threshold = $dailyHours * 30;

        if (($record->total_worked ?? 0) < $threshold) {
            return 'half_day';
        }

        return $record->late_minutes > 0 ? 'late' : 'present';
    }

    protected function setting(string $key): mixed
    {
        [$group, $k] = explode('.', $key, 2);

        return Setting::where('tenant_id', tenant_id())
            ->where('group', $group)
            ->where('key', $k)
            ->value('value');
    }

    private function workedMinutes(Carbon $clockIn, Carbon $clockOut, ?Shift $shift): int
    {
        if ($clockOut->lessThanOrEqualTo($clockIn) && ($shift?->is_night_shift || ($shift?->start_time && $shift->end_time <= $shift->start_time))) {
            $clockOut->addDay();
        }

        return max(0, (int) $clockIn->diffInMinutes($clockOut));
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

    private function scheduleForDate(Employee $employee, string $date, ?int $shiftId, bool $includeInactive = false): ?EmployeeSchedule
    {
        $schedules = $employee->schedules()
            ->with('shift')
            ->whereDate('effective_from', '<=', $date)
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', $date))
            ->when(! $includeInactive, fn ($query) => $query->where('is_active', true))
            ->get()
            ->filter(function (EmployeeSchedule $schedule) use ($date) {
                $days = $schedule->custom_days ?? $schedule->shift?->working_days;

                return $days === null || in_array(Carbon::parse($date)->dayOfWeek, array_map('intval', $days), true);
            });

        if ($shiftId !== null) {
            $schedule = $schedules->firstWhere('shift_id', $shiftId);
            if (! $schedule) {
                throw ValidationException::withMessages([
                    'shift_id' => 'O turno selecionado não está atribuído ao funcionário nesta data.',
                ]);
            }

            return $schedule;
        }

        if ($schedules->count() > 1) {
            throw ValidationException::withMessages([
                'shift_id' => 'Selecione o turno correspondente a esta marcação.',
            ]);
        }

        return $schedules->first();
    }
}
