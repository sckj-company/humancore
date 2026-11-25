<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\TenantResource;
use App\Models\Department;
use App\Models\Employee;
use App\Models\LeaveType;
use App\Models\PermissionGroup;
use App\Models\SalaryComponent;
use App\Models\Tenant;
use App\Models\TenantRelationship;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Scopes\TenantScope;
use App\Services\Audit\AuditService;
use App\Services\SaaS\PlanEntitlementService;
use App\Services\SaaS\TenantHierarchyService;
use App\Services\SaaS\TenantProvisioningService;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class SuperAdminController extends BaseController
{
    private const PLATFORM_ONLY_PERMISSIONS = [
        'manage_platform',
        'manage_super_admins',
        'view_any_tenant',
        'view_tenant',
        'create_tenant',
        'update_tenant',
        'delete_tenant',
        'restore_tenant',
        'force_delete_tenant',
    ];

    /**
     * @return array<int, int>|null Null significa acesso global a todas as empresas.
     */
    private function scopedTenantIds(User $user): ?array
    {
        if ($user->hasRole('super-admin')) {
            return null;
        }

        if ($user->hasRole('super-admin-limited')
            && ! $user->tenantAccesses()->where('is_exception', false)->exists()
            && ! $user->tenantAccesses()->where('is_exception', true)->where('is_active', false)->exists()) {
            return null;
        }

        return $user->accessibleTenants()
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    public function dashboard(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $scopedIds = $this->scopedTenantIds($request->user());
        $scopedFilter = $scopedIds === [] ? [0] : $scopedIds;

        $tenantScope = fn ($query) => $query->when(
            $scopedFilter !== null,
            fn ($q) => $q->whereIn('id', $scopedFilter)
        );

        $totalTenants = $tenantScope(Tenant::query())->count();
        $activeTenants = $tenantScope(Tenant::query())->where('status', 'active')->count();
        $inactiveTenants = $tenantScope(Tenant::query())->where('status', 'inactive')->count();
        $suspendedTenants = $tenantScope(Tenant::query())->where('status', 'suspended')->count();
        $totalEmployees = Employee::withoutGlobalScope(TenantScope::class)
            ->when($scopedFilter !== null, fn ($q) => $q->whereIn('tenant_id', $scopedFilter))
            ->count();
        $activeEmployees = Employee::withoutGlobalScope(TenantScope::class)
            ->when($scopedFilter !== null, fn ($q) => $q->whereIn('tenant_id', $scopedFilter))
            ->where('status', 'active')
            ->count();
        $totalUsers = User::query()
            ->when($scopedFilter !== null, fn ($q) => $q->where(function ($uq) use ($scopedFilter): void {
                $uq->whereIn('tenant_id', $scopedFilter)
                    ->orWhereHas('tenantAccesses', fn ($aq) => $aq->whereIn('tenant_id', $scopedFilter)->where('is_active', true));
            }))
            ->count();
        $superAdmins = User::query()->whereHas('roles', fn ($q) => $q->whereIn('name', ['super-admin', 'super-admin-limited']))->count();

        $tenantTrend = collect(range(11, 0))->map(function ($monthsAgo) use ($tenantScope) {
            $month = now()->startOfMonth()->subMonths($monthsAgo);

            return [
                'month' => $month->format('Y-m'),
                'label' => $month->locale(app()->getLocale())->translatedFormat('M/y'),
                'count' => $tenantScope(Tenant::query())
                    ->whereYear('created_at', $month->year)
                    ->whereMonth('created_at', $month->month)
                    ->count(),
            ];
        });

        $segments = [
            'small' => 0,
            'medium' => 0,
            'large' => 0,
        ];

        $byTenant = $tenantScope(Tenant::query())
            ->withCount([
                'employees' => fn ($q) => $q->withoutGlobalScope(TenantScope::class),
            ])
            ->orderByDesc('created_at')
            ->get()
            ->map(function (Tenant $tenant) use (&$segments) {
                $count = $tenant->employees_count;
                if ($count <= 10) {
                    $segments['small']++;
                } elseif ($count <= 50) {
                    $segments['medium']++;
                } else {
                    $segments['large']++;
                }

                return [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'slug' => $tenant->slug,
                    'status' => $tenant->status,
                    'employees' => $tenant->employees_count,
                    'created_at' => $tenant->created_at?->toIso8601String(),
                ];
            });

        return $this->success([
            'kpis' => [
                'total_tenants' => $totalTenants,
                'active_tenants' => $activeTenants,
                'inactive_tenants' => $inactiveTenants,
                'suspended_tenants' => $suspendedTenants,
                'inactive_or_suspended_tenants' => $inactiveTenants + $suspendedTenants,
                'total_employees' => $totalEmployees,
                'active_employees' => $activeEmployees,
                'total_users' => $totalUsers,
                'super_admins' => $superAdmins,
            ],
            'tenant_trend' => $tenantTrend,
            'by_status' => [
                'active' => $activeTenants,
                'inactive' => $inactiveTenants,
                'suspended' => $suspendedTenants,
            ],
            'segments' => $segments,
            'by_tenant' => $byTenant,
        ]);
    }

    public function platformUsers(Request $request): JsonResponse
    {
        $this->authorizePlatformUserManagement($request);

        $users = User::query()
            ->whereHas('roles', fn ($query) => $query->whereIn('name', ['super-admin', 'super-admin-limited']))
            ->with(['roles', 'permissions', 'tenantAccesses.tenant:id,name,slug', 'tenantAccesses.permissionGroup:id,name'])
            ->orderBy('name')
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_active' => $user->is_active,
                'roles' => $user->getRoleNames(),
                'permissions' => $user->getAllPermissions()->pluck('name')->values(),
                'tenant_accesses' => $this->formatTenantAccesses($user),
            ]);

        $permissionsQuery = Permission::query()
            ->where('guard_name', 'web')
            ->where('name', '!=', 'manage_platform');

        if (! $request->user()->hasRole('super-admin')) {
            $permissionsQuery->whereIn('name', $request->user()->getAllPermissions()->pluck('name'));
        }

        $permissions = $permissionsQuery
            ->orderBy('group_name')
            ->orderBy('name')
            ->get(['name', 'group_name']);

        return $this->success([
            'users' => $users,
            'permissions' => $permissions,
        ]);
    }

    public function storePlatformUser(Request $request): JsonResponse
    {
        $this->authorizePlatformUserManagement($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['sometimes', 'string', 'in:super-admin,super-admin-limited'],
            'permissions' => ['required_unless:role,super-admin', 'array'],
            'permissions.*' => ['required', 'string', 'distinct', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'tenant_accesses' => ['sometimes', 'array'],
            'tenant_accesses.*.tenant_id' => ['required', 'integer', 'exists:tenants,id'],
            'tenant_accesses.*.permission_group_id' => ['nullable', 'integer', 'exists:permission_groups,id'],
            'tenant_accesses.*.role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'tenant_accesses.*.permissions' => ['nullable', 'array'],
            'tenant_accesses.*.permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'tenant_accesses.*.department_ids' => ['nullable', 'array'],
            'tenant_accesses.*.department_ids.*' => ['integer'],
        ]);

        $targetRole = $data['role'] ?? 'super-admin-limited';

        if ($targetRole === 'super-admin') {
            if (! $request->user()->hasRole('super-admin')) {
                return $this->error('Apenas um super-administrador total pode criar outro super-administrador total.', 403);
            }

            $user = DB::transaction(function () use ($data): User {
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

                $user = User::query()->create([
                    'tenant_id' => null,
                    'name' => $data['name'],
                    'email' => $data['email'],
                    'password' => Hash::make($data['password']),
                    'locale' => 'pt',
                    'timezone' => 'Africa/Luanda',
                    'email_verified_at' => now(),
                    'is_active' => true,
                ]);
                $user->assignRole($fullRole);

                return $user;
            });

            $user->load(['roles', 'permissions', 'tenantAccesses.tenant:id,name,slug', 'tenantAccesses.permissionGroup:id,name']);

            return $this->success([
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'is_active' => $user->is_active,
                'roles' => $user->getRoleNames(),
                'permissions' => $user->getAllPermissions()->pluck('name')->values(),
                'tenant_accesses' => [],
            ], 'Super-admin total criado com sucesso.', 201);
        }

        $this->validateAssignablePlatformUserPermissions($request, $data['permissions']);

        $user = DB::transaction(function () use ($request, $data): User {
            $restrictedRole = Role::query()->firstOrCreate(
                ['name' => 'super-admin-limited', 'guard_name' => 'web'],
                [
                    'description' => 'Acesso global limitado às permissões atribuídas',
                    'is_system' => true,
                ],
            );

            $user = User::query()->create([
                'tenant_id' => null,
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
                'locale' => 'pt',
                'timezone' => 'Africa/Luanda',
                'email_verified_at' => now(),
                'is_active' => true,
            ]);
            $user->assignRole($restrictedRole);
            $user->syncPermissions($data['permissions']);

            if (array_key_exists('tenant_accesses', $data)) {
                $this->syncUserTenantAccesses($request, $user, $data['tenant_accesses'], true);
            }

            return $user;
        });

        $user->load(['roles', 'permissions', 'tenantAccesses.tenant:id,name,slug', 'tenantAccesses.permissionGroup:id,name']);

        return $this->success([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'is_active' => $user->is_active,
            'roles' => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name')->values(),
            'tenant_accesses' => $this->formatTenantAccesses($user),
        ], 'Super-admin limitado criado com sucesso.', 201);
    }

    public function updatePlatformUser(Request $request, User $user): JsonResponse
    {
        $this->authorizePlatformUserManagement($request);

        if ($request->user()->is($user)) {
            return $this->error('Não é possível alterar as permissões da própria conta nesta página.', 403);
        }
        if (! $user->isSuperAdmin()) {
            return $this->error('Só é possível gerir utilizadores da plataforma.', 403);
        }

        $data = $request->validate([
            'role' => ['sometimes', 'string', 'in:super-admin,super-admin-limited'],
            'permissions' => ['required_unless:role,super-admin', 'array'],
            'permissions.*' => ['required', 'string', 'distinct', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'tenant_accesses' => ['sometimes', 'array'],
            'tenant_accesses.*.tenant_id' => ['required', 'integer', 'exists:tenants,id'],
            'tenant_accesses.*.permission_group_id' => ['nullable', 'integer', 'exists:permission_groups,id'],
            'tenant_accesses.*.role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'tenant_accesses.*.permissions' => ['nullable', 'array'],
            'tenant_accesses.*.permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'tenant_accesses.*.department_ids' => ['nullable', 'array'],
            'tenant_accesses.*.department_ids.*' => ['integer'],
        ]);

        $targetRole = $data['role'] ?? ($user->hasRole('super-admin') ? 'super-admin' : 'super-admin-limited');

        if ($user->hasRole('super-admin') || $targetRole === 'super-admin') {
            if (! $request->user()->hasRole('super-admin')) {
                return $this->error('Apenas um super-administrador total pode gerir super-administradores totais.', 403);
            }
        }

        if ($targetRole === 'super-admin') {
            DB::transaction(function () use ($user): void {
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

                $user->syncRoles([$fullRole]);
                $user->syncPermissions([]);
                $user->tenantAccesses()->delete();
            });
        } else {
            $permissions = $data['permissions'] ?? null;
            if (! is_array($permissions)) {
                abort(422, 'É obrigatório definir as permissões do super-admin limitado.');
            }
            $this->validateAssignablePlatformUserPermissions($request, $permissions);

            DB::transaction(function () use ($request, $user, $data, $permissions): void {
                $restrictedRole = Role::query()->firstOrCreate(
                    ['name' => 'super-admin-limited', 'guard_name' => 'web'],
                    [
                        'description' => 'Acesso global limitado às permissões atribuídas',
                        'is_system' => true,
                    ],
                );
                $user->syncRoles([$restrictedRole]);
                $user->syncPermissions($permissions);

                if (array_key_exists('tenant_accesses', $data)) {
                    $this->syncUserTenantAccesses($request, $user, $data['tenant_accesses'], true);
                }
            });
        }

        $user->refresh()->load(['roles', 'permissions', 'tenantAccesses.tenant:id,name,slug', 'tenantAccesses.permissionGroup:id,name']);

        return $this->success([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'is_active' => $user->is_active,
            'roles' => $user->getRoleNames(),
            'permissions' => $user->getAllPermissions()->pluck('name')->values(),
            'tenant_accesses' => $this->formatTenantAccesses($user),
        ], 'Permissões do super-admin atualizadas com sucesso.');
    }

    public function destroyPlatformUser(Request $request, User $user): JsonResponse
    {
        $this->authorizePlatformUserManagement($request);

        if ($request->user()->is($user)) {
            return $this->error('Não é possível eliminar a própria conta nesta página.', 403);
        }
        if (! $user->isSuperAdmin()) {
            return $this->error('Só é possível eliminar utilizadores da plataforma.', 403);
        }

        if ($user->hasRole('super-admin')) {
            if (! $request->user()->hasRole('super-admin')) {
                return $this->error('Apenas um super-administrador total pode eliminar outro super-administrador total.', 403);
            }

            $otherActiveFullAdminExists = User::query()
                ->where('id', '!=', $user->id)
                ->where('is_active', true)
                ->whereHas('roles', fn ($q) => $q->where('name', 'super-admin'))
                ->exists();

            if (! $otherActiveFullAdminExists) {
                return $this->error('Não é possível eliminar o único super-administrador total ativo.', 422);
            }
        }

        DB::transaction(function () use ($user): void {
            $user->tokens()->delete();
            $user->delete();
        });

        return $this->success(null, 'Super-admin eliminado com sucesso.');
    }

    /**
     * @param  array<int, string>  $requestedPermissions
     */
    private function validateAssignablePlatformUserPermissions(Request $request, array $requestedPermissions): void
    {
        $assignablePermissions = $request->user()->hasRole('super-admin')
            ? Permission::query()
                ->where('guard_name', 'web')
                ->where('name', '!=', 'manage_platform')
                ->pluck('name')
                ->all()
            : $request->user()->getAllPermissions()
                ->reject(fn (Permission $permission) => $permission->name === 'manage_platform')
                ->pluck('name')
                ->all();

        if (array_diff($requestedPermissions, $assignablePermissions)) {
            abort(403, 'Não pode atribuir permissões que não possui.');
        }
        if (! in_array('view_any_tenant', $requestedPermissions, true)) {
            abort(422, 'O acesso global requer a permissão de consultar empresas.');
        }
    }

    private function authorizePlatformUserManagement(Request $request): void
    {
        if (! $request->user()->hasRole('super-admin')) {
            $this->authorize('manage_super_admins');
        }
    }

    public function tenants(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $scopedIds = $this->scopedTenantIds($request->user());
        $scopedFilter = $scopedIds === [] ? [0] : $scopedIds;

        $tenants = Tenant::query()
            ->when($scopedFilter !== null, fn ($q) => $q->whereIn('id', $scopedFilter))
            ->with([
                'latestSubscription.plan:id,name,slug,currency,base_price',
                'activeManagerRelationship.managerTenant:id,name,slug',
            ])
            ->withCount([
                'employees' => fn ($q) => $q->withoutGlobalScope(TenantScope::class),
                'users',
                'departments' => fn ($q) => $q->withoutGlobalScope(TenantScope::class),
                'activeManagedRelationships',
            ])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(function ($sub) use ($term) {
                    $sub->where('name', 'like', "%{$term}%")
                        ->orWhere('slug', 'like', "%{$term}%")
                        ->orWhere('email', 'like', "%{$term}%")
                        ->orWhere('tax_id', 'like', "%{$term}%");
                });
            })
            ->when($request->filled('status'), function ($q) use ($request) {
                $status = (string) $request->string('status');
                if ($status === 'inactive_or_suspended') {
                    $q->whereIn('status', ['inactive', 'suspended']);
                } else {
                    $q->where('status', $status);
                }
            })
            ->orderBy($request->string('sort_by', 'created_at'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 20));

        return $this->paginated($tenants->through(function (Tenant $tenant) {
            $sub = $tenant->latestSubscription;
            $managerRel = $tenant->activeManagerRelationship;

            return array_merge(
                (new TenantResource($tenant))->resolve(),
                [
                    'stats' => [
                        'employees' => $tenant->employees_count,
                        'departments' => $tenant->departments_count,
                        'users' => $tenant->users_count,
                        'managed_tenants' => $tenant->active_managed_relationships_count,
                    ],
                    'subscription' => $sub ? [
                        'id' => $sub->id,
                        'plan_id' => $sub->plan_id,
                        'plan_name' => $sub->plan?->name,
                        'status' => $sub->status,
                        'ends_at' => $sub->ends_at?->toIso8601String(),
                        'custom_price' => $sub->custom_price,
                    ] : null,
                    'managed_by' => $managerRel?->managerTenant ? [
                        'relationship_id' => $managerRel->id,
                        'relationship_type' => $managerRel->relationship_type,
                        'manager_tenant_id' => $managerRel->managerTenant->id,
                        'manager_tenant_name' => $managerRel->managerTenant->name,
                    ] : null,
                    'created_at' => $tenant->created_at?->toIso8601String(),
                    'updated_at' => $tenant->updated_at?->toIso8601String(),
                ],
            );
        }));
    }

    public function storeTenant(Request $request): JsonResponse
    {
        $this->authorize('create', Tenant::class);

        $data = $request->validate([
            'name'               => ['required', 'string', 'max:255'],
            'slug'               => ['required', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', 'unique:tenants,slug'],
            'email'              => ['nullable', 'email', 'max:255'],
            'billing_email'      => ['nullable', 'email', 'max:255'],
            'phone'              => ['nullable', 'string', 'max:50'],
            'website'            => ['nullable', 'url', 'max:255'],
            'tax_id'             => ['nullable', 'string', 'max:100'],
            'inss_number'        => ['nullable', 'string', 'max:100'],
            'legal_entity_type'  => ['nullable', 'string', 'max:50'],
            'economic_sector'    => ['nullable', 'string', 'max:150'],
            'address'            => ['nullable', 'string', 'max:500'],
            'city'               => ['nullable', 'string', 'max:150'],
            'province'           => ['nullable', 'string', 'max:150'],
            'country'            => ['nullable', 'string', 'max:100'],
            'postal_code'        => ['nullable', 'string', 'max:50'],
            'currency'           => ['nullable', 'string', 'size:3'],
            'locale'             => ['nullable', 'string', 'max:10'],
            'timezone'           => ['nullable', 'string', 'max:100'],
            'status'             => ['nullable', 'in:active,inactive,suspended'],
            // Admin user (optional)
            'admin_name'         => ['nullable', 'string', 'max:255'],
            'admin_email'        => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'admin_password'     => ['nullable', 'string', 'min:8'],
            // SaaS Plan & Manager (optional)
            'plan_id'            => ['nullable', 'integer', 'exists:plans,id'],
            'manager_tenant_id'  => ['nullable', 'integer', 'exists:tenants,id'],
            'relationship_type'  => ['nullable', 'in:bpo,accounting,consulting,holding,reseller'],
            'custom_price'       => ['nullable', 'numeric', 'min:0'],
            'subscription_status' => ['nullable', 'in:active,pending_payment,grace_period,suspended'],
            'subscription_ends_at' => ['nullable', 'date'],
        ]);

        $tenantData = collect($data)->except([
            'admin_name', 'admin_email', 'admin_password',
            'plan_id', 'manager_tenant_id', 'relationship_type',
            'custom_price', 'subscription_status', 'subscription_ends_at',
        ])->toArray();

        $tenant = app(TenantProvisioningService::class)->createTenant($tenantData, [
            'admin_name' => $data['admin_name'] ?? null,
            'admin_email' => $data['admin_email'] ?? null,
            'admin_password' => $data['admin_password'] ?? null,
            'plan_id' => $data['plan_id'] ?? null,
            'assigned_by' => $request->user()->id,
            'subscription' => [
                'custom_price' => $data['custom_price'] ?? null,
                'status' => $data['subscription_status'] ?? 'active',
                'ends_at' => $data['subscription_ends_at'] ?? null,
            ],
        ]);

        if (! empty($data['manager_tenant_id'])) {
            $managerTenant = Tenant::query()->findOrFail((int) $data['manager_tenant_id']);
            app(TenantHierarchyService::class)->attachManagedTenant(
                $managerTenant,
                $tenant,
                $request->user(),
                ['relationship_type' => $data['relationship_type'] ?? 'bpo'],
            );
        }

        return $this->success(
            new TenantResource($tenant->fresh()),
            'Empresa criada com sucesso.',
            201,
        );
    }

    public function tenantPermissions(): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $permissions = Permission::query()
            ->where('guard_name', 'web')
            ->whereNotIn('name', self::PLATFORM_ONLY_PERMISSIONS)
            ->orderBy('group_name')
            ->orderBy('name')
            ->get(['id', 'name', 'group_name']);

        $rolePermissions = Role::query()
            ->where('guard_name', 'web')
            ->whereIn('name', ['admin', 'hr-manager', 'manager', 'employee'])
            ->with('permissions:id,name')
            ->get()
            ->mapWithKeys(fn (Role $role) => [
                $role->name => $role->permissions
                    ->pluck('name')
                    ->reject(fn (string $name) => in_array($name, self::PLATFORM_ONLY_PERMISSIONS, true))
                    ->values(),
            ]);

        return $this->success([
            'permissions' => $permissions,
            'role_permissions' => $rolePermissions,
        ]);
    }

    public function listTenantUsers(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('view', $tenant);
        if (! $request->user()->canAccessTenant($tenant->id)) {
            return $this->error('Sem permissão para aceder à empresa solicitada.', 403);
        }

        $users = User::query()
            ->where(function ($query) use ($tenant) {
                $query->where('tenant_id', $tenant->id)
                    ->orWhereHas('tenantAccesses', fn ($aq) => $aq->where('tenant_id', $tenant->id));
            })
            ->with(['roles', 'permissions', 'tenantAccesses.tenant:id,name,slug', 'tenantAccesses.permissionGroup:id,name'])
            ->orderBy('name')
            ->get()
            ->map(fn (User $u) => [
                'id'                 => $u->id,
                'name'               => $u->name,
                'email'              => $u->email,
                'is_active'          => $u->is_active,
                'roles'              => $u->roles->pluck('name')->values(),
                'permissions'        => $u->getAllPermissions()->pluck('name')->values(),
                'direct_permissions' => $u->getDirectPermissions()->pluck('name')->values(),
                'tenant_accesses'    => $this->formatTenantAccesses($u),
                'created_at'         => $u->created_at?->toIso8601String(),
            ]);

        return $this->success($users);
    }

    public function storeUser(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('update', $tenant);
        if (! $request->user()->canAccessTenant($tenant->id)) {
            return $this->error('Sem permissão para aceder à empresa solicitada.', 403);
        }

        $data = $request->validate([
            'name'          => ['required', 'string', 'max:255'],
            'email'         => ['required', 'email', 'max:255', 'unique:users,email'],
            'password'      => ['required', 'string', 'min:8'],
            'role'          => ['required', 'string', 'in:admin,hr-manager,manager,employee'],
            'is_active'     => ['sometimes', 'boolean'],
            'permissions'   => ['sometimes', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'tenant_accesses' => ['sometimes', 'array'],
            'tenant_accesses.*.tenant_id' => ['required', 'integer', 'exists:tenants,id'],
            'tenant_accesses.*.permission_group_id' => ['nullable', 'integer', 'exists:permission_groups,id'],
            'tenant_accesses.*.role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'tenant_accesses.*.permissions' => ['nullable', 'array'],
            'tenant_accesses.*.permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'tenant_accesses.*.department_ids' => ['nullable', 'array'],
            'tenant_accesses.*.department_ids.*' => ['integer'],
        ]);

        if (isset($data['permissions'])) {
            $this->validateTenantAssignablePermissions($data['permissions']);
        }

        $user = DB::transaction(function () use ($request, $tenant, $data) {
            $user = User::query()->create([
                'tenant_id'         => $tenant->id,
                'name'              => $data['name'],
                'email'             => $data['email'],
                'password'          => Hash::make($data['password']),
                'locale'            => $tenant->locale ?? 'pt',
                'timezone'          => $tenant->timezone ?? 'Africa/Luanda',
                'email_verified_at' => now(),
                'is_active'         => $data['is_active'] ?? true,
            ]);
            $user->assignRole($data['role']);

            if (array_key_exists('permissions', $data)) {
                $user->syncPermissions($data['permissions']);
            }

            if (array_key_exists('tenant_accesses', $data)) {
                $this->syncUserTenantAccesses($request, $user, $data['tenant_accesses'], false);
            }

            return $user;
        });

        $user->load(['roles', 'permissions', 'tenantAccesses.tenant:id,name,slug', 'tenantAccesses.permissionGroup:id,name']);

        return $this->success([
            'id'                 => $user->id,
            'name'               => $user->name,
            'email'              => $user->email,
            'is_active'          => $user->is_active,
            'roles'              => $user->roles->pluck('name')->values(),
            'permissions'        => $user->getAllPermissions()->pluck('name')->values(),
            'direct_permissions' => $user->getDirectPermissions()->pluck('name')->values(),
            'tenant_accesses'    => $this->formatTenantAccesses($user),
        ], 'Utilizador criado com sucesso.', 201);
    }

    public function updateUser(Request $request, Tenant $tenant, User $user): JsonResponse
    {
        $this->authorize('update', $tenant);
        if (! $request->user()->canAccessTenant($tenant->id)) {
            return $this->error('Sem permissão para aceder à empresa solicitada.', 403);
        }

        $belongsToTenant = $user->tenant_id === $tenant->id
            || $user->tenantAccesses()->where('tenant_id', $tenant->id)->exists();

        if (! $belongsToTenant) {
            return $this->error('Utilizador não pertence a esta empresa.', 403);
        }

        if ($user->isSuperAdmin()) {
            return $this->error('Não é possível editar um super-admin.', 403);
        }

        $data = $request->validate([
            'role'          => ['sometimes', 'string', 'in:admin,hr-manager,manager,employee'],
            'is_active'     => ['sometimes', 'boolean'],
            'permissions'   => ['sometimes', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'tenant_accesses' => ['sometimes', 'array'],
            'tenant_accesses.*.tenant_id' => ['required', 'integer', 'exists:tenants,id'],
            'tenant_accesses.*.permission_group_id' => ['nullable', 'integer', 'exists:permission_groups,id'],
            'tenant_accesses.*.role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'tenant_accesses.*.permissions' => ['nullable', 'array'],
            'tenant_accesses.*.permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'tenant_accesses.*.department_ids' => ['nullable', 'array'],
            'tenant_accesses.*.department_ids.*' => ['integer'],
        ]);

        if (isset($data['permissions'])) {
            $this->validateTenantAssignablePermissions($data['permissions']);
        }

        DB::transaction(function () use ($request, $user, $data): void {
            if (array_key_exists('is_active', $data)) {
                $user->update(['is_active' => $data['is_active']]);
            }

            if (array_key_exists('role', $data)) {
                $user->syncRoles([$data['role']]);
            }

            if (array_key_exists('permissions', $data)) {
                $user->syncPermissions($data['permissions']);
            }

            if (array_key_exists('tenant_accesses', $data)) {
                $this->syncUserTenantAccesses($request, $user, $data['tenant_accesses'], false);
            }
        });

        $user->refresh()->load(['roles', 'permissions', 'tenantAccesses.tenant:id,name,slug', 'tenantAccesses.permissionGroup:id,name']);

        return $this->success([
            'id'                 => $user->id,
            'name'               => $user->name,
            'email'              => $user->email,
            'is_active'          => $user->is_active,
            'roles'              => $user->roles->pluck('name')->values(),
            'permissions'        => $user->getAllPermissions()->pluck('name')->values(),
            'direct_permissions' => $user->getDirectPermissions()->pluck('name')->values(),
            'tenant_accesses'    => $this->formatTenantAccesses($user),
        ], 'Utilizador atualizado com sucesso.');
    }

    public function tenantDepartments(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('view', $tenant);
        if (! $request->user()->canAccessTenant($tenant->id)) {
            return $this->error('Sem permissão para aceder à empresa solicitada.', 403);
        }

        $departments = Department::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->orderBy('name')
            ->get(['id', 'name', 'tenant_id']);

        return $this->success($departments);
    }

    public function permissionGroups(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $groups = PermissionGroup::query()
            ->whereNull('tenant_id')
            ->orderBy('name')
            ->get();

        return $this->success($groups);
    }

    public function storePermissionGroup(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('permission_groups', 'name')->whereNull('tenant_id')],
            'description' => ['nullable', 'string', 'max:500'],
            'permissions' => ['required', 'array', 'min:1'],
            'permissions.*' => ['required', 'string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
        ]);

        $this->validateTenantAssignablePermissions($data['permissions']);

        $group = PermissionGroup::query()->create([
            'tenant_id' => null,
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'permissions' => array_values(array_unique($data['permissions'])),
            'created_by' => $request->user()->id,
        ]);

        return $this->success($group, 'Grupo de permissões criado com sucesso.', 201);
    }

    public function updatePermissionGroup(Request $request, PermissionGroup $group): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('permission_groups', 'name')->where('tenant_id', $group->tenant_id)->ignore($group->id)],
            'description' => ['nullable', 'string', 'max:500'],
            'permissions' => ['required', 'array', 'min:1'],
            'permissions.*' => ['required', 'string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
        ]);

        $this->validateTenantAssignablePermissions($data['permissions']);

        $group->update([
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'permissions' => array_values(array_unique($data['permissions'])),
        ]);

        return $this->success($group->fresh(), 'Grupo de permissões atualizado com sucesso.');
    }

    public function destroyPermissionGroup(PermissionGroup $group): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $group->delete();

        return $this->success(null, 'Grupo de permissões eliminado com sucesso.');
    }

    /**
     * @param  array<int, array<string, mixed>>  $tenantAccesses
     */
    private function syncUserTenantAccesses(Request $request, User $user, array $tenantAccesses, bool $isPlatformUser): void
    {
        $actorPermissions = $request->user()->hasRole('super-admin')
            ? null
            : $request->user()->getAllPermissions()->pluck('name')->all();

        $normalized = [];

        foreach ($tenantAccesses as $entry) {
            $tenantId = (int) $entry['tenant_id'];
            $groupId = isset($entry['permission_group_id']) && $entry['permission_group_id'] !== null
                ? (int) $entry['permission_group_id']
                : null;
            $roleName = $entry['role_name'] ?? null;
            $perms = array_key_exists('permissions', $entry) && is_array($entry['permissions'])
                ? array_values(array_unique(array_map('strval', $entry['permissions'])))
                : null;

            if ($groupId === null && $perms === []) {
                $perms = null;
            }

            if ($perms !== null) {
                $this->validateTenantAssignablePermissions($perms);
                if ($isPlatformUser && $actorPermissions !== null && array_diff($perms, $actorPermissions)) {
                    abort(403, 'Não pode atribuir permissões que não possui.');
                }
            }

            $deptIds = array_values(array_unique(array_map('intval', $entry['department_ids'] ?? [])));
            if ($deptIds !== []) {
                $validDeptIds = Department::withoutGlobalScope(TenantScope::class)
                    ->where('tenant_id', $tenantId)
                    ->whereIn('id', $deptIds)
                    ->pluck('id')
                    ->map(fn ($id) => (int) $id)
                    ->all();

                if (count($validDeptIds) !== count($deptIds)) {
                    abort(422, 'Um ou mais departamentos não pertencem à empresa selecionada.');
                }
                $deptIds = $validDeptIds;
            }

            $normalized[$tenantId] = [
                'permission_group_id' => $groupId,
                'role_name' => $roleName,
                'permissions' => $perms,
                'department_ids' => $deptIds === [] ? null : $deptIds,
                'is_exception' => false,
                'is_active' => true,
            ];
        }

        $keepTenantIds = array_keys($normalized);
        $user->tenantAccesses()
            ->where('is_exception', false)
            ->whereNotIn('tenant_id', $keepTenantIds === [] ? [0] : $keepTenantIds)
            ->delete();

        foreach ($normalized as $tenantId => $payload) {
            UserTenantAccess::query()->updateOrCreate(
                ['user_id' => $user->id, 'tenant_id' => $tenantId],
                $payload,
            );
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function formatTenantAccesses(User $user): array
    {
        return $user->tenantAccesses
            ->filter(fn (UserTenantAccess $access) => ! $access->is_exception)
            ->map(fn (UserTenantAccess $access) => [
            'id' => $access->id,
            'tenant_id' => $access->tenant_id,
            'tenant_name' => $access->tenant?->name,
            'tenant_slug' => $access->tenant?->slug,
            'permission_group_id' => $access->permission_group_id,
            'permission_group_name' => $access->permissionGroup?->name,
            'role_name' => $access->role_name,
            'permissions' => $access->permissions,
            'resolved_permissions' => $access->resolvedPermissions(),
            'department_ids' => $access->department_ids ?? [],
        ])->values()->all();
    }

    /**
     * @param  array<int, string>  $requestedPermissions
     */
    private function validateTenantAssignablePermissions(array $requestedPermissions): void
    {
        if (array_intersect($requestedPermissions, self::PLATFORM_ONLY_PERMISSIONS)) {
            abort(403, 'Não é possível atribuir permissões globais da plataforma a utilizadores de empresa.');
        }
    }

    public function destroyUser(Request $request, Tenant $tenant, User $user): JsonResponse
    {
        $this->authorize('update', $tenant);
        if (! $request->user()->canAccessTenant($tenant->id)) {
            return $this->error('Sem permissão para aceder à empresa solicitada.', 403);
        }

        if ($user->tenant_id !== $tenant->id) {
            return $this->error('Utilizador não pertence a esta empresa.', 403);
        }

        if ($user->isSuperAdmin()) {
            return $this->error('Não é possível eliminar um super-admin.', 403);
        }

        $user->tokens()->delete();
        $user->delete();

        return $this->success(null, 'Utilizador eliminado com sucesso.');
    }

    public function updateUserPassword(Request $request, User $user): JsonResponse
    {
        if (! $request->user()->hasRole('super-admin')) {
            return $this->error('Só o super administrador pode alterar palavras-passe de outros utilizadores.', 403);
        }

        $data = $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user->forceFill(['password' => Hash::make($data['password'])])->save();
        $user->tokens()->delete();
        DB::table('password_reset_tokens')->where('email', $user->email)->delete();
        AuditService::record('password_changed_by_super_admin', $user);

        return $this->success(null, 'Palavra-passe do utilizador atualizada com sucesso.');
    }

    public function showTenant(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('view', $tenant);
        if (! $request->user()->canAccessTenant($tenant->id)) {
            return $this->error('Sem permissão para aceder à empresa solicitada.', 403);
        }

        return $this->success(new TenantResource(
            $tenant->loadCount([
                'employees' => fn ($q) => $q->withoutGlobalScope(TenantScope::class),
                'users',
                'departments' => fn ($q) => $q->withoutGlobalScope(TenantScope::class),
            ])
        ));
    }

    public function updateTenant(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('update', $tenant);
        if (! $request->user()->canAccessTenant($tenant->id)) {
            return $this->error('Sem permissão para aceder à empresa solicitada.', 403);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', 'unique:tenants,slug,'.$tenant->id],
            'email' => ['nullable', 'email', 'max:255'],
            'billing_email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'website' => ['nullable', 'url', 'max:255'],
            'tax_id' => ['nullable', 'string', 'max:100'],
            'inss_number' => ['nullable', 'string', 'max:100'],
            'legal_entity_type' => ['nullable', 'string', 'max:50'],
            'economic_sector' => ['nullable', 'string', 'max:150'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:150'],
            'province' => ['nullable', 'string', 'max:150'],
            'country' => ['nullable', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:50'],
            'currency' => ['nullable', 'string', 'size:3'],
            'locale' => ['nullable', 'string', 'max:10'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'status' => ['sometimes', 'in:active,inactive,suspended'],
        ]);

        $tenant->update($data);

        return $this->success(
            new TenantResource($tenant->fresh()),
            'Empresa atualizada com sucesso.',
        );
    }

    public function destroyTenant(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('delete', $tenant);
        if (! $request->user()->canAccessTenant($tenant->id)) {
            return $this->error('Sem permissão para aceder à empresa solicitada.', 403);
        }

        if ($tenant->employees()->withoutGlobalScope(TenantScope::class)->exists()) {
            return $this->error('Não é possível eliminar uma empresa com funcionários associados.', 422);
        }

        $tenant->delete();

        return $this->success(null, 'Empresa eliminada com sucesso.');
    }

    public function relationships(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $relationships = TenantRelationship::query()
            ->with(['managerTenant:id,name,slug,status', 'managedTenant:id,name,slug,status,tax_id'])
            ->when($request->filled('manager_tenant_id'), fn ($q) => $q->where('manager_tenant_id', $request->integer('manager_tenant_id')))
            ->when($request->filled('status'), function ($q) use ($request) {
                $status = (string) $request->string('status');
                if ($status === 'inactive_or_suspended') {
                    $q->whereIn('status', ['inactive', 'suspended']);
                } else {
                    $q->where('status', $status);
                }
            })
            ->latest('id')
            ->get();

        return $this->success($relationships);
    }

    public function attachRelationship(Request $request): JsonResponse
    {
        $this->authorize('update', new Tenant);

        $data = $request->validate([
            'manager_tenant_id' => ['required', 'integer', 'exists:tenants,id'],
            'managed_tenant_id' => ['required_without:managed_tenant_ids', 'integer', 'exists:tenants,id'],
            'managed_tenant_ids' => ['required_without:managed_tenant_id', 'array', 'min:1'],
            'managed_tenant_ids.*' => ['required', 'integer', 'distinct', 'exists:tenants,id'],
            'relationship_type' => ['nullable', 'in:bpo,accounting,consulting,holding,reseller'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'allowed_modules' => ['nullable', 'array'],
            'allowed_modules.*' => ['string'],
        ]);

        $manager = Tenant::query()->findOrFail((int) $data['manager_tenant_id']);
        $managedIds = collect($data['managed_tenant_ids'] ?? [])
            ->when(isset($data['managed_tenant_id']), fn ($c) => $c->push((int) $data['managed_tenant_id']))
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $options = [
            'relationship_type' => $data['relationship_type'] ?? 'bpo',
            'notes' => $data['notes'] ?? null,
            'management_scope' => [
                'can_manage_users' => true,
                'can_manage_settings' => true,
                'can_manage_billing' => false,
                'allowed_modules' => $data['allowed_modules'] ?? null,
            ],
        ];

        $hierarchyService = app(TenantHierarchyService::class);

        $relationships = DB::transaction(function () use ($manager, $managedIds, $request, $options, $hierarchyService) {
            $created = [];
            foreach ($managedIds as $managedId) {
                $managed = Tenant::query()->findOrFail($managedId);
                $rel = $hierarchyService->attachManagedTenant($manager, $managed, $request->user(), $options);
                $created[] = $rel->load(['managerTenant:id,name,slug', 'managedTenant:id,name,slug']);
            }

            return $created;
        });

        if (isset($data['managed_tenant_id']) && ! isset($data['managed_tenant_ids'])) {
            return $this->success($relationships[0], 'Relação entre empresas criada com sucesso.', 201);
        }

        return $this->success([
            'attached_count' => count($relationships),
            'relationships' => $relationships,
        ], 'Empresas vinculadas à empresa gestora com sucesso.', 201);
    }

    public function revokeRelationship(TenantRelationship $relationship): JsonResponse
    {
        $this->authorize('update', new Tenant);

        app(TenantHierarchyService::class)->revokeRelationship($relationship);

        return $this->success(null, 'Relação entre empresas revogada com sucesso.');
    }
}
