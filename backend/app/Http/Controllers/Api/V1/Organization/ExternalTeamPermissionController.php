<?php

namespace App\Http\Controllers\Api\V1\Organization;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Department;
use App\Models\PermissionGroup;
use App\Models\Tenant;
use App\Models\TenantRelationship;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Services\Audit\AuditService;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class ExternalTeamPermissionController extends BaseController
{
    private const SALARY_ONLY_PREFIXES = [
        'field.employee.salary.',
        'field.contract.base_salary.',
        'field.contract.compensation_terms.',
        'field.payroll.',
        'field.attendance.salary_deduction.',
        'field.benefit.amounts.',
        'field.deduction.amounts.',
        'field.payslip.salary_details.',
        'field.report.salary_costs.',
    ];

    private const SALARY_ONLY_ACTIONS = [
        'view_any_payroll',
        'view_payroll',
        'create_payroll',
        'update_payroll',
        'process_payroll',
        'close_payroll',
        'export_payroll',
        'print_payroll',
        'configure_payroll',
        'view_any_payslip',
        'view_payslip',
        'print_payslip',
        'export_payslip',
        'view_any_salary-component',
        'view_salary-component',
        'create_salary-component',
        'update_salary-component',
        'configure_salary-component',
    ];

    public function __construct(
        private readonly TenantManager $tenantManager,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if (! $this->canManageExternalPermissions($user)) {
            abort(403, 'Sem permissão para gerir equipa externa nesta empresa.');
        }

        $tenant = $this->tenantManager->requireTenant();

        $managerRelationships = TenantRelationship::query()
            ->where('managed_tenant_id', $tenant->id)
            ->where('status', 'active')
            ->with('managerTenant:id,name')
            ->get();

        $managerTenantNames = $managerRelationships
            ->mapWithKeys(fn (TenantRelationship $rel) => [(int) $rel->manager_tenant_id => $rel->managerTenant?->name ?? 'Empresa Gestora']);
        $managerTenantIds = $managerTenantNames->keys()->all();

        $externalUsers = User::query()
            ->where(function ($q) use ($tenant, $managerTenantIds): void {
                $q->where(function ($sub) use ($tenant): void {
                    $sub->whereHas('roles', fn ($rq) => $rq->whereIn('name', ['super-admin', 'super-admin-limited']))
                        ->where(fn ($tq) => $tq->whereNull('tenant_id')->orWhere('tenant_id', '!=', $tenant->id));
                });

                if ($managerTenantIds !== []) {
                    $q->orWhereIn('tenant_id', $managerTenantIds);
                }
            })
            ->with([
                'roles:id,name',
                'permissions:id,name',
                'tenantAccesses' => fn ($q) => $q->with('permissionGroup:id,name,permissions'),
            ])
            ->orderBy('name')
            ->get()
            ->unique('id')
            ->filter(function (User $u) use ($tenant): bool {
                if ($u->hasRole('super-admin')) {
                    return true;
                }

                return $u->canAccessTenant($tenant->id) || $u->isBlockedFromTenant($tenant->id);
            })
            ->values();

        $members = $externalUsers->map(function (User $u) use ($tenant, $user, $managerTenantNames): array {
            /** @var UserTenantAccess|null $tenantAccess */
            $tenantAccess = $u->tenantAccesses->first(
                fn (UserTenantAccess $a) => (int) $a->tenant_id === (int) $tenant->id
            );

            $isFullSuperAdmin = $u->hasRole('super-admin');
            $isLimitedSuperAdmin = $u->hasRole('super-admin-limited');

            $sourceType = match (true) {
                $isFullSuperAdmin => 'super_admin_full',
                $isLimitedSuperAdmin => 'super_admin_limited',
                default => 'manager_tenant',
            };

            $sourceLabel = match ($sourceType) {
                'super_admin_full' => 'Super-Admin Total',
                'super_admin_limited' => 'Super-Admin Limitado',
                default => $managerTenantNames->get((int) $u->tenant_id, 'Empresa Gestora'),
            };

            $statusInCompany = match (true) {
                $tenantAccess !== null && $tenantAccess->is_active === false => 'blocked',
                $tenantAccess !== null && ($tenantAccess->hasExplicitPermissions() || ! empty($tenantAccess->department_ids)) => 'customized',
                default => 'global_default',
            };

            $effectivePermissions = $statusInCompany === 'blocked'
                ? []
                : $u->effectivePermissions($tenant->id)
                    ->reject(fn (string $p) => in_array($p, User::PLATFORM_ONLY_PERMISSIONS, true))
                    ->values()
                    ->all();

            $hasSalaryAccess = $isFullSuperAdmin
                || ($statusInCompany !== 'blocked' && $this->containsSalaryPermissions($effectivePermissions));

            return [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'is_active' => (bool) $u->is_active,
                'source_type' => $sourceType,
                'source_label' => $sourceLabel,
                'is_protected' => $isFullSuperAdmin || (int) $u->id === (int) $user->id,
                'is_current_user' => (int) $u->id === (int) $user->id,
                'status_in_company' => $statusInCompany,
                'role_name' => $tenantAccess?->role_name
                    ?? ($isFullSuperAdmin ? 'super-admin' : ($isLimitedSuperAdmin ? 'hr-manager' : ($u->roles->first()?->name ?? 'hr-manager'))),
                'permission_group_id' => $tenantAccess?->permission_group_id,
                'permission_group_name' => $tenantAccess?->permissionGroup?->name,
                'effective_permissions' => $effectivePermissions,
                'has_salary_access' => $hasSalaryAccess,
                'department_scope_ids' => array_values(array_map('intval', $tenantAccess?->department_ids ?? [])),
            ];
        })->values();

        $departments = Department::query()
            ->orderBy('level')
            ->orderBy('name')
            ->get(['id', 'name', 'code', 'level']);

        return $this->success([
            'members' => $members,
            'departments' => $departments,
            'can_manage_permissions' => true,
            'can_create_platform_users' => $user->hasRole('super-admin') || $user->can('manage_super_admins'),
            'can_create_full_super_admin' => $user->hasRole('super-admin'),
        ]);
    }

    public function updatePermissions(Request $request): JsonResponse
    {
        $actor = $request->user();
        if (! $actor || ! $this->canManageExternalPermissions($actor)) {
            abort(403, 'Sem permissão para atualizar acessos externos desta empresa.');
        }

        $tenant = $this->tenantManager->requireTenant();

        $data = $request->validate([
            'user_ids' => ['required', 'array', 'min:1'],
            'user_ids.*' => ['integer'],
            'mode' => ['required', 'string', 'in:customize,hide_salaries,restore_default,block'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'permission_group_id' => [
                'nullable',
                'integer',
                Rule::exists('permission_groups', 'id')->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenant->id)),
            ],
            'role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'department_ids' => ['nullable', 'array'],
            'department_ids.*' => ['integer', Rule::exists('departments', 'id')->where('tenant_id', $tenant->id)],
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

        $managerTenantIds = TenantRelationship::query()
            ->where('managed_tenant_id', $tenant->id)
            ->where('status', 'active')
            ->pluck('manager_tenant_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $userIds = array_values(array_unique(array_map('intval', $data['user_ids'])));
        $targets = User::query()
            ->whereIn('id', $userIds)
            ->with(['roles:id,name', 'permissions:id,name', 'tenantAccesses'])
            ->get();

        if ($targets->count() !== count($userIds)) {
            return $this->error('Um ou mais utilizadores selecionados não foram encontrados.', 404);
        }

        $mode = $data['mode'];
        $cleanPermissions = empty($data['permissions'])
            ? []
            : array_values(array_unique(array_map('strval', $data['permissions'])));
        $deptIds = array_values(array_unique(array_map('intval', $data['department_ids'] ?? [])));

        $updatedCount = 0;
        $skipped = [];

        DB::transaction(function () use (
            $targets,
            $actor,
            $tenant,
            $managerTenantIds,
            $mode,
            $data,
            $cleanPermissions,
            $deptIds,
            &$updatedCount,
            &$skipped
        ): void {
            foreach ($targets as $target) {
                $isExternal = $target->isSuperAdmin()
                    || ($target->tenant_id !== null && in_array((int) $target->tenant_id, $managerTenantIds, true));

                if (! $isExternal) {
                    $skipped[] = [
                        'user_id' => $target->id,
                        'name' => $target->name,
                        'reason' => 'Utilizador não pertence à equipa externa ou plataforma.',
                    ];

                    continue;
                }

                if ($target->hasRole('super-admin')) {
                    $skipped[] = [
                        'user_id' => $target->id,
                        'name' => $target->name,
                        'reason' => 'Super-Admin Total tem acesso global irrestrito.',
                    ];

                    continue;
                }

                if ($target->is($actor)) {
                    $skipped[] = [
                        'user_id' => $target->id,
                        'name' => $target->name,
                        'reason' => 'Não pode alterar as suas próprias permissões aqui.',
                    ];

                    continue;
                }

                $existing = UserTenantAccess::query()
                    ->where('user_id', $target->id)
                    ->where('tenant_id', $tenant->id)
                    ->first();

                if ($mode === 'restore_default') {
                    if ($existing) {
                        if ($existing->is_exception) {
                            $existing->delete();
                        } else {
                            $existing->update([
                                'permission_group_id' => null,
                                'permissions' => null,
                                'department_ids' => null,
                                'is_active' => true,
                            ]);
                        }
                    }
                    $updatedCount++;

                    continue;
                }

                if ($mode === 'block') {
                    UserTenantAccess::query()->updateOrCreate(
                        ['user_id' => $target->id, 'tenant_id' => $tenant->id],
                        [
                            'is_exception' => true,
                            'is_active' => false,
                            'permission_group_id' => null,
                            'permissions' => [],
                            'department_ids' => null,
                            'role_name' => $existing?->role_name ?? 'employee',
                        ],
                    );
                    $updatedCount++;

                    continue;
                }

                if ($mode === 'hide_salaries') {
                    $currentEffective = $target->effectivePermissions($tenant->id)
                        ->reject(fn (string $p) => in_array($p, User::PLATFORM_ONLY_PERMISSIONS, true))
                        ->values()
                        ->all();

                    $stripped = $this->stripSalaryPermissions($currentEffective);
                    $isException = $existing ? (bool) $existing->is_exception : true;

                    UserTenantAccess::query()->updateOrCreate(
                        ['user_id' => $target->id, 'tenant_id' => $tenant->id],
                        [
                            'is_exception' => $isException,
                            'is_active' => true,
                            'permission_group_id' => null,
                            'role_name' => $existing?->role_name ?? ($data['role_name'] ?? 'hr-manager'),
                            'permissions' => $stripped,
                            'department_ids' => $existing?->department_ids,
                        ],
                    );
                    $updatedCount++;

                    continue;
                }

                // mode === 'customize'
                $isException = $existing ? (bool) $existing->is_exception : true;

                UserTenantAccess::query()->updateOrCreate(
                    ['user_id' => $target->id, 'tenant_id' => $tenant->id],
                    [
                        'is_exception' => $isException,
                        'is_active' => true,
                        'permission_group_id' => $data['permission_group_id'] ?? null,
                        'role_name' => $data['role_name'] ?? ($existing?->role_name ?? 'hr-manager'),
                        'permissions' => ! empty($data['permission_group_id']) ? null : $cleanPermissions,
                        'department_ids' => $deptIds === [] ? null : $deptIds,
                    ],
                );
                $updatedCount++;
            }
        });

        User::clearDepartmentPermissionCache();

        AuditService::record('external_team_permissions_updated', $tenant, [
            'mode' => $mode,
            'user_ids' => $userIds,
            'updated_count' => $updatedCount,
            'skipped' => $skipped,
        ]);

        return $this->success([
            'updated_count' => $updatedCount,
            'skipped' => $skipped,
        ], 'Permissões da equipa externa atualizadas com sucesso.');
    }

    public function storePlatformUser(Request $request): JsonResponse
    {
        $actor = $request->user();
        if (! $actor || (! $actor->hasRole('super-admin') && ! $actor->can('manage_super_admins'))) {
            abort(403, 'Sem permissão para criar administradores da plataforma.');
        }

        $tenant = $this->tenantManager->requireTenant();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', 'string', 'in:super-admin,super-admin-limited'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'can_manage_super_admins' => ['sometimes', 'boolean'],
            'hide_salaries_in_current_company' => ['sometimes', 'boolean'],
        ]);

        if ($data['role'] === 'super-admin') {
            if (! $actor->hasRole('super-admin')) {
                return $this->error('Apenas um super-administrador total pode criar outro super-administrador total.', 403);
            }

            $created = DB::transaction(function () use ($data): User {
                $fullRole = Role::query()->firstOrCreate(
                    ['name' => 'super-admin', 'guard_name' => 'web'],
                    [
                        'description' => 'Acesso total à plataforma e todos os tenants',
                        'is_system' => true,
                    ],
                );

                if ($fullRole->wasRecentlyCreated) {
                    $fullRole->syncPermissions(Permission::query()->where('guard_name', 'web')->get());
                }

                $newUser = User::query()->create([
                    'tenant_id' => null,
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'password' => Hash::make($data['password']),
                    'locale' => 'pt',
                    'timezone' => 'Africa/Luanda',
                    'email_verified_at' => now(),
                    'is_active' => true,
                ]);
                $newUser->assignRole($fullRole);

                return $newUser;
            });

            AuditService::record('platform_user_created_from_organization', $created, [
                'role' => 'super-admin',
                'created_in_tenant_id' => $tenant->id,
            ]);

            return $this->success([
                'id' => $created->id,
                'name' => $created->name,
                'email' => $created->email,
                'role' => 'super-admin',
            ], 'Super-Admin Total criado com sucesso.', 201);
        }

        $requestedPerms = collect($data['permissions'] ?? [])
            ->map(fn ($p) => (string) $p)
            ->reject(fn (string $p) => in_array($p, User::PLATFORM_ONLY_PERMISSIONS, true))
            ->values();

        $platformPerms = collect(['view_any_tenant', 'view_tenant']);
        if ($request->boolean('can_manage_super_admins')) {
            if (! $actor->hasRole('super-admin') && ! $actor->can('manage_super_admins')) {
                abort(403, 'Sem permissão para delegar gestão de super-admins.');
            }
            $platformPerms->push('manage_super_admins');
        }

        $finalPermissions = $requestedPerms
            ->merge($platformPerms)
            ->unique()
            ->values()
            ->all();

        if (! $actor->hasRole('super-admin')) {
            $actorPerms = $actor->getAllPermissions()->pluck('name')->all();
            if (array_diff($finalPermissions, $actorPerms)) {
                abort(403, 'Não pode atribuir permissões que não possui.');
            }
        }

        $hideSalariesHere = $request->boolean('hide_salaries_in_current_company');
        $companyRole = $data['role_name'] ?? 'hr-manager';

        $created = DB::transaction(function () use (
            $data,
            $finalPermissions,
            $hideSalariesHere,
            $tenant,
            $companyRole
        ): User {
            $limitedRole = Role::query()->firstOrCreate(
                ['name' => 'super-admin-limited', 'guard_name' => 'web'],
                [
                    'description' => 'Acesso global limitado às permissões atribuídas',
                    'is_system' => true,
                ],
            );

            $newUser = User::query()->create([
                'tenant_id' => null,
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
                'locale' => $tenant->locale ?? 'pt',
                'timezone' => $tenant->timezone ?? 'Africa/Luanda',
                'email_verified_at' => now(),
                'is_active' => true,
            ]);
            $newUser->assignRole($limitedRole);
            $newUser->syncPermissions($finalPermissions);

            if ($hideSalariesHere) {
                $companyPerms = collect($finalPermissions)
                    ->reject(fn (string $p) => in_array($p, User::PLATFORM_ONLY_PERMISSIONS, true))
                    ->values()
                    ->all();

                UserTenantAccess::query()->create([
                    'user_id' => $newUser->id,
                    'tenant_id' => $tenant->id,
                    'role_name' => $companyRole,
                    'permissions' => $this->stripSalaryPermissions($companyPerms),
                    'department_ids' => null,
                    'is_active' => true,
                    'is_exception' => true,
                ]);
            }

            return $newUser;
        });

        AuditService::record('platform_user_created_from_organization', $created, [
            'role' => 'super-admin-limited',
            'created_in_tenant_id' => $tenant->id,
            'hide_salaries_in_current_company' => $hideSalariesHere,
        ]);

        return $this->success([
            'id' => $created->id,
            'name' => $created->name,
            'email' => $created->email,
            'role' => 'super-admin-limited',
        ], 'Super-Admin Limitado criado com sucesso.', 201);
    }

    /**
     * @param  array<int, string>  $permissions
     */
    private function containsSalaryPermissions(array $permissions): bool
    {
        foreach ($permissions as $perm) {
            if (
                str_starts_with($perm, 'field.employee.salary.')
                || str_starts_with($perm, 'field.contract.base_salary.')
                || str_starts_with($perm, 'field.payroll.base_salary.')
                || str_starts_with($perm, 'field.payroll.gross_salary.')
                || str_starts_with($perm, 'field.payroll.net_salary.')
                || str_starts_with($perm, 'field.payslip.salary_details.')
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, string>  $permissions
     * @return array<int, string>
     */
    private function stripSalaryPermissions(array $permissions): array
    {
        return array_values(array_filter($permissions, function (string $perm): bool {
            if (in_array($perm, self::SALARY_ONLY_ACTIONS, true)) {
                return false;
            }
            foreach (self::SALARY_ONLY_PREFIXES as $prefix) {
                if (str_starts_with($perm, $prefix)) {
                    return false;
                }
            }

            return true;
        }));
    }

    private function canManageExternalPermissions(User $user): bool
    {
        return $user->hasRole('super-admin')
            || $user->hasRole('admin')
            || $user->can('manage_super_admins')
            || $user->can('create_user')
            || $user->can('update_user');
    }
}
