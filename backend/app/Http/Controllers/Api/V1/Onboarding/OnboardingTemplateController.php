<?php

namespace App\Http\Controllers\Api\V1\Onboarding;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\OnboardingTemplateResource;
use App\Models\OnboardingTask;
use App\Models\OnboardingTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OnboardingTemplateController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', OnboardingTemplate::class);

        $templates = OnboardingTemplate::query()
            ->withCount('tasks')
            ->with('creator:id,name')
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', "%{$request->string('search')}%"))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy($request->string('sort_by', 'name'), $request->string('sort_dir', 'asc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(OnboardingTemplateResource::collection($templates));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', OnboardingTemplate::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'is_active' => ['boolean'],
            'tasks' => ['array'],
            'tasks.*.title' => ['required', 'string', 'max:255'],
            'tasks.*.description' => ['nullable', 'string', 'max:5000'],
            'tasks.*.due_days' => ['nullable', 'integer', 'min:0'],
            'tasks.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['created_by'] = $request->user()->id;
        $data['is_active'] = $data['is_active'] ?? true;

        $template = OnboardingTemplate::query()->create($data);

        foreach (($data['tasks'] ?? []) as $i => $task) {
            OnboardingTask::query()->create([
                'tenant_id' => $template->tenant_id,
                'template_id' => $template->id,
                'title' => $task['title'],
                'description' => $task['description'] ?? null,
                'due_days' => $task['due_days'] ?? 7,
                'sort_order' => $task['sort_order'] ?? $i,
                'status' => 'pending',
            ]);
        }

        return $this->success(
            new OnboardingTemplateResource($template->load('tasks', 'creator')),
            'Template criado com sucesso.',
            201,
        );
    }

    public function show(OnboardingTemplate $template): JsonResponse
    {
        $this->authorize('view', $template);

        return $this->success(
            new OnboardingTemplateResource($template->load('tasks', 'creator'))
        );
    }

    public function update(Request $request, OnboardingTemplate $template): JsonResponse
    {
        $this->authorize('update', $template);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'is_active' => ['boolean'],
        ]);

        $template->update($data);

        return $this->success(
            new OnboardingTemplateResource($template->fresh()->load('tasks', 'creator')),
            'Template atualizado com sucesso.'
        );
    }

    public function destroy(OnboardingTemplate $template): JsonResponse
    {
        $this->authorize('delete', $template);

        $template->delete();

        return $this->success(null, 'Template removido com sucesso.');
    }

    public function assign(Request $request, OnboardingTemplate $template): JsonResponse
    {
        $this->authorize('update', $template);

        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
        ]);

        $created = 0;
        foreach ($template->tasks as $task) {
            OnboardingTask::query()->create([
                'tenant_id' => $template->tenant_id,
                'template_id' => $template->id,
                'employee_id' => $data['employee_id'],
                'title' => $task->title,
                'description' => $task->description,
                'due_days' => $task->due_days,
                'sort_order' => $task->sort_order,
                'status' => 'pending',
            ]);
            $created++;
        }

        return $this->success(
            ['assigned' => $created],
            "{$created} tarefas atribuídas ao funcionário."
        );
    }
}
