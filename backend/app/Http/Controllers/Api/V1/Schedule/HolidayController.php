<?php

namespace App\Http\Controllers\Api\V1\Schedule;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Holiday;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HolidayController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Holiday::class);

        $holidays = Holiday::query()
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('name', 'like', "%{$term}%");
            })
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')))
            ->when($request->filled('year'), fn ($q) => $q->whereYear('date', $request->integer('year')))
            ->when($request->boolean('recurring'), fn ($q) => $q->where('is_recurring', true))
            ->orderBy($request->string('sort_by', 'date'), $request->string('sort_dir', 'asc'))
            ->paginate($request->integer('per_page', 50));

        return $this->paginated($holidays->through(fn ($h) => [
            'id' => $h->id,
            'name' => $h->name,
            'date' => $h->date?->toDateString(),
            'is_recurring' => $h->is_recurring,
            'type' => $h->type,
            'description' => $h->description,
            'created_at' => $h->created_at?->toIso8601String(),
        ]));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Holiday::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'date' => ['required', 'date'],
            'is_recurring' => ['nullable', 'boolean'],
            'type' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['is_recurring'] = $data['is_recurring'] ?? false;

        $holiday = Holiday::query()->create($data);

        return $this->success($holiday, 'Feriado criado com sucesso.', 201);
    }

    public function update(Request $request, Holiday $holiday): JsonResponse
    {
        $this->authorize('update', $holiday);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'date' => ['sometimes', 'date'],
            'is_recurring' => ['nullable', 'boolean'],
            'type' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        $holiday->update($data);

        return $this->success($holiday->fresh(), 'Feriado atualizado com sucesso.');
    }

    public function destroy(Holiday $holiday): JsonResponse
    {
        $this->authorize('delete', $holiday);

        $holiday->delete();

        return $this->success(null, 'Feriado removido com sucesso.');
    }
}
