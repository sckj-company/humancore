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

    public function dashboard(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $totalTenants = Tenant::query()->count();
        $activeTenants = Tenant::query()->where('status', 'active')->count();
        $inactiveTenants = Tenant::query()->where('status', 'inactive')->count();
        $suspendedTenants = Tenant::query()->where('status', 'suspended')->count();
        $totalEmployees = Employee::withoutGlobalScopes()->count();
        $activeEmployees = Employee::withoutGlobalScopes()->where('status', 'active')->count();
        $totalUsers = User::query()->count();
        $superAdmins = User::query()->whereHas('roles', fn ($q) => $q->whereIn('name', ['super-admin', 'super-admin-limited']))->count();

        $tenantTrend = collect(range(11, 0))->map(function ($monthsAgo) {
            $month = now()->startOfMonth()->subMonths($monthsAgo);

            return [
                'month' => $month->format('Y-m'),
                'label' => $month->locale(app()->getLocale())->translatedFormat('M/y'),
                'count' => Tenant::query()
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

        $byTenant = Tenant::query()
            ->withCount('employees')
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
                'suspended_tenants' => $suspendedTenants,
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

        $permissions = Permission::query()
            ->where('guard_name', 'web')
            ->where('name', '!=', 'manage_platform')
            ->whereIn('name', $request->user()->getAllPermissions()->pluck('name'))
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
            'permissions' => ['required', 'array'],
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
        if (! $user->hasRole('super-admin-limited')) {
            return $this->error('Só é possível gerir super-admins limitados.', 403);
        }

        $data = $request->validate([
            'permissions' => ['required', 'array'],
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
        $this->validateAssignablePlatformUserPermissions($request, $data['permissions']);

        DB::transaction(function () use ($request, $user, $data): void {
            $user->syncPermissions($data['permissions']);

            if (array_key_exists('tenant_accesses', $data)) {
                $this->syncUserTenantAccesses($request, $user, $data['tenant_accesses'], true);
            }
        });

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
        if (! $user->hasRole('super-admin-limited')) {
            return $this->error('Só é possível eliminar super-admins limitados.', 403);
        }

        DB::transaction(function () use ($user): void {
            $user->tokens()->delete();
            $user->delete();
        });

        return $this->success(null, 'Super-admin limitado eliminado com sucesso.');
    }

    /**
     * @param  array<int, string>  $requestedPermissions
     */
    private function validateAssignablePlatformUserPermissions(Request $request, array $requestedPermissions): void
    {
        $assignablePermissions = $request->user()->getAllPermissions()
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

        $tenants = Tenant::query()
            ->withCount(['employees', 'users', 'departments'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('name', 'like', "%{$term}%")
                    ->orWhere('slug', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('tax_id', 'like', "%{$term}%");
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderBy($request->string('sort_by', 'created_at'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 20));

        return $this->paginated($tenants->through(fn (Tenant $tenant) => array_merge(
            (new TenantResource($tenant))->resolve(),
            [
                'stats' => [
                    'employees' => $tenant->employees_count,
                    'departments' => $tenant->departments_count,
                    'users' => $tenant->users_count,
                ],
                'created_at' => $tenant->created_at?->toIso8601String(),
                'updated_at' => $tenant->updated_at?->toIso8601String(),
            ],
        )));
    }

    public function storeTenant(Request $request): JsonResponse
    {
        $this->authorize('create', Tenant::class);

        $data = $request->validate([
            'name'               => ['required', 'string', 'max:255'],
            'slug'               => ['required', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', 'unique:tenants,slug'],
            'email'              => ['nullable', 'email', 'max:255'],
            'phone'              => ['nullable', 'string', 'max:50'],
            'tax_id'             => ['nullable', 'string', 'max:100'],
            'address'            => ['nullable', 'string', 'max:500'],
            'city'               => ['nullable', 'string', 'max:150'],
            'country'            => ['nullable', 'string', 'max:100'],
            'currency'           => ['nullable', 'string', 'size:3'],
            'locale'             => ['nullable', 'string', 'max:10'],
            'timezone'           => ['nullable', 'string', 'max:100'],
            'status'             => ['nullable', 'in:active,inactive,suspended'],
            // Admin user (optional)
            'admin_name'         => ['nullable', 'string', 'max:255'],
            'admin_email'        => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'admin_password'     => ['nullable', 'string', 'min:8'],
        ]);

        $tenantData = collect($data)->except(['admin_name', 'admin_email', 'admin_password'])->toArray();
        $tenantData['currency'] = $tenantData['currency'] ?? 'AOA';
        $tenantData['locale']   = $tenantData['locale']   ?? 'pt';
        $tenantData['timezone'] = $tenantData['timezone'] ?? 'Africa/Luanda';
        $tenantData['status']   = $tenantData['status']   ?? 'active';

        $tenant = DB::transaction(function () use ($tenantData, $data) {
            $tenant = Tenant::query()->create($tenantData);

            /** @var TenantManager $manager */
            $manager = app(TenantManager::class);
            $manager->set($tenant);

            // Create admin user if credentials were provided
            if (! empty($data['admin_email'])) {
                $admin = User::query()->create([
                    'tenant_id'         => $tenant->id,
                    'name'              => $data['admin_name'] ?? 'Administrador',
                    'email'             => $data['admin_email'],
                    'password'          => Hash::make($data['admin_password'] ?? 'password'),
                    'locale'            => $tenantData['locale'],
                    'timezone'          => $tenantData['timezone'],
                    'email_verified_at' => now(),
                    'is_active'         => true,
                ]);
                $admin->assignRole('admin');
            }

            // Seed default leave types
            $leaveDefaults = [
                ['name' => 'Férias Anuais',      'code' => 'vacation',    'category' => 'vacation',  'days_per_year' => 22, 'is_paid' => true],
                ['name' => 'Doença',             'code' => 'sick',        'category' => 'sick',      'days_per_year' => 30, 'is_paid' => true],
                ['name' => 'Casamento',          'code' => 'marriage',    'category' => 'family',    'days_per_year' => 3,  'is_paid' => true],
                ['name' => 'Falecimento',        'code' => 'bereavement', 'category' => 'family',    'days_per_year' => 5,  'is_paid' => true],
                ['name' => 'Licença sem Vencimento', 'code' => 'unpaid', 'category' => 'unpaid',   'days_per_year' => 30, 'is_paid' => false],
                ['name' => 'Maternidade',        'code' => 'maternity',   'category' => 'maternity', 'days_per_year' => 90, 'is_paid' => true],
            ];
            foreach ($leaveDefaults as $lt) {
                LeaveType::query()->withoutGlobalScopes()->firstOrCreate(
                    ['tenant_id' => $tenant->id, 'code' => $lt['code']],
                    $lt,
                );
            }

            // Seed default salary components
            $salaryDefaults = [
                ['code' => 'base_salary',         'name' => 'Salário Base',             'type' => 'earning',   'calculation_type' => 'fixed',      'is_mandatory' => true,  'priority' => 10],
                ['code' => 'meal_allowance',      'name' => 'Subsídio de Refeição',     'type' => 'benefit',   'calculation_type' => 'fixed',      'default_value' => 0, 'is_mandatory' => false, 'priority' => 20],
                ['code' => 'transport_allowance', 'name' => 'Subsídio de Transporte',   'type' => 'benefit',   'calculation_type' => 'fixed',      'default_value' => 0, 'is_mandatory' => false, 'priority' => 21],
                ['code' => 'vacation_subsidy',    'name' => 'Subsídio de Férias',       'type' => 'benefit',   'calculation_type' => 'fixed',      'default_value' => 0, 'is_mandatory' => false, 'priority' => 22],
                ['code' => 'christmas_subsidy',   'name' => 'Subsídio de Natal',        'type' => 'benefit',   'calculation_type' => 'fixed',      'default_value' => 0, 'is_mandatory' => false, 'priority' => 23],
                ['code' => 'family_allowance',   'name' => 'Abono de Família',         'type' => 'benefit',   'calculation_type' => 'fixed',      'default_value' => 0, 'is_mandatory' => false, 'priority' => 24],
                ['code' => 'additional_allowance','name' => 'Abono Adicional',          'type' => 'earning',   'calculation_type' => 'fixed',      'default_value' => 0, 'is_mandatory' => false, 'priority' => 25],
                ['code' => 'overtime',            'name' => 'Horas Extraordinárias',    'type' => 'earning',   'calculation_type' => 'formula',    'is_mandatory' => true,  'priority' => 30],
                ['code' => 'inss',                'name' => 'INSS (Funcionário)',        'type' => 'deduction', 'calculation_type' => 'percentage', 'default_value' => 3,    'is_mandatory' => true, 'priority' => 100],
                ['code' => 'irt',                 'name' => 'IRT',                      'type' => 'tax',       'calculation_type' => 'formula',    'is_mandatory' => true,  'priority' => 110],
            ];
            foreach ($salaryDefaults as $sc) {
                SalaryComponent::query()->withoutGlobalScopes()->firstOrCreate(
                    ['tenant_id' => $tenant->id, 'code' => $sc['code']],
                    $sc,
                );
            }

            $manager->clear();

            return $tenant;
        });

        return $this->success(
            new TenantResource($tenant),
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

    public function listTenantUsers(Tenant $tenant): JsonResponse
    {
        $this->authorize('view', $tenant);

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

    public function tenantDepartments(Tenant $tenant): JsonResponse
    {
        $this->authorize('view', $tenant);

        $departments = Department::withoutGlobalScopes()
            ->where('tenant_id', $tenant->id)
            ->orderBy('name')
            ->get(['id', 'name', 'tenant_id']);

        return $this->success($departments);
    }

    public function permissionGroups(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $groups = PermissionGroup::query()
            ->orderBy('name')
            ->get();

        return $this->success($groups);
    }

    public function storePermissionGroup(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', 'unique:permission_groups,name'],
            'description' => ['nullable', 'string', 'max:500'],
            'permissions' => ['required', 'array', 'min:1'],
            'permissions.*' => ['required', 'string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
        ]);

        $this->validateTenantAssignablePermissions($data['permissions']);

        $group = PermissionGroup::query()->create([
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
            'name' => ['required', 'string', 'max:150', Rule::unique('permission_groups', 'name')->ignore($group->id)],
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

            if ($perms !== null) {
                $this->validateTenantAssignablePermissions($perms);
                if ($isPlatformUser && $actorPermissions !== null && array_diff($perms, $actorPermissions)) {
                    abort(403, 'Não pode atribuir permissões que não possui.');
                }
            }

            $deptIds = array_values(array_unique(array_map('intval', $entry['department_ids'] ?? [])));
            if ($deptIds !== []) {
                $validDeptIds = Department::withoutGlobalScopes()
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
            ];
        }

        $keepTenantIds = array_keys($normalized);
        $user->tenantAccesses()->whereNotIn('tenant_id', $keepTenantIds === [] ? [0] : $keepTenantIds)->delete();

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
        return $user->tenantAccesses->map(fn (UserTenantAccess $access) => [
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

    public function destroyUser(Tenant $tenant, User $user): JsonResponse
    {
        $this->authorize('update', $tenant);

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

    public function showTenant(Tenant $tenant): JsonResponse
    {
        $this->authorize('view', $tenant);

        return $this->success(new TenantResource(
            $tenant->loadCount(['employees', 'users', 'departments'])
        ));
    }

    public function updateTenant(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('update', $tenant);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', 'unique:tenants,slug,'.$tenant->id],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'tax_id' => ['nullable', 'string', 'max:100'],
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

    public function destroyTenant(Tenant $tenant): JsonResponse
    {
        $this->authorize('delete', $tenant);

        if ($tenant->employees()->exists()) {
            return $this->error('Não é possível eliminar uma empresa com funcionários associados.', 422);
        }

        $tenant->delete();

        return $this->success(null, 'Empresa eliminada com sucesso.');
    }
}
