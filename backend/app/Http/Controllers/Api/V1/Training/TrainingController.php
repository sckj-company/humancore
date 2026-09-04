<?php

namespace App\Http\Controllers\Api\V1\Training;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\TrainingAssignmentResource;
use App\Http\Resources\V1\TrainingResource;
use App\Models\Training;
use App\Models\TrainingAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TrainingController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Training::class);

        $trainings = Training::query()
            ->with(['creator:id,name'])
            ->withCount('assignments')
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', "%{$request->string('search')}%"))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')))
            ->orderBy($request->string('sort_by', 'start_date'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(TrainingResource::collection($trainings));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Training::class);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'category' => ['nullable', 'in:'.implode(',', array_keys(Training::CATEGORIES))],
            'duration_hours' => ['nullable', 'integer', 'min:0'],
            'provider' => ['nullable', 'string', 'max:255'],
            'location' => ['nullable', 'string', 'max:255'],
            'cost' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
            'max_participants' => ['nullable', 'integer', 'min:1'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['nullable', 'in:'.implode(',', array_keys(Training::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['created_by'] = $request->user()->id;
        $data['status'] = $data['status'] ?? 'planned';

        $training = Training::query()->create($data);

        return $this->success(
            new TrainingResource($training->load('creator')),
            'Formação criada com sucesso.',
            201,
        );
    }

    public function show(Training $training): JsonResponse
    {
        $this->authorize('view', $training);

        return $this->success(new TrainingResource(
            $training->load(['creator', 'assignments.employee', 'assignments.completer'])
        ));
    }

    public function update(Request $request, Training $training): JsonResponse
    {
        $this->authorize('update', $training);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'category' => ['nullable', 'in:'.implode(',', array_keys(Training::CATEGORIES))],
            'duration_hours' => ['nullable', 'integer', 'min:0'],
            'provider' => ['nullable', 'string', 'max:255'],
            'location' => ['nullable', 'string', 'max:255'],
            'cost' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
            'max_participants' => ['nullable', 'integer', 'min:1'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'in:'.implode(',', array_keys(Training::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $training->update($data);

        return $this->success(
            new TrainingResource($training->fresh()->load('creator')),
            'Formação atualizada com sucesso.'
        );
    }

    public function destroy(Training $training): JsonResponse
    {
        $this->authorize('delete', $training);

        $training->delete();

        return $this->success(null, 'Formação removida com sucesso.');
    }

    public function enroll(Request $request, Training $training): JsonResponse
    {
        $this->authorize('create', TrainingAssignment::class);

        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
        ]);

        $existing = TrainingAssignment::query()
            ->where('training_id', $training->id)
            ->where('employee_id', $data['employee_id'])
            ->first();

        if ($existing) {
            return $this->error('Funcionário já inscrito nesta formação.', 422);
        }

        if ($training->max_participants) {
            $current = $training->assignments()->count();
            if ($current >= $training->max_participants) {
                return $this->error('Formação sem vagas disponíveis.', 422);
            }
        }

        $assignment = TrainingAssignment::query()->create([
            'tenant_id' => $training->tenant_id,
            'training_id' => $training->id,
            'employee_id' => $data['employee_id'],
            'status' => 'enrolled',
            'enrolled_at' => now(),
        ]);

        return $this->success(
            new TrainingAssignmentResource($assignment->load('employee')),
            'Funcionário inscrito com sucesso.',
            201,
        );
    }

    public function complete(Request $request, TrainingAssignment $assignment): JsonResponse
    {
        $this->authorize('update', $assignment);

        $data = $request->validate([
            'score' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $assignment->update([
            'status' => 'completed',
            'completed_at' => now(),
            'completed_by' => $request->user()->id,
            'score' => $data['score'] ?? $assignment->score,
            'notes' => $data['notes'] ?? $assignment->notes,
        ]);

        return $this->success(
            new TrainingAssignmentResource($assignment->fresh()->load('employee', 'training', 'completer')),
            'Formação concluída.'
        );
    }
}
