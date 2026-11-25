<?php

namespace App\Http\Controllers\Api\V1\Organization;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Organization\StoreDepartmentRequest;
use App\Http\Requests\V1\Organization\UpdateDepartmentRequest;
use App\Http\Resources\V1\DepartmentResource;
use App\Models\Department;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DepartmentController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Department::class);

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();

        $departments = Department::query()
            ->with([
                'branch:id,name',
                'manager:id,first_name,last_name',
                'parent:id,name,level',
                'permissionGroup:id,name,permissions',
            ])
            ->withCount('employees')
            ->when($allowedDeptIds !== null, fn ($q) => $q->whereIn('id', $allowedDeptIds))
            ->when($request->boolean('tree'), fn ($q) => $q->whereNull('parent_id'))
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', '%'.$request->string('search').'%'))
            ->orderBy('level')
            ->orderBy('name')
            ->get();

        if ($request->boolean('tree')) {
            $departments->load(['children.permissionGroup:id,name,permissions']);
        }

        return $this->success(DepartmentResource::collection($departments));
    }

    public function store(StoreDepartmentRequest $request): JsonResponse
    {
        $this->authorize('create', Department::class);

        $validated = $request->validated();
        $validated['level'] = $validated['level'] ?? 1;

        $department = Department::query()->create($validated);
        $department->load([
            'branch:id,name',
            'manager:id,first_name,last_name',
            'parent:id,name,level',
            'permissionGroup:id,name,permissions',
        ])->loadCount('employees');

        return $this->success(new DepartmentResource($department), 'Departamento criado com sucesso.', 201);
    }

    public function show(Department $department): JsonResponse
    {
        $this->authorize('view', $department);

        $department->load([
            'branch:id,name',
            'manager:id,first_name,last_name',
            'parent:id,name,level',
            'permissionGroup:id,name,permissions',
            'children',
        ])->loadCount('employees');

        return $this->success(new DepartmentResource($department));
    }

    public function update(UpdateDepartmentRequest $request, Department $department): JsonResponse
    {
        $this->authorize('update', $department);

        $validated = $request->validated();
        $cascadeLevels = (bool) ($validated['cascade_levels'] ?? false);
        unset($validated['cascade_levels']);

        if (array_key_exists('parent_id', $validated) && $validated['parent_id'] !== null) {
            $parentId = (int) $validated['parent_id'];
            if ($this->createsHierarchyCycle($department->id, $parentId)) {
                return $this->error('Não é possível definir um departamento subordinado como superior.', 422);
            }
        }

        if ($cascadeLevels && (! array_key_exists('level', $validated) || $validated['level'] === null)) {
            if (array_key_exists('parent_id', $validated)) {
                if ($validated['parent_id'] !== null) {
                    $parentLevel = (int) Department::query()->whereKey($validated['parent_id'])->value('level');
                    $validated['level'] = min(20, ($parentLevel ?: 1) + 1);
                } else {
                    $validated['level'] = 1;
                }
            }
        }

        if (array_key_exists('level', $validated) && $validated['level'] === null) {
            $validated['level'] = $department->level ?? 1;
        }

        DB::transaction(function () use ($department, $validated, $cascadeLevels): void {
            $department->update($validated);
            if ($cascadeLevels) {
                $this->cascadeDescendantLevels($department->id, (int) ($department->level ?? 1));
            }
        });

        $fresh = $department->fresh([
            'branch:id,name',
            'manager:id,first_name,last_name',
            'parent:id,name,level',
            'permissionGroup:id,name,permissions',
        ]);
        $fresh->loadCount('employees');

        return $this->success(new DepartmentResource($fresh), 'Departamento atualizado com sucesso.');
    }

    public function destroy(Department $department): JsonResponse
    {
        $this->authorize('delete', $department);

        Department::query()
            ->where('parent_id', $department->id)
            ->update(['parent_id' => $department->parent_id]);

        $department->delete();

        return $this->success(null, 'Departamento eliminado com sucesso.');
    }

    private function createsHierarchyCycle(int $departmentId, int $proposedParentId): bool
    {
        if ($proposedParentId === $departmentId) {
            return true;
        }

        $visited = [$departmentId => true];
        $cursorId = $proposedParentId;

        while ($cursorId !== null) {
            if ($cursorId === $departmentId) {
                return true;
            }
            if (isset($visited[$cursorId])) {
                return true;
            }
            $visited[$cursorId] = true;

            $parentId = Department::query()->whereKey($cursorId)->value('parent_id');
            $cursorId = $parentId !== null ? (int) $parentId : null;
        }

        return false;
    }

    private function cascadeDescendantLevels(int $rootId, int $rootLevel): void
    {
        $queue = [[$rootId, $rootLevel]];
        $visited = [$rootId => true];

        while ($queue !== []) {
            [$parentId, $parentLevel] = array_shift($queue);

            $children = Department::query()
                ->where('parent_id', $parentId)
                ->get(['id', 'level']);

            foreach ($children as $child) {
                if (isset($visited[$child->id])) {
                    continue;
                }
                $visited[$child->id] = true;

                $targetLevel = min(20, $parentLevel + 1);
                if ((int) ($child->level ?? 1) !== $targetLevel) {
                    $child->update(['level' => $targetLevel]);
                }

                $queue[] = [(int) $child->id, $targetLevel];
            }
        }
    }
}
