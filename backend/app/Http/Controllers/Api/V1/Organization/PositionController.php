<?php

namespace App\Http\Controllers\Api\V1\Organization;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Organization\StorePositionRequest;
use App\Http\Requests\V1\Organization\UpdatePositionRequest;
use App\Http\Resources\V1\PositionResource;
use App\Models\Employee;
use App\Models\Position;
use App\Models\User;
use App\Services\Audit\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PositionController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Position::class);

        $positions = Position::query()
            ->with(['department:id,name', 'parent:id,title,level'])
            ->withCount('employees')
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->integer('department_id')))
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%'.$request->string('search').'%'))
            ->orderBy('level')
            ->orderBy('title')
            ->get();

        return $this->success(PositionResource::collection($positions));
    }

    public function store(StorePositionRequest $request): JsonResponse
    {
        $this->authorize('create', Position::class);

        $validated = $request->validated();
        $validated['level'] = $validated['level'] ?? 1;

        $position = Position::query()->create($validated);
        $position->load(['department:id,name', 'parent:id,title,level'])->loadCount('employees');

        return $this->success(new PositionResource($position), 'Cargo criado com sucesso.', 201);
    }

    public function show(Position $position): JsonResponse
    {
        $this->authorize('view', $position);

        $position->load(['department:id,name', 'parent:id,title,level'])->loadCount('employees');

        return $this->success(new PositionResource($position));
    }

    public function update(UpdatePositionRequest $request, Position $position): JsonResponse
    {
        $this->authorize('update', $position);

        $validated = $request->validated();

        if (array_key_exists('parent_id', $validated) && $validated['parent_id'] !== null) {
            $parentId = (int) $validated['parent_id'];
            if ($this->createsHierarchyCycle($position->id, $parentId)) {
                return $this->error('Não é possível definir um cargo subordinado como superior.', 422);
            }
        }

        if (array_key_exists('level', $validated) && $validated['level'] === null) {
            $validated['level'] = $position->level ?? 1;
        }

        $position->update($validated);
        $fresh = $position->fresh(['department:id,name', 'parent:id,title,level']);
        $fresh->loadCount('employees');

        return $this->success(new PositionResource($fresh), 'Cargo atualizado com sucesso.');
    }

    public function destroy(Position $position): JsonResponse
    {
        $this->authorize('delete', $position);

        Position::query()
            ->where('parent_id', $position->id)
            ->update(['parent_id' => $position->parent_id]);

        $position->delete();

        return $this->success(null, 'Cargo eliminado com sucesso.');
    }

    public function employees(Request $request, Position $position): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if (! $this->canManagePositionEmployees($user)) {
            $this->authorize('view', $position);
        }

        $allowedDeptIds = $user->allowedDepartmentIds();
        if ($allowedDeptIds !== null && $position->department_id && ! in_array((int) $position->department_id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para aceder aos funcionários deste cargo.');
        }

        $position->load(['department:id,name', 'parent:id,title,level'])->loadCount('employees');

        $search = trim((string) $request->input('search', ''));

        $employees = Employee::query()
            ->where('position_id', $position->id)
            ->when($allowedDeptIds !== null, function ($q) use ($allowedDeptIds): void {
                $q->where(function ($sub) use ($allowedDeptIds): void {
                    $sub->whereIn('department_id', $allowedDeptIds)
                        ->orWhereHas('departments', fn ($dq) => $dq->whereIn('departments.id', $allowedDeptIds));
                });
            })
            ->with(['department:id,name', 'departments:id,name'])
            ->when($search !== '', function ($q) use ($search): void {
                $q->where(function ($sub) use ($search): void {
                    $sub->where('first_name', 'like', "%{$search}%")
                        ->orWhere('last_name', 'like', "%{$search}%")
                        ->orWhere('employee_code', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%");
                });
            })
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get()
            ->map(fn (Employee $emp): array => [
                'id' => $emp->id,
                'employee_code' => $emp->employee_code,
                'full_name' => $emp->full_name,
                'email' => $emp->email,
                'photo_path' => $emp->photo_path,
                'status' => $emp->status,
                'department_id' => $emp->department_id,
                'department' => $emp->department ? [
                    'id' => $emp->department->id,
                    'name' => $emp->department->name,
                ] : null,
                'departments' => $emp->resolvedDepartmentsPayload(),
            ])
            ->values();

        return $this->success([
            'position' => new PositionResource($position),
            'employees' => $employees,
            'can_manage_employees' => $this->canManagePositionEmployees($user),
        ]);
    }

    public function addEmployees(Request $request, Position $position): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if (! $this->canManagePositionEmployees($user)) {
            abort(403, 'Sem permissão para atribuir funcionários a cargos.');
        }

        $data = $request->validate([
            'employee_ids' => ['required', 'array', 'min:1'],
            'employee_ids.*' => ['integer'],
            'sync_department' => ['sometimes', 'boolean'],
        ]);

        $syncDepartment = (bool) ($data['sync_department'] ?? false);
        $allowedDeptIds = $user->allowedDepartmentIds();

        if ($allowedDeptIds !== null) {
            if ($position->department_id && ! in_array((int) $position->department_id, $allowedDeptIds, true)) {
                abort(403, 'Sem permissão para atribuir funcionários a este cargo.');
            }
        }

        $employeeIds = array_values(array_unique(array_map('intval', $data['employee_ids'])));
        $employees = Employee::query()->whereIn('id', $employeeIds)->get();

        if ($employees->count() !== count($employeeIds)) {
            return $this->error('Um ou mais funcionários não pertencem à empresa ativa.', 422);
        }

        if ($allowedDeptIds !== null) {
            $outside = $employees->contains(
                fn (Employee $emp) => $emp->department_id !== null && ! in_array((int) $emp->department_id, $allowedDeptIds, true),
            );
            if ($outside) {
                abort(403, 'Sem permissão para alterar funcionários fora dos departamentos atribuídos.');
            }
        }

        DB::transaction(function () use ($employees, $position, $syncDepartment): void {
            foreach ($employees as $emp) {
                $emp->update(['position_id' => $position->id]);
                if ($syncDepartment && $position->department_id) {
                    $emp->attachDepartment((int) $position->department_id);
                }
            }
        });

        $fresh = $position->fresh(['department:id,name', 'parent:id,title,level']);
        $fresh->loadCount('employees');

        AuditService::record('position_employees_added', $fresh, [
            'employee_ids' => $employeeIds,
            'sync_department' => $syncDepartment,
        ]);

        return $this->success([
            'added_count' => $employees->count(),
            'position' => new PositionResource($fresh),
        ], 'Funcionários adicionados ao cargo com sucesso.');
    }

    public function removeEmployee(Request $request, Position $position, Employee $employee): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if (! $this->canManagePositionEmployees($user)) {
            abort(403, 'Sem permissão para remover funcionários de cargos.');
        }

        $allowedDeptIds = $user->allowedDepartmentIds();
        if ($allowedDeptIds !== null) {
            $canTouch = collect($allowedDeptIds)->contains(fn (int $deptId) => $employee->belongsToDepartment($deptId));
            if (! $canTouch && $employee->department_id !== null) {
                abort(403, 'Sem permissão para alterar funcionários fora dos departamentos atribuídos.');
            }
        }

        if ((int) $employee->position_id !== (int) $position->id) {
            return $this->error('Este funcionário não ocupa o cargo selecionado.', 422);
        }

        $employee->update(['position_id' => null]);

        $fresh = $position->fresh(['department:id,name', 'parent:id,title,level']);
        $fresh->loadCount('employees');

        AuditService::record('position_employee_removed', $fresh, [
            'employee_id' => $employee->id,
        ]);

        return $this->success([
            'position' => new PositionResource($fresh),
        ], 'Funcionário removido do cargo com sucesso.');
    }

    private function canManagePositionEmployees(User $user): bool
    {
        return $user->hasRole('super-admin')
            || $user->hasRole('admin')
            || $user->can('update_position')
            || $user->can('update_employee');
    }

    private function createsHierarchyCycle(int $positionId, int $proposedParentId): bool
    {
        if ($proposedParentId === $positionId) {
            return true;
        }

        $visited = [$positionId => true];
        $cursorId = $proposedParentId;

        while ($cursorId !== null) {
            if ($cursorId === $positionId) {
                return true;
            }
            if (isset($visited[$cursorId])) {
                return true;
            }
            $visited[$cursorId] = true;

            $parentId = Position::query()->whereKey($cursorId)->value('parent_id');
            $cursorId = $parentId !== null ? (int) $parentId : null;
        }

        return false;
    }
}
