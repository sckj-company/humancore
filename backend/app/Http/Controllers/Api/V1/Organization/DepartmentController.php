<?php

namespace App\Http\Controllers\Api\V1\Organization;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Organization\StoreDepartmentRequest;
use App\Http\Requests\V1\Organization\UpdateDepartmentRequest;
use App\Http\Resources\V1\DepartmentResource;
use App\Models\Department;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Department::class);

        $departments = Department::query()
            ->withCount('employees')
            ->when($request->boolean('tree'), fn ($q) => $q->whereNull('parent_id'))
            ->when($request->filled('search'), fn ($q) => $q->where('name', 'like', '%'.$request->string('search').'%'))
            ->orderBy('name')
            ->get();

        if ($request->boolean('tree')) {
            $departments->load('children');
        }

        return $this->success(DepartmentResource::collection($departments));
    }

    public function store(StoreDepartmentRequest $request): JsonResponse
    {
        $this->authorize('create', Department::class);

        $department = Department::query()->create($request->validated());

        return $this->success(new DepartmentResource($department), 'Departamento criado com sucesso.', 201);
    }

    public function show(Department $department): JsonResponse
    {
        $this->authorize('view', $department);

        return $this->success(new DepartmentResource($department->load('manager', 'children')));
    }

    public function update(UpdateDepartmentRequest $request, Department $department): JsonResponse
    {
        $this->authorize('update', $department);

        $department->update($request->validated());

        return $this->success(new DepartmentResource($department->fresh()), 'Departamento atualizado com sucesso.');
    }

    public function destroy(Department $department): JsonResponse
    {
        $this->authorize('delete', $department);

        $department->delete();

        return $this->success(null, 'Departamento eliminado com sucesso.');
    }
}
