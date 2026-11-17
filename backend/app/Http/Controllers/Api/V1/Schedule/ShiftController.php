<?php

namespace App\Http\Controllers\Api\V1\Schedule;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\ShiftResource;
use App\Models\Shift;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShiftController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Shift::class);

        $shifts = Shift::query()
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('name', 'like', "%{$term}%")
                    ->orWhere('code', 'like', "%{$term}%");
            })
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy($request->string('sort_by', 'name'), $request->string('sort_dir', 'asc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(ShiftResource::collection($shifts));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Shift::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'start_time' => ['required', 'date_format:H:i'],
            'end_time' => ['required', 'date_format:H:i'],
            'break_minutes' => ['nullable', 'integer', 'min:0'],
            'work_hours' => ['nullable', 'numeric', 'min:0', 'max:24'],
            'late_tolerance_minutes' => ['nullable', 'integer', 'min:0'],
            'working_days' => ['nullable', 'array'],
            'working_days.*' => ['integer', 'min:0', 'max:6'],
            'color' => ['nullable', 'string', 'max:20'],
            'is_night_shift' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $data['tenant_id'] = tenant_id();

        if (empty($data['work_hours']) && isset($data['start_time'], $data['end_time'])) {
            $data['work_hours'] = $this->computeWorkHours(
                (string) $data['start_time'],
                (string) $data['end_time'],
                (int) ($data['break_minutes'] ?? 60),
                (bool) ($data['is_night_shift'] ?? false),
            );
        }

        $shift = Shift::query()->create($data);

        return $this->success(
            new ShiftResource($shift),
            'Turno criado com sucesso.',
            201,
        );
    }

    public function show(Shift $shift): JsonResponse
    {
        $this->authorize('view', $shift);

        return $this->success(new ShiftResource($shift->load('employeeSchedules.employee')));
    }

    public function update(Request $request, Shift $shift): JsonResponse
    {
        $this->authorize('update', $shift);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'start_time' => ['sometimes', 'date_format:H:i'],
            'end_time' => ['sometimes', 'date_format:H:i'],
            'break_minutes' => ['nullable', 'integer', 'min:0'],
            'work_hours' => ['nullable', 'numeric', 'min:0', 'max:24'],
            'late_tolerance_minutes' => ['nullable', 'integer', 'min:0'],
            'working_days' => ['nullable', 'array'],
            'working_days.*' => ['integer', 'min:0', 'max:6'],
            'color' => ['nullable', 'string', 'max:20'],
            'is_night_shift' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        if (! array_key_exists('work_hours', $data) && (array_key_exists('start_time', $data) || array_key_exists('end_time', $data) || array_key_exists('break_minutes', $data))) {
            $data['work_hours'] = $this->computeWorkHours(
                (string) ($data['start_time'] ?? $shift->start_time),
                (string) ($data['end_time'] ?? $shift->end_time),
                (int) ($data['break_minutes'] ?? $shift->break_minutes ?? 60),
                (bool) ($data['is_night_shift'] ?? $shift->is_night_shift),
            );
        }

        $shift->update($data);

        return $this->success(
            new ShiftResource($shift->fresh()),
            'Turno atualizado com sucesso.',
        );
    }

    private function computeWorkHours(string $startTime, string $endTime, int $breakMinutes, bool $isNightShift): float
    {
        $start = Carbon::parse($startTime);
        $end = Carbon::parse($endTime);
        if ($end->lessThanOrEqualTo($start) || $isNightShift) {
            if ($end->lessThanOrEqualTo($start)) {
                $end->addDay();
            }
        }
        $spanMinutes = max(0, (int) $start->diffInMinutes($end));

        return round(max(0, $spanMinutes - max(0, $breakMinutes)) / 60, 2);
    }

    public function destroy(Shift $shift): JsonResponse
    {
        $this->authorize('delete', $shift);

        $shift->delete();

        return $this->success(null, 'Turno removido com sucesso.');
    }
}
