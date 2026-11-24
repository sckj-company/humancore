<?php

namespace App\Http\Controllers\Api\V1\Organization;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\DepartmentResource;
use App\Models\Department;
use App\Models\Employee;
use App\Models\PermissionGroup;
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
use Spatie\Permission\Models\Permission;

class DepartmentPermissionController extends BaseController
{
    public function __construct(
        private readonly TenantManager $tenantManager,
        private readonly PlanEntitlementService $entitlementService,
    ) {}

    public function catalog(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if (! $this->canManagePermissions($user) && ! $user->can('viewAny', Department::class)) {
            abort(403, 'Sem permissão para consultar permissões da organização.');
        }

        $tenant = $this->tenantManager->requireTenant();

        $permissions = Permission::query()
            ->where('guard_name', 'web')
            ->whereNotIn('name', User::PLATFORM_ONLY_PERMISSIONS)
            ->orderBy('group_name')
            ->orderBy('name')
            ->get(['id', 'name', 'group_name']);

        $groups = PermissionGroup::query()
            ->where(function ($q) use ($tenant): void {
                $q->whereNull('tenant_id')->orWhere('tenant_id', $tenant->id);
            })
            ->orderBy('name')
            ->get(['id', 'tenant_id', 'name', 'description', 'permissions', 'is_system']);

        return $this->success([
            'permissions' => $permissions,
            'permission_groups' => $groups,
            'can_manage_permissions' => $this->canManagePermissions($user),
        ]);
    }

    public function employees(Request $request, Department $department): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if (! $this->canManagePermissions($user)) {
            $this->authorize('view', $department);
        }

        $allowedDeptIds = $user->allowedDepartmentIds();
        if ($allowedDeptIds !== null && ! in_array((int) $department->id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para aceder a este departamento.');
        }

        $tenant = $this->tenantManager->requireTenant();

        $department->load([
            'branch:id,name',
            'manager:id,first_name,last_name',
            'parent:id,name,level',
            'permissionGroup:id,name,permissions',
        ])->loadCount('employees');

        $search = trim((string) $request->input('search', ''));

        $employees = Employee::query()
            ->where(function ($q) use ($department): void {
                $q->where('department_id', $department->id)
                    ->orWhereHas('departments', fn ($dq) => $dq->where('departments.id', $department->id));
            })
            ->with([
                'position:id,title,level',
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

        $rows = $employees->map(function (Employee $emp) use ($usersById, $usersByEmployeeId, $tenant, $department): array {
            /** @var User|null $linkedUser */
            $linkedUser = $emp->user_id ? $usersById->get($emp->user_id) : null;
            if (! $linkedUser) {
                $linkedUser = $usersByEmployeeId->get($emp->id);
            }

            $departmentsPayload = $emp->resolvedDepartmentsPayload();

            if (! $linkedUser) {
                return [
                    'id' => $emp->id,
                    'employee_code' => $emp->employee_code,
                    'full_name' => $emp->full_name,
                    'email' => $emp->email,
                    'photo_path' => $emp->photo_path,
                    'status' => $emp->status,
                    'departments' => $departmentsPayload,
                    'position' => $emp->position ? [
                        'id' => $emp->position->id,
                        'title' => $emp->position->title,
                        'level' => (int) ($emp->position->level ?? 1),
                    ] : null,
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
            $hasConfiguredDeptPermissions = $department->hasConfiguredPermissions()
                || $emp->departments->contains(fn (Department $d) => $d->hasConfiguredPermissions());

            $source = match (true) {
                $hasIndividual => 'individual',
                ! $isPrivilegedRole && $hasConfiguredDeptPermissions => 'department',
                default => 'role',
            };

            return [
                'id' => $emp->id,
                'employee_code' => $emp->employee_code,
                'full_name' => $emp->full_name,
                'email' => $emp->email,
                'photo_path' => $emp->photo_path,
                'status' => $emp->status,
                'departments' => $departmentsPayload,
                'position' => $emp->position ? [
                    'id' => $emp->position->id,
                    'title' => $emp->position->title,
                    'level' => (int) ($emp->position->level ?? 1),
                ] : null,
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
            'department' => new DepartmentResource($department),
            'employees' => $rows,
            'can_manage_permissions' => $this->canManagePermissions($user),
            'can_manage_employees' => $this->canManageDepartmentEmployees($user),
        ]);
    }

    public function addEmployees(Request $request, Department $department): JsonResponse
    {
        $this->authorizeEmployeeMembership($request);

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();
        if ($allowedDeptIds !== null && ! in_array((int) $department->id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para adicionar funcionários a este departamento.');
        }

        $data = $request->validate([
            'employee_ids' => ['required', 'array', 'min:1'],
            'employee_ids.*' => ['integer'],
        ]);

        $employeeIds = array_values(array_unique(array_map('intval', $data['employee_ids'])));
        $employees = Employee::query()->whereIn('id', $employeeIds)->get();

        if ($employees->count() !== count($employeeIds)) {
            return $this->error('Um ou mais funcionários não pertencem à empresa ativa.', 422);
        }

        if ($allowedDeptIds !== null) {
            $outside = $employees->contains(function (Employee $emp) use ($allowedDeptIds): bool {
                $empDeptIds = $emp->departments()->pluck('departments.id')->map(fn ($id) => (int) $id)->all();
                if ($emp->department_id !== null) {
                    $empDeptIds[] = (int) $emp->department_id;
                }
                if ($empDeptIds === []) {
                    return false;
                }

                return collect($empDeptIds)->every(fn (int $id) => ! in_array($id, $allowedDeptIds, true));
            });
            if ($outside) {
                abort(403, 'Sem permissão para mover funcionários fora dos departamentos atribuídos.');
            }
        }

        DB::transaction(function () use ($employees, $department): void {
            foreach ($employees as $emp) {
                $emp->attachDepartment($department->id);
            }
        });

        $fresh = $department->fresh([
            'branch:id,name',
            'manager:id,first_name,last_name',
            'parent:id,name,level',
            'permissionGroup:id,name,permissions',
        ]);
        $fresh->loadCount('employees');

        AuditService::record('department_employees_added', $fresh, [
            'employee_ids' => $employeeIds,
        ]);

        return $this->success([
            'added_count' => $employees->count(),
            'department' => new DepartmentResource($fresh),
        ], 'Funcionários adicionados ao departamento com sucesso.');
    }

    public function removeEmployee(Request $request, Department $department, Employee $employee): JsonResponse
    {
        $this->authorizeEmployeeMembership($request);

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();
        if ($allowedDeptIds !== null && ! in_array((int) $department->id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para gerir funcionários deste departamento.');
        }

        if (! $employee->belongsToDepartment($department->id)) {
            return $this->error('Este funcionário não pertence ao departamento selecionado.', 422);
        }

        $employee->detachDepartment($department->id);

        $fresh = $department->fresh([
            'branch:id,name',
            'manager:id,first_name,last_name',
            'parent:id,name,level',
            'permissionGroup:id,name,permissions',
        ]);
        $fresh->loadCount('employees');

        AuditService::record('department_employee_removed', $fresh, [
            'employee_id' => $employee->id,
        ]);

        return $this->success([
            'department' => new DepartmentResource($fresh),
        ], 'Funcionário removido do departamento com sucesso.');
    }

    public function updateDepartmentPermissions(Request $request, Department $department): JsonResponse
    {
        $this->authorizePermissionManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();
        if ($allowedDeptIds !== null && ! in_array((int) $department->id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para gerir este departamento.');
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

        $affectedEmployeesCount = DB::transaction(function () use ($department, $tenant, $data, $cleanPermissions, $applyToOverrides): int {
            $department->update([
                'permission_group_id' => $data['permission_group_id'] ?? null,
                'default_permissions' => $cleanPermissions,
                'default_role_name' => $data['role_name'] ?? null,
            ]);

            $deptEmployees = Employee::query()
                ->where(function ($q) use ($department): void {
                    $q->where('department_id', $department->id)
                        ->orWhereHas('departments', fn ($dq) => $dq->where('departments.id', $department->id));
                })
                ->get(['id', 'user_id']);

            $empIds = $deptEmployees->pluck('id')->all();
            $userIds = $deptEmployees->pluck('user_id')->filter()->unique()->values()->all();

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

            foreach ($users as $deptUser) {
                if ($deptUser->isSuperAdmin() || $deptUser->hasRole('admin')) {
                    continue;
                }

                $access = $deptUser->tenantAccesses->first();
                if ($applyToOverrides && $access) {
                    if ((int) $deptUser->tenant_id === (int) $tenant->id && empty($access->department_ids)) {
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

        $fresh = $department->fresh([
            'branch:id,name',
            'manager:id,first_name,last_name',
            'parent:id,name,level',
            'permissionGroup:id,name,permissions',
        ]);
        $fresh->loadCount('employees');

        AuditService::record('department_permissions_updated', $fresh, [
            'permission_group_id' => $fresh->permission_group_id,
            'default_permissions_count' => count($fresh->default_permissions ?? []),
            'default_role_name' => $fresh->default_role_name,
            'apply_to_existing_overrides' => $applyToOverrides,
            'affected_employees_count' => $affectedEmployeesCount,
        ]);

        return $this->success([
            'department' => new DepartmentResource($fresh),
            'affected_employees_count' => $affectedEmployeesCount,
        ], 'Permissões do departamento atualizadas com sucesso.');
    }

    public function assignEmployeePermissions(Request $request, Department $department): JsonResponse
    {
        $this->authorizePermissionManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();
        if ($allowedDeptIds !== null && ! in_array((int) $department->id, $allowedDeptIds, true)) {
            abort(403, 'Sem permissão para gerir este departamento.');
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
            ->where(function ($q) use ($department): void {
                $q->where('department_id', $department->id)
                    ->orWhereHas('departments', fn ($dq) => $dq->where('departments.id', $department->id));
            })
            ->whereIn('id', $employeeIds)
            ->get();

        if ($employees->count() !== count($employeeIds)) {
            return $this->error('Um ou mais funcionários selecionados não pertencem a este departamento.', 422);
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
            $missingUserExists = $employees->contains(function (Employee $emp): bool {
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
            $department,
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
                    if ($clearIndividual) {
                        $skipped[] = [
                            'employee_id' => $emp->id,
                            'name' => $emp->full_name,
                            'reason' => 'Sem conta de acesso ao sistema.',
                        ];

                        continue;
                    }

                    if (! $autoCreateAccounts) {
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

                UserTenantAccess::query()->updateOrCreate(
                    ['user_id' => $linkedUser->id, 'tenant_id' => $tenant->id],
                    [
                        'permission_group_id' => $data['permission_group_id'] ?? null,
                        'role_name' => $resolvedRole,
                        'permissions' => $cleanPermissions,
                        'department_ids' => $scopeToDepartment ? [(int) $department->id] : null,
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

        AuditService::record('department_employees_permissions_updated', $department, [
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

    private function canManageDepartmentEmployees(User $user): bool
    {
        return $user->hasRole('super-admin')
            || $user->hasRole('admin')
            || $user->can('update_department')
            || $user->can('update_employee');
    }

    private function authorizeEmployeeMembership(Request $request): void
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if (! $this->canManageDepartmentEmployees($user)) {
            abort(403, 'Sem permissão para gerir funcionários do departamento.');
        }
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
}
