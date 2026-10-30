<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\AttendanceResource;
use App\Models\AttendanceRecord;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AttendanceController extends BaseController
{
    public function toggle(Request $request): JsonResponse
    {
        $employeeId = $request->input('employee_id') ?: auth()->user()->employee?->id;
        $employee = \App\Models\Employee::find($employeeId);
        if (! $employee) {
            return $this->error('Funcionário não encontrado.', 422);
        }

        $today = $request->input('date', now()->toDateString());

        $record = AttendanceRecord::where('employee_id', $employee->id)
            ->where('tenant_id', tenant_id() ?: $employee->tenant_id)
            ->whereDate('date', $today)
            ->first();

        if (! $record) {
            $record = AttendanceRecord::create([
                'employee_id' => $employee->id,
                'tenant_id' => tenant_id() ?: $employee->tenant_id,
                'date' => $today,
                'status' => 'present',
            ]);
        }

        if ($record->clock_in && ! $record->clock_out) {
            $record->clock_out = now();
            $record->total_worked = (int) Carbon::parse($record->clock_in)->diffInMinutes($record->clock_out);
            $record->status = $this->resolveStatus($record);
            $record->save();

            return $this->success(new AttendanceResource($record), 'Saída registada.');
        }

        $record->clock_in = now();
        $record->late_minutes = $this->lateMinutes($today, $record->clock_in);
        $record->status = $record->late_minutes > 0 ? 'late' : 'present';
        $record->ip_address = $request->ip();
        $record->device_info = substr((string) $request->userAgent(), 0, 250);
        $record->save();

        return $this->success(new AttendanceResource($record), 'Entrada registada.');
    }

    public function today(Request $request): JsonResponse
    {
        $employeeId = $request->input('employee_id') ?: auth()->user()->employee?->id;
        if (! $employeeId) {
            return $this->error('Funcionário não especificado.', 422);
        }

        $record = AttendanceRecord::where('employee_id', $employeeId)
            ->whereDate('date', now()->toDateString())
            ->first();

        return $this->success($record ? new AttendanceResource($record) : null);
    }

    public function storeManual(Request $request): JsonResponse
    {
        $this->authorize('create', AttendanceRecord::class);

        $validated = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'date' => ['required', 'date'],
            'clock_in' => ['nullable', 'string'],
            'clock_out' => ['nullable', 'string'],
            'status' => ['required', 'in:present,late,absent,half_day,excused'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $employee = \App\Models\Employee::findOrFail($validated['employee_id']);
        $totalMinutes = 0;

        $inDateTime = null;
        $outDateTime = null;
        if (! empty($validated['clock_in'])) {
            $inDateTime = Carbon::parse($validated['date'] . ' ' . $validated['clock_in']);
        }
        if (! empty($validated['clock_out'])) {
            $outDateTime = Carbon::parse($validated['date'] . ' ' . $validated['clock_out']);
        }
        if ($inDateTime && $outDateTime) {
            $totalMinutes = max(0, (int) $inDateTime->diffInMinutes($outDateTime));
        }

        $record = AttendanceRecord::updateOrCreate(
            [
                'employee_id' => $employee->id,
                'date' => $validated['date'],
            ],
            [
                'tenant_id' => tenant_id() ?: $employee->tenant_id,
                'clock_in' => $inDateTime,
                'clock_out' => $outDateTime,
                'total_worked' => $totalMinutes,
                'status' => $validated['status'],
                'notes' => $validated['notes'] ?? null,
            ]
        );

        return $this->success(new AttendanceResource($record), 'Presença registada com sucesso.', 201);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', AttendanceRecord::class);

        $records = AttendanceRecord::query()
            ->with('employee')
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

        $records = AttendanceRecord::where('employee_id', $employee->id)
            ->orderByDesc('date')
            ->paginate($request->integer('per_page', 20));

        return $this->paginated(AttendanceResource::collection($records));
    }

    public function update(Request $request, AttendanceRecord $record): JsonResponse
    {
        $this->authorize('update', $record);

        $validated = $request->validate([
            'status' => ['required', 'in:present,late,absent,half_day,holiday,justified'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $record->update($validated);

        return $this->success(new AttendanceResource($record), 'Presença atualizada.');
    }

    protected function lateMinutes(string $date, \DateTimeInterface $clockIn): int
    {
        $grace = (int) ($this->setting('hr.late_grace_minutes') ?? 10);
        $schedule = (string) ($this->setting('hr.work_start_time') ?? '');

        if (! $schedule) {
            return 0;
        }

        $timezone = tenant()->timezone ?? 'Africa/Luanda';
        $expected = Carbon::parse($date.' '.$schedule, $timezone);
        $actual = Carbon::parse($clockIn)->setTimezone($timezone);

        return max(0, (int) $expected->diffInMinutes($actual) - $grace);
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
}
