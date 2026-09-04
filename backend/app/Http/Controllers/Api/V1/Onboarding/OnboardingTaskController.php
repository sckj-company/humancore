<?php

namespace App\Http\Controllers\Api\V1\Onboarding;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\OnboardingTaskResource;
use App\Models\OnboardingTask;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OnboardingTaskController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', OnboardingTask::class);

        $tasks = OnboardingTask::query()
            ->with(['employee:id,first_name,last_name,employee_code', 'assignee:id,name', 'completer:id,name'])
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', "%{$request->string('search')}%"))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->when($request->filled('template_id'), fn ($q) => $q->where('template_id', $request->integer('template_id')))
            ->orderBy($request->string('sort_by', 'due_date'), $request->string('sort_dir', 'asc'))
            ->paginate($request->integer('per_page', 20));

        return $this->paginated(OnboardingTaskResource::collection($tasks));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', OnboardingTask::class);

        $data = $request->validate([
            'template_id' => ['nullable', 'integer', 'exists:onboarding_templates,id'],
            'employee_id' => ['nullable', 'integer', 'exists:employees,id'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'due_days' => ['nullable', 'integer', 'min:0'],
            'due_date' => ['nullable', 'date'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['status'] = 'pending';

        $task = OnboardingTask::query()->create($data);

        return $this->success(
            new OnboardingTaskResource($task->load('employee', 'assignee')),
            'Tarefa criada com sucesso.',
            201,
        );
    }

    public function show(OnboardingTask $task): JsonResponse
    {
        $this->authorize('view', $task);

        return $this->success(new OnboardingTaskResource($task->load('employee', 'assignee', 'completer')));
    }

    public function update(Request $request, OnboardingTask $task): JsonResponse
    {
        $this->authorize('update', $task);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'due_days' => ['nullable', 'integer', 'min:0'],
            'due_date' => ['nullable', 'date'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'assignee_id' => ['nullable', 'integer', 'exists:users,id'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $task->update($data);

        return $this->success(
            new OnboardingTaskResource($task->fresh()->load('employee', 'assignee', 'completer')),
            'Tarefa atualizada.'
        );
    }

    public function destroy(OnboardingTask $task): JsonResponse
    {
        $this->authorize('delete', $task);

        $task->delete();

        return $this->success(null, 'Tarefa removida.');
    }

    public function complete(Request $request, OnboardingTask $task): JsonResponse
    {
        $this->authorize('update', $task);

        $task->update([
            'status' => 'completed',
            'completed_at' => now(),
            'completed_by' => $request->user()->id,
        ]);

        return $this->success(
            new OnboardingTaskResource($task->fresh()->load('employee', 'assignee', 'completer')),
            'Tarefa concluída.'
        );
    }
}
