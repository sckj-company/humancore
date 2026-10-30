<?php

namespace App\Http\Controllers\Api\V1\Schedule;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\EmployeeSchedule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeScheduleController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', EmployeeSchedule::class);

        $schedules = EmployeeSchedule::query()
            ->with(['employee:id,first_name,last_name,employee_code', 'shift:id,name,code,start_time,end_time,color'])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->when($request->filled('shift_id'), fn ($q) => $q->where('shift_id', $request->integer('shift_id')))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderByDesc('effective_from')
            ->paginate($request->integer('per_page', 15));

        return $this->paginated($schedules->through(fn ($s) => [
            'id' => $s->id,
            'employee_id' => $s->employee_id,
            'shift_id' => $s->shift_id,
            'effective_from' => $s->effective_from?->toDateString(),
            'effective_to' => $s->effective_to?->toDateString(),
            'custom_days' => $s->custom_days,
            'is_active' => $s->is_active,
            'notes' => $s->notes,
            'employee' => $s->employee ? [
                'id' => $s->employee->id,
                'full_name' => $s->employee->full_name,
                'employee_code' => $s->employee->employee_code,
            ] : null,
            'shift' => $s->shift ? [
                'id' => $s->shift->id,
                'name' => $s->shift->name,
                'code' => $s->shift->code,
                'start_time' => $s->shift->start_time,
                'end_time' => $s->shift->end_time,
                'color' => $s->shift->color,
            ] : null,
            'created_at' => $s->created_at?->toIso8601String(),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', EmployeeSchedule::class);

        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'shift_id' => ['required', 'integer', 'exists:shifts,id'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'custom_days' => ['nullable', 'array'],
            'custom_days.*' => ['integer', 'min:0', 'max:6'],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['assigned_by'] = $request->user()->id;

        $isActive = $data['is_active'] ?? true;
        if ($isActive) {
            EmployeeSchedule::query()
                ->where('employee_id', $data['employee_id'])
                ->where('is_active', true)
                ->update(['is_active' => false]);
            $data['is_active'] = true;
        }

        $schedule = EmployeeSchedule::query()->create($data);

        return $this->success(
            $schedule->load(['employee', 'shift']),
            'Horário atribuído com sucesso.',
            201,
        );
    }

    public function show(EmployeeSchedule $employeeSchedule): JsonResponse
    {
        $this->authorize('view', $employeeSchedule);

        return $this->success(
            $employeeSchedule->load(['employee', 'shift', 'assignedBy'])
        );
    }

    public function update(Request $request, EmployeeSchedule $employeeSchedule): JsonResponse
    {
        $this->authorize('update', $employeeSchedule);

        $data = $request->validate([
            'shift_id' => ['sometimes', 'integer', 'exists:shifts,id'],
            'effective_from' => ['sometimes', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'custom_days' => ['nullable', 'array'],
            'custom_days.*' => ['integer', 'min:0', 'max:6'],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $employeeSchedule->update($data);

        return $this->success(
            $employeeSchedule->fresh()->load(['employee', 'shift']),
            'Horário atualizado com sucesso.',
        );
    }

    public function destroy(EmployeeSchedule $employeeSchedule): JsonResponse
    {
        $this->authorize('delete', $employeeSchedule);

        $employeeSchedule->delete();

        return $this->success(null, 'Horário removido com sucesso.');
    }

    public function mySchedule(Request $request): JsonResponse
    {
        $employee = auth()->user()->employee;
        if (! $employee) {
            return $this->error('Utilizador sem funcionário associado.', 422);
        }

        $schedules = EmployeeSchedule::query()
            ->where('employee_id', $employee->id)
            ->where('tenant_id', tenant_id())
            ->with('shift')
            ->where(function ($q) {
                $q->where('is_active', true)
                    ->where(function ($q2) {
                        $q2->whereNull('effective_to')
                            ->orWhere('effective_to', '>=', now());
                    });
            })
            ->orderByDesc('effective_from')
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'shift' => $s->shift ? [
                    'id' => $s->shift->id,
                    'name' => $s->shift->name,
                    'code' => $s->shift->code,
                    'start_time' => $s->shift->start_time,
                    'end_time' => $s->shift->end_time,
                    'break_minutes' => $s->shift->break_minutes,
                    'work_hours' => (float) $s->shift->work_hours,
                    'working_days' => $s->shift->working_days ?? [],
                    'color' => $s->shift->color,
                    'is_night_shift' => $s->shift->is_night_shift,
                ] : null,
                'effective_from' => $s->effective_from?->toDateString(),
                'effective_to' => $s->effective_to?->toDateString(),
                'custom_days' => $s->custom_days,
            ]);

        return $this->success($schedules);
    }
}
