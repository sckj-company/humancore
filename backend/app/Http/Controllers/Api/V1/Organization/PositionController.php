<?php

namespace App\Http\Controllers\Api\V1\Organization;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Organization\StorePositionRequest;
use App\Http\Requests\V1\Organization\UpdatePositionRequest;
use App\Http\Resources\V1\PositionResource;
use App\Models\Department;
use App\Models\Employee;
use App\Models\PermissionGroup;
use App\Models\Position;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Services\Audit\AuditService;
use App\Services\SaaS\PlanEntitlementService;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class PositionController extends BaseController
{
    public function __construct(
        private readonly TenantManager $tenantManager,
        private readonly PlanEntitlementService $entitlementService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Position::class);

        $positions = Position::query()
            ->with(['department:id,name', 'parent:id,title,level', 'permissionGroup:id,name,permissions'])
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
        $position->load(['department:id,name', 'parent:id,title,level', 'permissionGroup:id,name,permissions'])->loadCount('employees');

        return $this->success(new PositionResource($position), 'Cargo criado com sucesso.', 201);
    }

    public function show(Position $position): JsonResponse
    {
        $this->authorize('view', $position);

        $position->load(['department:id,name', 'parent:id,title,level', 'permissionGroup:id,name,permissions'])->loadCount('employees');

        return $this->success(new PositionResource($position));
    }

    public function update(UpdatePositionRequest $request, Position $position): JsonResponse
    {
        $this->authorize('update', $position);

        $validated = $request->validated();
        $cascadeLevels = (bool) ($validated['cascade_levels'] ?? false);
        unset($validated['cascade_levels']);

        if (array_key_exists('parent_id', $validated) && $validated['parent_id'] !== null) {
            $parentId = (int) $validated['parent_id'];
            if ($this->createsHierarchyCycle($position->id, $parentId)) {
                return $this->error('Não é possível definir um cargo subordinado como superior.', 422);
            }
        }

        if ($cascadeLevels && (! array_key_exists('level', $validated) || $validated['level'] === null)) {
            if (array_key_exists('parent_id', $validated)) {
                if ($validated['parent_id'] !== null) {
                    $parentLevel = (int) Position::query()->whereKey($validated['parent_id'])->value('level');
                    $validated['level'] = min(20, ($parentLevel ?: 1) + 1);
                } else {
                    $validated['level'] = 1;
                }
            }
        }

        if (array_key_exists('level', $validated) && $validated['level'] === null) {
            $validated['level'] = $position->level ?? 1;
        }

        DB::transaction(function () use ($position, $validated, $cascadeLevels): void {
            $position->update($validated);
            if ($cascadeLevels) {
                $this->cascadeDescendantLevels($position->id, (int) ($position->level ?? 1));
            }
        });

        $fresh = $position->fresh(['department:id,name', 'parent:id,title,level', 'permissionGroup:id,name,permissions']);
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

        if (! $this->canManagePermissions($user) && ! $this->canManagePositionEmployees($user)) {
            $this->authorize('view', $position);
        }

        $allowedDeptIds = $user->allowedDepartmentIds();
        if ($allowedDeptIds !== null && $position->department_id && ! in_array((int) $position->department_id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para aceder aos funcionários deste cargo.');
        }

        $tenant = $this->tenantManager->requireTenant();

        $position->load([
            'department:id,name',
            'parent:id,title,level',
            'permissionGroup:id,name,permissions',
        ])->loadCount('employees');

        $search = trim((string) $request->input('search', ''));

        $employees = Employee::query()
            ->where('position_id', $position->id)
            ->when($allowedDeptIds !== null, function ($q) use ($allowedDeptIds): void {
                $q->where(function ($sub) use ($allowedDeptIds): void {
                    $sub->whereIn('department_id', $allowedDeptIds)
                        ->orWhereHas('departments', fn ($dq) => $dq->whereIn('departments.id', $allowedDeptIds));
                });
            })
            ->with([
                'department:id,name',
                'departments:id,name,permission_group_id,default_permissions',
            ])
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
            ->get();

        $empIds = $employees->pluck('id')->all();
        $userIds = $employees->pluck('user_id')->filter()->unique()->values()->all();

        $users = collect();
        if ($empIds !== [] || $userIds !== []) {
            $users = User::query()
                ->where(function ($q) use ($empIds, $userIds): void {
                    if ($empIds !== []) {
                        $q->whereIn('employee_id', $empIds);
                    }
                    if ($userIds !== []) {
                        $q->orWhereIn('id', $userIds);
                    }
                })
                ->with([
                    'roles:id,name',
                    'tenantAccesses' => fn ($q) => $q->where('tenant_id', $tenant->id)->with('permissionGroup:id,name,permissions'),
                ])
                ->get();
        }

        $usersById = $users->keyBy('id');
        $usersByEmployeeId = $users
            ->filter(fn (User $u) => $u->employee_id !== null)
            ->sortByDesc(fn (User $u) => (int) $u->tenant_id === (int) $tenant->id ? 1 : 0)
            ->keyBy('employee_id');

        $rows = $employees->map(function (Employee $emp) use ($usersById, $usersByEmployeeId, $tenant, $position): array {
            /** @var User|null $linkedUser */
            $linkedUser = $emp->user_id ? $usersById->get($emp->user_id) : null;
            if (! $linkedUser) {
                $linkedUser = $usersByEmployeeId->get($emp->id);
            }

            $departmentsPayload = $emp->resolvedDepartmentsPayload();
            $base = [
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
                'departments' => $departmentsPayload,
            ];

            if (! $linkedUser) {
                return [
                    ...$base,
                    'has_user_account' => false,
                    'user_id' => null,
                    'user_email' => null,
                    'user_is_active' => false,
                    'role_name' => null,
                    'permission_source' => 'none',
                    'permission_group_id' => null,
                    'permission_group_name' => null,
                    'effective_permissions' => [],
                    'custom_permissions' => null,
                    'department_scope_ids' => [],
                ];
            }

            $access = $linkedUser->activeTenantAccess($tenant->id);
            $hasIndividual = $access !== null && $access->hasExplicitPermissions();
            $isPrivilegedRole = $linkedUser->hasRole('super-admin') || $linkedUser->hasRole('admin');
            $hasConfiguredPosPermissions = $position->hasConfiguredPermissions();
            $hasConfiguredDeptPermissions = $emp->departments->contains(fn (Department $d) => $d->hasConfiguredPermissions());

            $source = match (true) {
                $hasIndividual => 'individual',
                ! $isPrivilegedRole && $hasConfiguredDeptPermissions && $hasConfiguredPosPermissions => 'department_and_position',
                ! $isPrivilegedRole && $hasConfiguredPosPermissions => 'position',
                ! $isPrivilegedRole && $hasConfiguredDeptPermissions => 'department',
                default => 'role',
            };

            return [
                ...$base,
                'has_user_account' => true,
                'user_id' => $linkedUser->id,
                'user_email' => $linkedUser->email,
                'user_is_active' => (bool) $linkedUser->is_active,
                'role_name' => $access?->role_name ?? $linkedUser->roles->first()?->name,
                'permission_source' => $source,
                'permission_group_id' => $access?->permission_group_id,
                'permission_group_name' => $access?->permissionGroup?->name,
                'effective_permissions' => $linkedUser->effectivePermissions($tenant->id)->values()->all(),
                'custom_permissions' => $access?->permissions,
                'department_scope_ids' => array_values(array_map('intval', $access?->department_ids ?? [])),
            ];
        })->values();

        return $this->success([
            'position' => new PositionResource($position),
            'employees' => $rows,
            'can_manage_permissions' => $this->canManagePermissions($user),
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

        User::clearDepartmentPermissionCache();

        $fresh = $position->fresh(['department:id,name', 'parent:id,title,level', 'permissionGroup:id,name,permissions']);
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
        User::clearDepartmentPermissionCache();

        $fresh = $position->fresh(['department:id,name', 'parent:id,title,level', 'permissionGroup:id,name,permissions']);
        $fresh->loadCount('employees');

        AuditService::record('position_employee_removed', $fresh, [
            'employee_id' => $employee->id,
        ]);

        return $this->success([
            'position' => new PositionResource($fresh),
        ], 'Funcionário removido do cargo com sucesso.');
    }

    public function updatePositionPermissions(Request $request, Position $position): JsonResponse
    {
        $this->authorizePermissionManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();
        if ($allowedDeptIds !== null && $position->department_id && ! in_array((int) $position->department_id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para gerir este cargo.');
        }

        $data = $request->validate([
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'permission_group_id' => [
                'nullable',
                'integer',
                Rule::exists('permission_groups', 'id')->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenant->id)),
            ],
            'role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'apply_to_existing_overrides' => ['sometimes', 'boolean'],
        ]);

        if (isset($data['permissions']) && array_intersect($data['permissions'], User::PLATFORM_ONLY_PERMISSIONS)) {
            return $this->error('Não é possível atribuir permissões globais da plataforma.', 403);
        }

        if (! empty($data['permission_group_id'])) {
            $group = PermissionGroup::query()->find($data['permission_group_id']);
            if ($group && array_intersect($group->permissions ?? [], User::PLATFORM_ONLY_PERMISSIONS)) {
                return $this->error('O grupo selecionado contém permissões globais não permitidas.', 403);
            }
        }

        $applyToOverrides = (bool) ($data['apply_to_existing_overrides'] ?? false);
        $cleanPermissions = empty($data['permissions'])
            ? null
            : array_values(array_unique(array_map('strval', $data['permissions'])));

        $affectedEmployeesCount = DB::transaction(function () use ($position, $tenant, $data, $cleanPermissions, $applyToOverrides): int {
            $position->update([
                'permission_group_id' => $data['permission_group_id'] ?? null,
                'default_permissions' => $cleanPermissions,
                'default_role_name' => $data['role_name'] ?? null,
            ]);

            $posEmployees = Employee::query()
                ->where('position_id', $position->id)
                ->get(['id', 'user_id']);

            $empIds = $posEmployees->pluck('id')->all();
            $userIds = $posEmployees->pluck('user_id')->filter()->unique()->values()->all();

            if ($empIds === [] && $userIds === []) {
                return 0;
            }

            $users = User::query()
                ->where(function ($q) use ($empIds, $userIds): void {
                    if ($empIds !== []) {
                        $q->whereIn('employee_id', $empIds);
                    }
                    if ($userIds !== []) {
                        $q->orWhereIn('id', $userIds);
                    }
                })
                ->with([
                    'roles:id,name',
                    'tenantAccesses' => fn ($q) => $q->where('tenant_id', $tenant->id),
                ])
                ->get();

            $affected = 0;

            foreach ($users as $posUser) {
                if ($posUser->isSuperAdmin() || $posUser->hasRole('admin')) {
                    continue;
                }

                $access = $posUser->tenantAccesses->first();
                if ($applyToOverrides && $access) {
                    if ((int) $posUser->tenant_id === (int) $tenant->id && empty($access->department_ids)) {
                        $access->delete();
                    } else {
                        $access->update([
                            'permission_group_id' => null,
                            'permissions' => null,
                        ]);
                    }
                    $affected++;
                } elseif (! $access || ! $access->hasExplicitPermissions()) {
                    $affected++;
                }
            }

            return $affected;
        });

        User::clearDepartmentPermissionCache();

        $fresh = $position->fresh(['department:id,name', 'parent:id,title,level', 'permissionGroup:id,name,permissions']);
        $fresh->loadCount('employees');

        AuditService::record('position_permissions_updated', $fresh, [
            'permission_group_id' => $fresh->permission_group_id,
            'default_permissions_count' => count($fresh->default_permissions ?? []),
            'default_role_name' => $fresh->default_role_name,
            'apply_to_existing_overrides' => $applyToOverrides,
            'affected_employees_count' => $affectedEmployeesCount,
        ]);

        return $this->success([
            'position' => new PositionResource($fresh),
            'affected_employees_count' => $affectedEmployeesCount,
        ], 'Permissões do cargo atualizadas com sucesso.');
    }

    public function assignEmployeePermissions(Request $request, Position $position): JsonResponse
    {
        $this->authorizePermissionManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();
        if ($allowedDeptIds !== null && $position->department_id && ! in_array((int) $position->department_id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para gerir este cargo.');
        }

        $data = $request->validate([
            'employee_ids' => ['required', 'array', 'min:1'],
            'employee_ids.*' => ['integer'],
            'clear_individual' => ['sometimes', 'boolean'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'permission_group_id' => [
                'nullable',
                'integer',
                Rule::exists('permission_groups', 'id')->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenant->id)),
            ],
            'role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'scope_to_department' => ['sometimes', 'boolean'],
            'auto_create_accounts' => ['sometimes', 'boolean'],
            'default_password' => ['nullable', 'string', 'min:8'],
            'employee_emails' => ['nullable', 'array'],
            'employee_emails.*' => ['nullable', 'email', 'max:255'],
        ]);

        if (isset($data['permissions']) && array_intersect($data['permissions'], User::PLATFORM_ONLY_PERMISSIONS)) {
            return $this->error('Não é possível atribuir permissões globais da plataforma.', 403);
        }

        if (! empty($data['permission_group_id'])) {
            $group = PermissionGroup::query()->find($data['permission_group_id']);
            if ($group && array_intersect($group->permissions ?? [], User::PLATFORM_ONLY_PERMISSIONS)) {
                return $this->error('O grupo selecionado contém permissões globais não permitidas.', 403);
            }
        }

        $employeeIds = array_values(array_unique(array_map('intval', $data['employee_ids'])));
        $employees = Employee::query()
            ->where('position_id', $position->id)
            ->whereIn('id', $employeeIds)
            ->with('departments:id')
            ->get();

        if ($employees->count() !== count($employeeIds)) {
            return $this->error('Um ou mais funcionários selecionados não ocupam este cargo.', 422);
        }

        $clearIndividual = (bool) ($data['clear_individual'] ?? false);
        $scopeToDepartment = (bool) ($data['scope_to_department'] ?? false);
        $autoCreateAccounts = (bool) ($data['auto_create_accounts'] ?? false);
        $defaultPassword = $data['default_password'] ?? null;
        $employeeEmails = is_array($data['employee_emails'] ?? null) ? $data['employee_emails'] : [];
        $roleName = $data['role_name'] ?? null;
        $cleanPermissions = empty($data['permissions'])
            ? null
            : array_values(array_unique(array_map('strval', $data['permissions'])));

        if (! $clearIndividual && $autoCreateAccounts && empty($defaultPassword)) {
            $missingUserExists = $employees->contains(function (Employee $emp) use ($tenant): bool {
                return ! $this->resolveLinkedUser($emp, $tenant->id);
            });
            if ($missingUserExists) {
                return $this->error('Indique uma palavra-passe inicial (mínimo 8 caracteres) para criar contas automaticamente.', 422);
            }
        }

        $updatedCount = 0;
        $createdAccountsCount = 0;
        $skipped = [];

        DB::transaction(function () use (
            $employees,
            $tenant,
            $position,
            $clearIndividual,
            $scopeToDepartment,
            $autoCreateAccounts,
            $defaultPassword,
            $employeeEmails,
            $roleName,
            $data,
            $cleanPermissions,
            &$updatedCount,
            &$createdAccountsCount,
            &$skipped
        ): void {
            foreach ($employees as $emp) {
                $linkedUser = $this->resolveLinkedUser($emp, $tenant->id);

                if (! $linkedUser) {
                    if ($clearIndividual || ! $autoCreateAccounts) {
                        $skipped[] = [
                            'employee_id' => $emp->id,
                            'name' => $emp->full_name,
                            'reason' => 'Sem conta de acesso ao sistema.',
                        ];

                        continue;
                    }

                    $providedEmail = trim((string) ($employeeEmails[$emp->id] ?? $employeeEmails[(string) $emp->id] ?? ''));
                    $resolvedEmail = $providedEmail !== '' ? $providedEmail : trim((string) ($emp->email ?? ''));

                    if ($resolvedEmail === '') {
                        $skipped[] = [
                            'employee_id' => $emp->id,
                            'name' => $emp->full_name,
                            'reason' => 'Funcionário sem email registado para criar conta.',
                        ];

                        continue;
                    }

                    $quota = $this->entitlementService->checkQuota($tenant, 'max_users', 1);
                    if (! $quota['allowed']) {
                        $skipped[] = [
                            'employee_id' => $emp->id,
                            'name' => $emp->full_name,
                            'reason' => $quota['message'] ?? 'Limite de utilizadores do plano atingido.',
                        ];

                        continue;
                    }

                    if (User::query()->where('email', $resolvedEmail)->exists()) {
                        $skipped[] = [
                            'employee_id' => $emp->id,
                            'name' => $emp->full_name,
                            'reason' => 'Email já associado a outro utilizador.',
                        ];

                        continue;
                    }

                    $assignedRole = $roleName ?? 'employee';
                    $linkedUser = User::query()->create([
                        'tenant_id' => $tenant->id,
                        'employee_id' => $emp->id,
                        'name' => $emp->full_name,
                        'email' => $resolvedEmail,
                        'password' => Hash::make((string) $defaultPassword),
                        'locale' => $tenant->locale ?? 'pt',
                        'timezone' => $tenant->timezone ?? 'Africa/Luanda',
                        'email_verified_at' => now(),
                        'is_active' => true,
                    ]);
                    $linkedUser->assignRole($assignedRole);
                    $empUpdates = ['user_id' => $linkedUser->id];
                    if (trim((string) ($emp->email ?? '')) === '') {
                        $empUpdates['email'] = $resolvedEmail;
                    }
                    $emp->update($empUpdates);
                    $createdAccountsCount++;
                }

                if ($linkedUser->isSuperAdmin()) {
                    $skipped[] = [
                        'employee_id' => $emp->id,
                        'name' => $emp->full_name,
                        'reason' => 'Utilizador de plataforma não pode ser alterado aqui.',
                    ];

                    continue;
                }

                if ($clearIndividual) {
                    $existingAccess = UserTenantAccess::query()
                        ->where('user_id', $linkedUser->id)
                        ->where('tenant_id', $tenant->id)
                        ->first();

                    if ($existingAccess) {
                        if ((int) $linkedUser->tenant_id === (int) $tenant->id) {
                            $existingAccess->delete();
                        } else {
                            $existingAccess->update([
                                'permission_group_id' => null,
                                'permissions' => null,
                                'department_ids' => null,
                            ]);
                        }
                    }

                    $updatedCount++;

                    continue;
                }

                $resolvedRole = $roleName ?? ($linkedUser->roles()->first()?->name ?: 'employee');
                if ($roleName && (int) $linkedUser->tenant_id === (int) $tenant->id) {
                    $linkedUser->syncRoles([$roleName]);
                }

                $empDeptIds = array_values(array_unique(array_filter(array_merge(
                    $emp->department_id ? [(int) $emp->department_id] : [],
                    $emp->departments->pluck('id')->map(fn ($id) => (int) $id)->all(),
                ))));

                $scopedDeptIds = null;
                if ($scopeToDepartment) {
                    $scopedDeptIds = $position->department_id
                        ? [(int) $position->department_id]
                        : ($empDeptIds !== [] ? $empDeptIds : null);
                }

                UserTenantAccess::query()->updateOrCreate(
                    ['user_id' => $linkedUser->id, 'tenant_id' => $tenant->id],
                    [
                        'permission_group_id' => $data['permission_group_id'] ?? null,
                        'role_name' => $resolvedRole,
                        'permissions' => $cleanPermissions,
                        'department_ids' => $scopedDeptIds,
                        'is_active' => true,
                    ],
                );

                $updatedCount++;
            }
        });

        if ($createdAccountsCount > 0) {
            $this->entitlementService->clearCacheForTenant($tenant->id);
        }

        User::clearDepartmentPermissionCache();

        AuditService::record('position_employees_permissions_updated', $position, [
            'employee_ids' => $employeeIds,
            'clear_individual' => $clearIndividual,
            'permission_group_id' => $data['permission_group_id'] ?? null,
            'permissions_count' => count($cleanPermissions ?? []),
            'role_name' => $roleName,
            'scope_to_department' => $scopeToDepartment,
            'updated_count' => $updatedCount,
            'created_accounts_count' => $createdAccountsCount,
        ]);

        return $this->success([
            'updated_count' => $updatedCount,
            'created_accounts_count' => $createdAccountsCount,
            'skipped' => $skipped,
        ], 'Permissões atribuídas aos funcionários com sucesso.');
    }

    private function resolveLinkedUser(Employee $employee, int $tenantId): ?User
    {
        if ($employee->user_id) {
            $byUserId = User::query()->find($employee->user_id);
            if ($byUserId) {
                return $byUserId;
            }
        }

        return User::query()
            ->where('employee_id', $employee->id)
            ->orderByRaw('CASE WHEN tenant_id = ? THEN 0 ELSE 1 END', [$tenantId])
            ->first();
    }

    private function canManagePermissions(User $user): bool
    {
        return $user->hasRole('super-admin')
            || $user->hasRole('admin')
            || $user->can('create_user')
            || $user->can('update_user');
    }

    private function authorizePermissionManagement(Request $request): void
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if (! $this->canManagePermissions($user)) {
            abort(403, 'Sem permissão para atribuir permissões na empresa.');
        }
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

    private function cascadeDescendantLevels(int $rootId, int $rootLevel): void
    {
        $queue = [[$rootId, $rootLevel]];
        $visited = [$rootId => true];

        while ($queue !== []) {
            [$parentId, $parentLevel] = array_shift($queue);

            $children = Position::query()
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
