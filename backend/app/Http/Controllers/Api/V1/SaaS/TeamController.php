<?php

namespace App\Http\Controllers\Api\V1\SaaS;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Department;
use App\Models\Employee;
use App\Models\PermissionGroup;
use App\Models\TenantInvitation;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Services\SaaS\PlanEntitlementService;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;

class TeamController extends BaseController
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

    public function __construct(
        private readonly TenantManager $tenantManager,
        private readonly PlanEntitlementService $entitlementService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizeTeamManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        $users = User::query()
            ->where(function ($q) use ($tenant) {
                $q->where('tenant_id', $tenant->id)
                    ->orWhereHas('tenantAccesses', fn ($aq) => $aq->where('tenant_id', $tenant->id)->where('is_active', true));
            })
            ->with([
                'roles:id,name',
                'employee:id,first_name,last_name,employee_code',
                'tenantAccesses' => fn ($q) => $q->where('tenant_id', $tenant->id)->with('permissionGroup:id,name'),
            ])
            ->orderBy('name')
            ->get()
            ->map(function (User $u) use ($tenant) {
                $access = $u->tenantAccesses->first();

                return [
                    'id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                    'is_active' => $u->is_active,
                    'is_external_access' => (int) $u->tenant_id !== (int) $tenant->id,
                    'roles' => $u->roles->pluck('name')->values(),
                    'employee' => $u->employee ? [
                        'id' => $u->employee->id,
                        'full_name' => trim($u->employee->first_name.' '.$u->employee->last_name),
                        'employee_code' => $u->employee->employee_code,
                    ] : null,
                    'tenant_access' => $access ? [
                        'id' => $access->id,
                        'role_name' => $access->role_name,
                        'permission_group_id' => $access->permission_group_id,
                        'permission_group_name' => $access->permissionGroup?->name,
                        'permissions' => $access->permissions,
                        'department_ids' => $access->department_ids ?? [],
                    ] : null,
                    'last_login_at' => $u->last_login_at?->toIso8601String(),
                ];
            });

        $invitations = TenantInvitation::query()
            ->where('tenant_id', $tenant->id)
            ->whereNull('accepted_at')
            ->latest('id')
            ->get()
            ->map(fn (TenantInvitation $inv) => [
                'id' => $inv->id,
                'email' => $inv->email,
                'name' => $inv->name,
                'role_name' => $inv->role_name,
                'permission_group_id' => $inv->permission_group_id,
                'token' => $inv->token,
                'expires_at' => $inv->expires_at->toIso8601String(),
                'is_expired' => $inv->expires_at->isPast(),
            ]);

        $groups = PermissionGroup::query()
            ->where(function ($q) use ($tenant) {
                $q->whereNull('tenant_id')->orWhere('tenant_id', $tenant->id);
            })
            ->orderBy('name')
            ->get();

        $permissions = Permission::query()
            ->where('guard_name', 'web')
            ->whereNotIn('name', self::PLATFORM_ONLY_PERMISSIONS)
            ->orderBy('group_name')
            ->orderBy('name')
            ->get(['id', 'name', 'group_name']);

        $departments = Department::query()->orderBy('name')->get(['id', 'name']);

        return $this->success([
            'users' => $users,
            'invitations' => $invitations,
            'permission_groups' => $groups,
            'permissions' => $permissions,
            'departments' => $departments,
            'quota' => $this->entitlementService->checkQuota($tenant, 'max_users', 0),
        ]);
    }

    public function storeUser(Request $request): JsonResponse
    {
        $this->authorizeTeamManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role' => ['required', 'string', 'in:admin,hr-manager,manager,employee'],
            'employee_id' => ['nullable', 'integer'],
            'permission_group_id' => ['nullable', 'integer', 'exists:permission_groups,id'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'department_ids' => ['nullable', 'array'],
            'department_ids.*' => ['integer'],
        ]);

        if (isset($data['permissions']) && array_intersect($data['permissions'], self::PLATFORM_ONLY_PERMISSIONS)) {
            return $this->error('Não é possível atribuir permissões globais da plataforma.', 403);
        }

        if (! empty($data['employee_id'])) {
            $empExists = Employee::query()->where('id', $data['employee_id'])->exists();
            if (! $empExists) {
                return $this->error('Funcionário não pertence à empresa ativa.', 422);
            }
        }

        $user = DB::transaction(function () use ($tenant, $data): User {
            $user = User::query()->create([
                'tenant_id' => $tenant->id,
                'employee_id' => $data['employee_id'] ?? null,
                'name' => $data['name'],
                'email' => $data['email'],
                'password' => Hash::make($data['password']),
                'locale' => $tenant->locale ?? 'pt',
                'timezone' => $tenant->timezone ?? 'Africa/Luanda',
                'email_verified_at' => now(),
                'is_active' => true,
            ]);
            $user->assignRole($data['role']);

            if (! empty($data['permission_group_id']) || ! empty($data['permissions']) || ! empty($data['department_ids'])) {
                UserTenantAccess::query()->create([
                    'user_id' => $user->id,
                    'tenant_id' => $tenant->id,
                    'permission_group_id' => $data['permission_group_id'] ?? null,
                    'role_name' => $data['role'],
                    'permissions' => $data['permissions'] ?? null,
                    'department_ids' => empty($data['department_ids']) ? null : array_values(array_unique(array_map('intval', $data['department_ids']))),
                    'is_active' => true,
                ]);
            }

            return $user;
        });

        $this->entitlementService->clearCacheForTenant($tenant->id);

        return $this->success([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'roles' => $user->getRoleNames(),
        ], 'Utilizador criado com sucesso.', 201);
    }

    public function updateUser(Request $request, User $user): JsonResponse
    {
        $this->authorizeTeamManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        $belongs = (int) $user->tenant_id === (int) $tenant->id
            || $user->tenantAccesses()->where('tenant_id', $tenant->id)->exists();

        if (! $belongs || $user->isSuperAdmin()) {
            return $this->error('Utilizador não pertence a esta empresa ou não pode ser editado aqui.', 403);
        }

        $data = $request->validate([
            'role' => ['sometimes', 'string', 'in:admin,hr-manager,manager,employee'],
            'is_active' => ['sometimes', 'boolean'],
            'permission_group_id' => ['nullable', 'integer', 'exists:permission_groups,id'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'department_ids' => ['nullable', 'array'],
            'department_ids.*' => ['integer'],
        ]);

        if (isset($data['permissions']) && array_intersect($data['permissions'], self::PLATFORM_ONLY_PERMISSIONS)) {
            return $this->error('Não é possível atribuir permissões globais da plataforma.', 403);
        }

        DB::transaction(function () use ($user, $tenant, $data): void {
            if (array_key_exists('is_active', $data) && (int) $user->tenant_id === (int) $tenant->id) {
                $user->update(['is_active' => $data['is_active']]);
            }

            if (array_key_exists('role', $data) && (int) $user->tenant_id === (int) $tenant->id) {
                $user->syncRoles([$data['role']]);
            }

            if (array_key_exists('permission_group_id', $data) || array_key_exists('permissions', $data) || array_key_exists('department_ids', $data)) {
                UserTenantAccess::query()->updateOrCreate(
                    ['user_id' => $user->id, 'tenant_id' => $tenant->id],
                    [
                        'permission_group_id' => $data['permission_group_id'] ?? null,
                        'role_name' => $data['role'] ?? ($user->getRoleNames()->first() ?: 'employee'),
                        'permissions' => $data['permissions'] ?? null,
                        'department_ids' => empty($data['department_ids']) ? null : array_values(array_unique(array_map('intval', $data['department_ids']))),
                        'is_active' => $data['is_active'] ?? true,
                    ],
                );
            }
        });

        return $this->success(null, 'Utilizador atualizado com sucesso.');
    }

    public function invite(Request $request): JsonResponse
    {
        $this->authorizeTeamManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        $data = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'name' => ['nullable', 'string', 'max:255'],
            'role_name' => ['required', 'string', 'in:admin,hr-manager,manager,employee'],
            'permission_group_id' => ['nullable', 'integer', 'exists:permission_groups,id'],
            'department_ids' => ['nullable', 'array'],
            'department_ids.*' => ['integer'],
            'employee_id' => ['nullable', 'integer'],
        ]);

        if (User::query()->where('email', $data['email'])->exists()) {
            return $this->error('Já existe um utilizador registado com este email.', 422);
        }

        $ttl = (int) config('saas.invitation_ttl_hours', 72);

        $invitation = TenantInvitation::query()->updateOrCreate(
            ['tenant_id' => $tenant->id, 'email' => $data['email'], 'accepted_at' => null],
            [
                'name' => $data['name'] ?? null,
                'role_name' => $data['role_name'],
                'permission_group_id' => $data['permission_group_id'] ?? null,
                'department_ids' => empty($data['department_ids']) ? null : array_values(array_unique(array_map('intval', $data['department_ids']))),
                'employee_id' => $data['employee_id'] ?? null,
                'token' => Str::random(64),
                'invited_by' => $request->user()->id,
                'expires_at' => now()->addHours($ttl),
            ],
        );

        return $this->success($invitation, 'Convite criado com sucesso.', 201);
    }

    public function cancelInvitation(Request $request, TenantInvitation $invitation): JsonResponse
    {
        $this->authorizeTeamManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        if ((int) $invitation->tenant_id !== (int) $tenant->id) {
            return $this->error('Convite não pertence a esta empresa.', 403);
        }

        $invitation->delete();

        return $this->success(null, 'Convite cancelado com sucesso.');
    }

    public function showPublicInvitation(string $token): JsonResponse
    {
        $invitation = TenantInvitation::query()
            ->with('tenant:id,name,slug,logo_path')
            ->where('token', $token)
            ->firstOrFail();

        if (! $invitation->isPending()) {
            return $this->error('Este convite expirou ou já foi utilizado.', 422);
        }

        return $this->success([
            'email' => $invitation->email,
            'name' => $invitation->name,
            'role_name' => $invitation->role_name,
            'tenant' => $invitation->tenant,
            'expires_at' => $invitation->expires_at->toIso8601String(),
        ]);
    }

    public function acceptPublicInvitation(Request $request, string $token): JsonResponse
    {
        $invitation = TenantInvitation::query()
            ->with('tenant')
            ->where('token', $token)
            ->firstOrFail();

        if (! $invitation->isPending()) {
            return $this->error('Este convite expirou ou já foi utilizado.', 422);
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        if (User::query()->where('email', $invitation->email)->exists()) {
            return $this->error('Já existe uma conta associada a este email.', 422);
        }

        $tenant = $invitation->tenant;
        $quota = $this->entitlementService->checkQuota($tenant, 'max_users', 1);
        if (! $quota['allowed']) {
            return $this->error($quota['message'] ?? 'Limite de utilizadores atingido.', 422);
        }

        $user = DB::transaction(function () use ($invitation, $tenant, $data): User {
            $user = User::query()->create([
                'tenant_id' => $tenant->id,
                'employee_id' => $invitation->employee_id,
                'name' => $data['name'],
                'email' => $invitation->email,
                'password' => Hash::make($data['password']),
                'locale' => $tenant->locale ?? 'pt',
                'timezone' => $tenant->timezone ?? 'Africa/Luanda',
                'email_verified_at' => now(),
                'is_active' => true,
            ]);
            $user->assignRole($invitation->role_name);

            if ($invitation->permission_group_id || $invitation->department_ids) {
                UserTenantAccess::query()->create([
                    'user_id' => $user->id,
                    'tenant_id' => $tenant->id,
                    'permission_group_id' => $invitation->permission_group_id,
                    'role_name' => $invitation->role_name,
                    'department_ids' => $invitation->department_ids,
                    'is_active' => true,
                ]);
            }

            $invitation->update(['accepted_at' => now()]);

            return $user;
        });

        $this->entitlementService->clearCacheForTenant($tenant->id);

        return $this->success([
            'email' => $user->email,
            'name' => $user->name,
        ], 'Convite aceite com sucesso. Já pode iniciar sessão.', 201);
    }

    public function storePermissionGroup(Request $request): JsonResponse
    {
        $this->authorizeTeamManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        if (! $this->entitlementService->hasFeature($tenant, 'custom_permission_groups')) {
            return $this->error('O plano atual não permite criar grupos de permissões personalizados.', 403);
        }

        $data = $request->validate([
            'name' => [
                'required',
                'string',
                'max:150',
                Rule::unique('permission_groups', 'name')->where('tenant_id', $tenant->id),
            ],
            'description' => ['nullable', 'string', 'max:500'],
            'permissions' => ['required', 'array', 'min:1'],
            'permissions.*' => ['required', 'string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
        ]);

        if (array_intersect($data['permissions'], self::PLATFORM_ONLY_PERMISSIONS)) {
            return $this->error('Não é possível incluir permissões globais da plataforma.', 403);
        }

        $group = PermissionGroup::query()->create([
            'tenant_id' => $tenant->id,
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'permissions' => array_values(array_unique($data['permissions'])),
            'created_by' => $request->user()->id,
        ]);

        return $this->success($group, 'Grupo de permissões criado com sucesso.', 201);
    }

    public function destroyPermissionGroup(Request $request, PermissionGroup $group): JsonResponse
    {
        $this->authorizeTeamManagement($request);
        $tenant = $this->tenantManager->requireTenant();

        if ((int) $group->tenant_id !== (int) $tenant->id) {
            return $this->error('Apenas grupos próprios da empresa podem ser eliminados aqui.', 403);
        }

        $group->delete();

        return $this->success(null, 'Grupo de permissões eliminado com sucesso.');
    }

    private function authorizeTeamManagement(Request $request): void
    {
        $user = $request->user();
        if (! $user) {
            abort(401);
        }

        if ($user->hasRole('super-admin') || $user->hasRole('admin') || $user->can('create_user') || $user->can('update_user')) {
            return;
        }

        abort(403, 'Sem permissão para gerir utilizadores da empresa.');
    }
}
