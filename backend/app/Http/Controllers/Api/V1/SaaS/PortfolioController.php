<?php

namespace App\Http\Controllers\Api\V1\SaaS;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\TenantResource;
use App\Models\Department;
use App\Models\Employee;
use App\Models\PayrollPeriod;
use App\Models\PermissionGroup;
use App\Models\Tenant;
use App\Models\TenantRelationship;
use App\Models\User;
use App\Models\UserTenantAccess;
use App\Services\SaaS\PlanEntitlementService;
use App\Services\SaaS\TenantHierarchyService;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PortfolioController extends BaseController
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
        private readonly TenantHierarchyService $hierarchyService,
    ) {}

    public function dashboard(Request $request): JsonResponse
    {
        $manager = $this->resolveAuthorizedManager($request);
        $entitlements = $this->entitlementService->resolve($manager, true);

        $relationships = TenantRelationship::query()
            ->where('manager_tenant_id', $manager->id)
            ->with('managedTenant')
            ->orderByDesc('id')
            ->get();

        $activeManagedIds = $relationships
            ->where('status', 'active')
            ->pluck('managed_tenant_id')
            ->all();

        $employeeCounts = Employee::withoutGlobalScopes()
            ->selectRaw('tenant_id, count(*) as total')
            ->whereIn('tenant_id', $activeManagedIds === [] ? [0] : $activeManagedIds)
            ->groupBy('tenant_id')
            ->pluck('total', 'tenant_id');

        $userCounts = User::query()
            ->selectRaw('tenant_id, count(*) as total')
            ->whereIn('tenant_id', $activeManagedIds === [] ? [0] : $activeManagedIds)
            ->groupBy('tenant_id')
            ->pluck('total', 'tenant_id');

        $pendingPayrolls = PayrollPeriod::withoutGlobalScopes()
            ->selectRaw('tenant_id, count(*) as total')
            ->whereIn('tenant_id', $activeManagedIds === [] ? [0] : $activeManagedIds)
            ->whereIn('status', ['draft', 'processing', 'pending_approval'])
            ->groupBy('tenant_id')
            ->pluck('total', 'tenant_id');

        $items = $relationships->map(function (TenantRelationship $rel) use ($employeeCounts, $userCounts, $pendingPayrolls) {
            $t = $rel->managedTenant;
            if (! $t) {
                return null;
            }

            return [
                'relationship_id' => $rel->id,
                'relationship_type' => $rel->relationship_type,
                'relationship_status' => $rel->status,
                'management_scope' => $rel->management_scope,
                'accepted_at' => $rel->accepted_at?->toIso8601String(),
                'tenant' => (new TenantResource($t))->resolve(),
                'stats' => [
                    'employees' => (int) ($employeeCounts[$t->id] ?? 0),
                    'users' => (int) ($userCounts[$t->id] ?? 0),
                    'pending_payrolls' => (int) ($pendingPayrolls[$t->id] ?? 0),
                ],
            ];
        })->filter()->values();

        return $this->success([
            'manager_tenant' => (new TenantResource($manager))->resolve(),
            'entitlements' => [
                'agency' => $entitlements['agency'] ?? [],
                'limits' => $entitlements['limits'] ?? [],
                'usage' => $entitlements['usage'] ?? [],
                'quota_scope' => $entitlements['quota_scope'] ?? 'pooled_under_manager',
            ],
            'kpis' => [
                'managed_tenants_active' => count($activeManagedIds),
                'max_managed_tenants' => $entitlements['agency']['max_managed_tenants'] ?? null,
                'portfolio_employees' => (int) ($entitlements['usage']['employees'] ?? 0),
                'max_employees' => $entitlements['limits']['max_employees'] ?? null,
                'pending_payrolls_total' => (int) $pendingPayrolls->sum(),
            ],
            'items' => $items,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $manager = $this->resolveAuthorizedManager($request);

        $relationships = TenantRelationship::query()
            ->where('manager_tenant_id', $manager->id)
            ->with('managedTenant')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderByDesc('id')
            ->get()
            ->map(function (TenantRelationship $rel) {
                if (! $rel->managedTenant) {
                    return null;
                }

                return [
                    'relationship_id' => $rel->id,
                    'relationship_type' => $rel->relationship_type,
                    'status' => $rel->status,
                    'management_scope' => $rel->management_scope,
                    'notes' => $rel->notes,
                    'accepted_at' => $rel->accepted_at?->toIso8601String(),
                    'tenant' => (new TenantResource($rel->managedTenant->loadCount(['employees', 'users', 'departments'])))->resolve(),
                    'stats' => [
                        'employees' => $rel->managedTenant->employees_count,
                        'users' => $rel->managedTenant->users_count,
                        'departments' => $rel->managedTenant->departments_count,
                    ],
                ];
            })
            ->filter()
            ->values();

        return $this->success($relationships);
    }

    public function store(Request $request): JsonResponse
    {
        $manager = $this->resolveAuthorizedManager($request);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', 'unique:tenants,slug'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'tax_id' => ['nullable', 'string', 'max:100'],
            'inss_number' => ['nullable', 'string', 'max:100'],
            'legal_entity_type' => ['nullable', 'string', 'max:50'],
            'economic_sector' => ['nullable', 'string', 'max:150'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:150'],
            'province' => ['nullable', 'string', 'max:150'],
            'country' => ['nullable', 'string', 'max:100'],
            'currency' => ['nullable', 'string', 'size:3'],
            'locale' => ['nullable', 'string', 'max:10'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'relationship_type' => ['nullable', 'in:bpo,accounting,consulting,holding,reseller'],
            'allowed_modules' => ['nullable', 'array'],
            'allowed_modules.*' => ['string'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'admin_name' => ['nullable', 'string', 'max:255'],
            'admin_email' => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'admin_password' => ['nullable', 'string', 'min:8'],
        ]);

        if (empty($data['slug'])) {
            $base = Str::slug($data['name']) ?: 'empresa';
            $slug = $base;
            $i = 1;
            while (Tenant::query()->where('slug', $slug)->exists()) {
                $slug = "{$base}-{$i}";
                $i++;
            }
            $data['slug'] = $slug;
        }

        $managedTenant = $this->hierarchyService->createManagedTenant($manager, $request->user(), $data);

        return $this->success(
            (new TenantResource($managedTenant))->resolve(),
            'Empresa gerida criada com sucesso na sua carteira.',
            201,
        );
    }

    public function update(Request $request, Tenant $managedTenant): JsonResponse
    {
        $manager = $this->resolveAuthorizedManager($request);
        $relationship = $this->findOwnedRelationship($manager, $managedTenant);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'tax_id' => ['nullable', 'string', 'max:100'],
            'inss_number' => ['nullable', 'string', 'max:100'],
            'legal_entity_type' => ['nullable', 'string', 'max:50'],
            'economic_sector' => ['nullable', 'string', 'max:150'],
            'address' => ['nullable', 'string', 'max:500'],
            'city' => ['nullable', 'string', 'max:150'],
            'province' => ['nullable', 'string', 'max:150'],
            'status' => ['sometimes', 'in:active,inactive,suspended'],
            'relationship_type' => ['sometimes', 'in:bpo,accounting,consulting,holding,reseller'],
            'allowed_modules' => ['nullable', 'array'],
            'allowed_modules.*' => ['string'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $tenantFields = collect($data)->except(['relationship_type', 'allowed_modules', 'notes'])->toArray();
        if ($tenantFields !== []) {
            $managedTenant->update($tenantFields);
        }

        $relUpdates = [];
        if (array_key_exists('relationship_type', $data)) {
            $relUpdates['relationship_type'] = $data['relationship_type'];
        }
        if (array_key_exists('notes', $data)) {
            $relUpdates['notes'] = $data['notes'];
        }
        if (array_key_exists('allowed_modules', $data)) {
            $scope = $relationship->management_scope ?? [];
            $scope['allowed_modules'] = $data['allowed_modules'];
            $relUpdates['management_scope'] = $scope;
        }
        if ($relUpdates !== []) {
            $relationship->update($relUpdates);
        }

        $this->entitlementService->clearCacheForTenant($managedTenant->id);

        return $this->success([
            'tenant' => (new TenantResource($managedTenant->fresh()))->resolve(),
            'relationship' => $relationship->fresh(),
        ], 'Empresa gerida atualizada com sucesso.');
    }

    public function revoke(Request $request, Tenant $managedTenant): JsonResponse
    {
        $manager = $this->resolveAuthorizedManager($request);
        $relationship = $this->findOwnedRelationship($manager, $managedTenant);

        $this->hierarchyService->revokeRelationship($relationship);

        return $this->success(null, 'Vínculo de gestão revogado com sucesso.');
    }

    public function teamAccesses(Request $request, Tenant $managedTenant): JsonResponse
    {
        $manager = $this->resolveAuthorizedManager($request);
        $this->findOwnedRelationship($manager, $managedTenant);

        // Utilizadores da Empresa Gestora disponíveis para delegação
        $managerUsers = User::query()
            ->where(function ($q) use ($manager) {
                $q->where('tenant_id', $manager->id)
                    ->orWhereHas('tenantAccesses', fn ($aq) => $aq->where('tenant_id', $manager->id)->where('is_active', true));
            })
            ->with(['roles', 'tenantAccesses' => fn ($q) => $q->where('tenant_id', $managedTenant->id)->with('permissionGroup:id,name')])
            ->orderBy('name')
            ->get()
            ->map(function (User $u) {
                $access = $u->tenantAccesses->first();

                return [
                    'user_id' => $u->id,
                    'name' => $u->name,
                    'email' => $u->email,
                    'roles' => $u->getRoleNames(),
                    'access' => $access ? [
                        'id' => $access->id,
                        'is_active' => $access->is_active,
                        'role_name' => $access->role_name,
                        'permission_group_id' => $access->permission_group_id,
                        'permission_group_name' => $access->permissionGroup?->name,
                        'permissions' => $access->permissions,
                        'department_ids' => $access->department_ids ?? [],
                    ] : null,
                ];
            });

        $departments = Department::withoutGlobalScopes()
            ->where('tenant_id', $managedTenant->id)
            ->orderBy('name')
            ->get(['id', 'name']);

        $permissionGroups = PermissionGroup::query()
            ->where(function ($q) use ($manager, $managedTenant) {
                $q->whereNull('tenant_id')
                    ->orWhereIn('tenant_id', [$manager->id, $managedTenant->id]);
            })
            ->orderBy('name')
            ->get(['id', 'tenant_id', 'name', 'description', 'permissions']);

        return $this->success([
            'users' => $managerUsers,
            'departments' => $departments,
            'permission_groups' => $permissionGroups,
        ]);
    }

    public function syncTeamAccess(Request $request, Tenant $managedTenant): JsonResponse
    {
        $manager = $this->resolveAuthorizedManager($request);
        $this->findOwnedRelationship($manager, $managedTenant);

        $entitlements = $this->entitlementService->resolve($manager);
        if (! ($entitlements['agency']['can_manage_child_users'] ?? true)) {
            return $this->error('O plano atual não permite delegar acessos da equipa para empresas geridas.', 403);
        }

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'enabled' => ['required', 'boolean'],
            'role_name' => ['nullable', 'string', 'in:admin,hr-manager,manager,employee'],
            'permission_group_id' => ['nullable', 'integer', 'exists:permission_groups,id'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string', Rule::exists('permissions', 'name')->where('guard_name', 'web')],
            'department_ids' => ['nullable', 'array'],
            'department_ids.*' => ['integer'],
        ]);

        /** @var User $targetUser */
        $targetUser = User::query()->findOrFail($data['user_id']);
        $belongsToManager = (int) $targetUser->tenant_id === (int) $manager->id
            || $targetUser->tenantAccesses()->where('tenant_id', $manager->id)->where('is_active', true)->exists();

        if (! $belongsToManager || $targetUser->isSuperAdmin()) {
            return $this->error('Utilizador não pertence à empresa gestora.', 403);
        }

        if (! $data['enabled']) {
            UserTenantAccess::query()
                ->where('user_id', $targetUser->id)
                ->where('tenant_id', $managedTenant->id)
                ->where('granted_by_tenant_id', $manager->id)
                ->delete();

            return $this->success(null, 'Acesso removido com sucesso.');
        }

        $perms = $data['permissions'] ?? null;
        if (is_array($perms) && array_intersect($perms, self::PLATFORM_ONLY_PERMISSIONS)) {
            return $this->error('Não é permitido atribuir permissões globais da plataforma.', 403);
        }

        $deptIds = array_values(array_unique(array_map('intval', $data['department_ids'] ?? [])));
        if ($deptIds !== []) {
            $validCount = Department::withoutGlobalScopes()
                ->where('tenant_id', $managedTenant->id)
                ->whereIn('id', $deptIds)
                ->count();
            if ($validCount !== count($deptIds)) {
                return $this->error('Um ou mais departamentos não pertencem à empresa gerida.', 422);
            }
        }

        $access = UserTenantAccess::query()->updateOrCreate(
            ['user_id' => $targetUser->id, 'tenant_id' => $managedTenant->id],
            [
                'granted_by_tenant_id' => $manager->id,
                'role_name' => $data['role_name'] ?? 'hr-manager',
                'permission_group_id' => $data['permission_group_id'] ?? null,
                'permissions' => $perms,
                'department_ids' => $deptIds === [] ? null : $deptIds,
                'is_active' => true,
            ],
        );

        return $this->success($access, 'Acesso à empresa gerida atualizado com sucesso.');
    }

    private function resolveAuthorizedManager(Request $request): Tenant
    {
        $tenant = $this->tenantManager->get();
        if (! $tenant) {
            abort(400, 'Selecione uma empresa ativa.');
        }

        $user = $request->user();
        if (! $user || ! $this->hierarchyService->canUserManagePortfolio($user, $tenant)) {
            abort(403, 'Sem permissão para gerir carteira de empresas nesta empresa.');
        }

        return $tenant;
    }

    private function findOwnedRelationship(Tenant $manager, Tenant $managedTenant): TenantRelationship
    {
        $relationship = TenantRelationship::query()
            ->where('manager_tenant_id', $manager->id)
            ->where('managed_tenant_id', $managedTenant->id)
            ->where('status', '!=', 'revoked')
            ->first();

        if (! $relationship) {
            abort(404, 'Esta empresa não pertence à sua carteira de empresas geridas.');
        }

        return $relationship;
    }
}
