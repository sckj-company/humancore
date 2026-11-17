<?php

namespace App\Services\SaaS;

use App\Models\Tenant;
use App\Models\TenantRelationship;
use App\Models\User;
use App\Models\UserTenantAccess;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TenantHierarchyService
{
    public function __construct(
        private readonly PlanEntitlementService $entitlementService,
        private readonly TenantProvisioningService $provisioningService,
    ) {}

    public function wouldCreateCycle(int $managerTenantId, int $managedTenantId): bool
    {
        if ($managerTenantId === $managedTenantId) {
            return true;
        }

        // Verifica se managedTenantId já é ancestral de managerTenantId
        $visited = [$managerTenantId];
        $currentId = $managerTenantId;

        while (true) {
            $parentId = TenantRelationship::query()
                ->where('managed_tenant_id', $currentId)
                ->where('status', 'active')
                ->value('manager_tenant_id');

            if (! $parentId) {
                return false;
            }

            $parentId = (int) $parentId;
            if ($parentId === $managedTenantId) {
                return true;
            }

            if (in_array($parentId, $visited, true)) {
                return true;
            }

            $visited[] = $parentId;
            $currentId = $parentId;
        }
    }

    public function canUserManagePortfolio(User $user, Tenant $managerTenant): bool
    {
        if ($user->hasRole('super-admin')) {
            return true;
        }

        $entitlements = $this->entitlementService->resolve($managerTenant);
        if (! ($entitlements['is_operational'] ?? false) || ! ($entitlements['agency']['can_manage_other_tenants'] ?? false)) {
            return false;
        }

        if ((int) $user->tenant_id === (int) $managerTenant->id && $user->hasRole('admin')) {
            return true;
        }

        $access = $user->activeTenantAccess($managerTenant->id);
        if (! $access || ! $access->is_active) {
            return false;
        }

        if ($access->role_name === 'admin') {
            return true;
        }

        return in_array('manage_portfolio', $access->resolvedPermissions(), true);
    }

    /**
     * Lista IDs de empresas geridas acessíveis ao utilizador através das empresas gestoras onde atua.
     *
     * @return array<int, int>
     */
    public function accessibleManagedTenantIdsForUser(User $user): array
    {
        if ($user->hasRole('super-admin')) {
            return [];
        }

        $managedIds = [];

        // 1. Se o utilizador é admin/gestor de carteira na sua empresa principal
        if ($user->tenant_id) {
            $homeTenant = $user->relationLoaded('tenant') ? $user->tenant : Tenant::query()->find($user->tenant_id);
            if ($homeTenant && $this->canUserManagePortfolio($user, $homeTenant)) {
                $children = TenantRelationship::query()
                    ->where('manager_tenant_id', $homeTenant->id)
                    ->where('status', 'active')
                    ->pluck('managed_tenant_id')
                    ->map(fn ($id) => (int) $id)
                    ->all();
                $managedIds = array_merge($managedIds, $children);
            }
        }

        // 2. Empresas gestoras onde o utilizador possui UserTenantAccess como admin/gestor
        $accesses = $user->relationLoaded('tenantAccesses')
            ? $user->tenantAccesses
            : $user->tenantAccesses()->with('permissionGroup')->get();

        foreach ($accesses as $access) {
            if (! $access->is_active) {
                continue;
            }

            // Acesso direto concedido via empresa gestora
            if ($access->granted_by_tenant_id) {
                $relActive = TenantRelationship::query()
                    ->where('manager_tenant_id', $access->granted_by_tenant_id)
                    ->where('managed_tenant_id', $access->tenant_id)
                    ->where('status', 'active')
                    ->exists();

                $manager = Tenant::query()->find($access->granted_by_tenant_id);
                if ($relActive && $manager) {
                    $ent = $this->entitlementService->resolve($manager);
                    if (($ent['is_operational'] ?? false) && ($ent['agency']['can_manage_other_tenants'] ?? false)) {
                        $managedIds[] = (int) $access->tenant_id;
                    }
                }
            }

            // Ou se o acesso é como admin de uma empresa que por sua vez é gestora
            if ($access->role_name === 'admin' || in_array('manage_portfolio', $access->resolvedPermissions(), true)) {
                $tenant = Tenant::query()->find($access->tenant_id);
                if ($tenant && $this->canUserManagePortfolio($user, $tenant)) {
                    $children = TenantRelationship::query()
                        ->where('manager_tenant_id', $tenant->id)
                        ->where('status', 'active')
                        ->pluck('managed_tenant_id')
                        ->map(fn ($id) => (int) $id)
                        ->all();
                    $managedIds = array_merge($managedIds, $children);
                }
            }
        }

        return array_values(array_unique(array_map('intval', $managedIds)));
    }

    /**
     * Cria uma nova empresa independente gerida pela Empresa Gestora (não é filial).
     *
     * @param  array<string, mixed>  $data
     */
    public function createManagedTenant(Tenant $managerTenant, User $actor, array $data): Tenant
    {
        $entitlements = $this->entitlementService->resolve($managerTenant, true);
        if (! ($entitlements['is_operational'] ?? false)) {
            abort(402, 'A subscrição da empresa gestora não está ativa.');
        }

        $agency = $entitlements['agency'] ?? [];
        if (! ($agency['can_manage_other_tenants'] ?? false) || ! ($agency['can_create_managed_tenants'] ?? false)) {
            abort(403, 'O plano atual da empresa não permite criar empresas geridas.');
        }

        $quota = $this->entitlementService->checkQuota($managerTenant, 'max_managed_tenants', 1);
        if (! $quota['allowed']) {
            abort(422, $quota['message']);
        }

        if (! empty($data['admin_email'])) {
            $userQuota = $this->entitlementService->checkQuota($managerTenant, 'max_users', 1);
            if (! $userQuota['allowed']) {
                abort(422, $userQuota['message']);
            }
        }

        return DB::transaction(function () use ($managerTenant, $actor, $data): Tenant {
            $tenantData = collect($data)->only([
                'name', 'slug', 'email', 'phone', 'tax_id', 'inss_number',
                'legal_entity_type', 'economic_sector', 'address', 'city',
                'province', 'country', 'postal_code', 'website', 'currency',
                'locale', 'timezone',
            ])->toArray();

            $tenantData['created_by_tenant_id'] = $managerTenant->id;
            $tenantData['origin_type'] = 'agency';
            $tenantData['status'] = 'active';

            $managedTenant = $this->provisioningService->createTenant($tenantData, [
                'admin_name' => $data['admin_name'] ?? null,
                'admin_email' => $data['admin_email'] ?? null,
                'admin_password' => $data['admin_password'] ?? null,
            ]);

            TenantRelationship::query()->create([
                'manager_tenant_id' => $managerTenant->id,
                'managed_tenant_id' => $managedTenant->id,
                'relationship_type' => $data['relationship_type'] ?? 'bpo',
                'status' => 'active',
                'management_scope' => [
                    'can_manage_users' => true,
                    'can_manage_settings' => true,
                    'can_manage_billing' => false,
                    'allowed_modules' => $data['allowed_modules'] ?? null,
                ],
                'notes' => $data['notes'] ?? null,
                'created_by_user_id' => $actor->id,
                'accepted_at' => now(),
            ]);

            $this->entitlementService->clearCacheForTenant($managerTenant->id);
            $this->entitlementService->clearCacheForTenant($managedTenant->id);

            return $managedTenant;
        });
    }

    /**
     * Vincula uma empresa já existente como gerida por uma empresa gestora.
     *
     * @param  array<string, mixed>  $options
     */
    public function attachManagedTenant(Tenant $managerTenant, Tenant $managedTenant, ?User $actor = null, array $options = []): TenantRelationship
    {
        if ($this->wouldCreateCycle($managerTenant->id, $managedTenant->id)) {
            throw ValidationException::withMessages([
                'managed_tenant_id' => ['Esta relação criaria um ciclo na hierarquia de empresas.'],
            ]);
        }

        $entitlements = $this->entitlementService->resolve($managerTenant, true);
        if (! ($entitlements['agency']['can_manage_other_tenants'] ?? false)) {
            throw ValidationException::withMessages([
                'manager_tenant_id' => ['O plano da empresa gestora não permite gerir outras empresas.'],
            ]);
        }

        $alreadyActive = TenantRelationship::query()
            ->where('manager_tenant_id', $managerTenant->id)
            ->where('managed_tenant_id', $managedTenant->id)
            ->where('status', 'active')
            ->exists();

        if (! $alreadyActive) {
            $quota = $this->entitlementService->checkQuota($managerTenant, 'max_managed_tenants', 1);
            if (! $quota['allowed']) {
                throw ValidationException::withMessages([
                    'max_managed_tenants' => [$quota['message']],
                ]);
            }
        }

        // Uma empresa cliente tem apenas uma gestora ativa por vez (para não haver conflito de faturação/limites)
        $otherActiveManager = TenantRelationship::query()
            ->where('managed_tenant_id', $managedTenant->id)
            ->where('manager_tenant_id', '!=', $managerTenant->id)
            ->where('status', 'active')
            ->exists();

        if ($otherActiveManager) {
            throw ValidationException::withMessages([
                'managed_tenant_id' => ['Esta empresa já está vinculada a outra empresa gestora ativa.'],
            ]);
        }

        $relationship = TenantRelationship::query()->updateOrCreate(
            [
                'manager_tenant_id' => $managerTenant->id,
                'managed_tenant_id' => $managedTenant->id,
            ],
            [
                'relationship_type' => $options['relationship_type'] ?? 'bpo',
                'status' => $options['status'] ?? 'active',
                'management_scope' => $options['management_scope'] ?? [
                    'can_manage_users' => true,
                    'can_manage_settings' => true,
                    'can_manage_billing' => false,
                    'allowed_modules' => null,
                ],
                'notes' => $options['notes'] ?? null,
                'created_by_user_id' => $actor?->id,
                'accepted_at' => ($options['status'] ?? 'active') === 'active' ? now() : null,
                'revoked_at' => null,
            ],
        );

        $this->entitlementService->clearCacheForTenant($managerTenant->id);
        $this->entitlementService->clearCacheForTenant($managedTenant->id);

        return $relationship;
    }

    public function revokeRelationship(TenantRelationship $relationship): void
    {
        DB::transaction(function () use ($relationship): void {
            $relationship->update([
                'status' => 'revoked',
                'revoked_at' => now(),
            ]);

            UserTenantAccess::query()
                ->where('tenant_id', $relationship->managed_tenant_id)
                ->where('granted_by_tenant_id', $relationship->manager_tenant_id)
                ->update(['is_active' => false]);
        });

        $this->entitlementService->clearCacheForTenant($relationship->manager_tenant_id);
        $this->entitlementService->clearCacheForTenant($relationship->managed_tenant_id);
    }
}
