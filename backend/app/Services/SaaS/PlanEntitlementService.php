<?php

namespace App\Services\SaaS;

use App\Models\Branch;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\Tenant;
use App\Models\TenantMonthlyUsage;
use App\Models\TenantRelationship;
use App\Models\TenantSubscription;
use App\Models\User;
use App\Support\PlanCatalog;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class PlanEntitlementService
{
    /**
     * Resolve os direitos efetivos de um tenant, considerando:
     * 1. Subscrição própria ou herdada da Empresa Gestora;
     * 2. Overrides da subscrição;
     * 3. Escopo e profundidade da relação de gestão;
     * 4. Consumo atual (isolado ou em pool da empresa gestora).
     *
     * @return array<string, mixed>
     */
    public function resolve(Tenant $tenant, bool $fresh = false): array
    {
        $cacheKey = "saas.entitlements.tenant.{$tenant->id}";
        $ttl = (int) config('saas.entitlement_cache_ttl', 300);

        if ($fresh) {
            Cache::forget($cacheKey);
        }

        return Cache::remember($cacheKey, $ttl, function () use ($tenant) {
            return $this->computeEntitlements($tenant);
        });
    }

    public function hasFeature(Tenant $tenant, string $feature): bool
    {
        $entitlements = $this->resolve($tenant);

        return (bool) ($entitlements['features'][$feature] ?? false);
    }

    public function isOperational(Tenant $tenant): bool
    {
        $entitlements = $this->resolve($tenant);

        return (bool) ($entitlements['is_operational'] ?? false);
    }

    /**
     * @return array{allowed: bool, limit: int|float|null, used: int|float, remaining: int|float|null, behavior: string, message: ?string}
     */
    public function checkQuota(Tenant $tenant, string $limitKey, int|float $increment = 1): array
    {
        $entitlements = $this->resolve($tenant, true);
        $limits = $entitlements['limits'] ?? [];
        $usage = $entitlements['usage'] ?? [];
        $behavior = (string) ($limits['hard_limit_behavior'] ?? 'block');

        if ($limitKey === 'max_managed_tenants') {
            $max = $entitlements['agency']['max_managed_tenants'] ?? 0;
            $used = (int) ($usage['managed_tenants'] ?? 0);

            if ($max === null || (int) $max < 0) {
                return ['allowed' => true, 'limit' => null, 'used' => $used, 'remaining' => null, 'behavior' => $behavior, 'message' => null];
            }

            $allowed = ($used + $increment) <= (int) $max;

            return [
                'allowed' => $allowed,
                'limit' => (int) $max,
                'used' => $used,
                'remaining' => max(0, (int) $max - $used),
                'behavior' => 'block',
                'message' => $allowed ? null : "Limite do plano atingido: máximo de {$max} empresas geridas.",
            ];
        }

        $max = $limits[$limitKey] ?? null;
        $usageKey = match ($limitKey) {
            'max_employees' => 'employees',
            'max_users' => 'users',
            'max_branches' => 'branches',
            'max_departments' => 'departments',
            'max_storage_mb' => 'storage_mb',
            'max_ocr_requests_per_month' => 'ocr_requests_this_month',
            'max_payroll_runs_per_month' => 'payroll_runs_this_month',
            default => $limitKey,
        };

        $used = $usage[$usageKey] ?? 0;

        if ($max === null || $max === '' || (is_numeric($max) && (float) $max < 0)) {
            return [
                'allowed' => true,
                'limit' => null,
                'used' => $used,
                'remaining' => null,
                'behavior' => $behavior,
                'message' => null,
            ];
        }

        $maxNum = (float) $max;
        $wouldExceed = ($used + $increment) > $maxNum;

        if ($wouldExceed && $behavior === 'allow_and_bill_overage' && in_array($limitKey, ['max_employees', 'max_managed_tenants'], true)) {
            return [
                'allowed' => true,
                'limit' => $maxNum,
                'used' => $used,
                'remaining' => max(0, $maxNum - $used),
                'behavior' => $behavior,
                'message' => null,
            ];
        }

        $label = PlanCatalog::limits()[$limitKey]['label'] ?? $limitKey;

        return [
            'allowed' => ! $wouldExceed,
            'limit' => $maxNum,
            'used' => $used,
            'remaining' => max(0, $maxNum - $used),
            'behavior' => $behavior,
            'message' => $wouldExceed ? "Limite do plano atingido ({$label}: {$used}/{$maxNum})." : null,
        ];
    }

    public function recordMonthlyUsage(int $tenantId, string $field, int $delta = 1): void
    {
        if (! in_array($field, ['ocr_requests', 'payroll_runs'], true)) {
            return;
        }

        $yearMonth = now()->format('Y-m');

        DB::transaction(function () use ($tenantId, $yearMonth, $field, $delta): void {
            $row = TenantMonthlyUsage::query()->firstOrCreate(
                ['tenant_id' => $tenantId, 'year_month' => $yearMonth],
                ['ocr_requests' => 0, 'payroll_runs' => 0],
            );

            $row->increment($field, $delta);
        });

        $this->clearCacheForTenant($tenantId);
    }

    public function clearCacheForTenant(int $tenantId): void
    {
        Cache::forget("saas.entitlements.tenant.{$tenantId}");

        // Limpa também caches de empresas geridas por este tenant
        $childIds = TenantRelationship::query()
            ->where('manager_tenant_id', $tenantId)
            ->pluck('managed_tenant_id')
            ->all();

        foreach ($childIds as $childId) {
            Cache::forget("saas.entitlements.tenant.{$childId}");
        }

        // E caso este tenant seja gerido, limpa o cache do gestor
        $managerIds = TenantRelationship::query()
            ->where('managed_tenant_id', $tenantId)
            ->pluck('manager_tenant_id')
            ->all();

        foreach ($managerIds as $managerId) {
            Cache::forget("saas.entitlements.tenant.{$managerId}");
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function computeEntitlements(Tenant $tenant): array
    {
        $chain = $this->resolveManagementChain($tenant);
        $rootTenant = $chain['root'];
        $depth = $chain['depth'];
        $directRelationship = $chain['direct_relationship'];

        /** @var TenantSubscription|null $subscription */
        $subscription = $tenant->latestSubscription()->with('plan')->first();
        $inheritedFromManager = false;

        if (! $subscription && $rootTenant->id !== $tenant->id) {
            $subscription = $rootTenant->latestSubscription()->with('plan')->first();
            $inheritedFromManager = $subscription !== null;
        }

        if (! $subscription) {
            $requireSubscription = (bool) config('saas.require_subscription', false);
            $features = [];
            foreach (PlanCatalog::features() as $key => $meta) {
                $features[$key] = ! $requireSubscription;
            }
            $limits = array_fill_keys(array_keys(PlanCatalog::limits()), null);
            $limits['hard_limit_behavior'] = 'block';

            return [
                'has_subscription' => false,
                'status' => $requireSubscription ? 'unassigned' : 'unrestricted',
                'is_operational' => ! $requireSubscription && $tenant->status === 'active',
                'is_managed' => $directRelationship !== null,
                'inherited_from_manager' => false,
                'billing_tenant_id' => $rootTenant->id,
                'manager_tenant' => $directRelationship?->managerTenant?->only(['id', 'name', 'slug']),
                'plan' => null,
                'subscription' => null,
                'features' => $features,
                'limits' => $limits,
                'agency' => PlanCatalog::defaultAgencyConfig(),
                'custom_rules' => [],
                'usage' => $this->usageForTenants([$tenant->id], $tenant->id),
                'hierarchy_depth' => $depth,
            ];
        }

        $plan = $subscription->plan;
        $overrides = $subscription->overrides ?? [];

        $features = array_merge(
            $plan ? $plan->resolvedFeatures() : PlanCatalog::defaultFeatures(),
            $overrides['features'] ?? [],
        );

        // Se a relação de gestão restringe módulos para a empresa gerida
        $allowedModules = $directRelationship?->management_scope['allowed_modules'] ?? null;
        if (is_array($allowedModules) && $allowedModules !== []) {
            foreach ($features as $key => $enabled) {
                if (! in_array($key, $allowedModules, true)) {
                    $features[$key] = false;
                }
            }
        }

        $limits = array_merge(
            $plan ? $plan->resolvedLimits() : PlanCatalog::defaultLimits(),
            $overrides['limits'] ?? [],
        );

        $agency = array_merge(
            $plan ? $plan->resolvedAgencyConfig() : PlanCatalog::defaultAgencyConfig(),
            $overrides['agency_config'] ?? [],
        );

        $maxDepth = (int) ($agency['max_hierarchy_depth'] ?? 0);
        if (! ($agency['can_manage_other_tenants'] ?? false) || $depth >= $maxDepth) {
            $agency['can_manage_other_tenants'] = false;
            $agency['can_create_managed_tenants'] = false;
            $agency['can_link_existing_tenants'] = false;
        }

        $customRules = array_merge(
            $plan?->custom_rules ?? [],
            $overrides['custom_rules'] ?? [],
        );

        $quotaScope = (string) ($agency['quota_scope'] ?? 'pooled_under_manager');
        $poolOwner = $inheritedFromManager ? $rootTenant : $tenant;
        $poolTenantIds = $quotaScope === 'pooled_under_manager'
            ? $this->collectPortfolioTenantIds($poolOwner->id)
            : [$tenant->id];

        $isOperational = $subscription->isOperational() && $tenant->status === 'active';
        if ($directRelationship && $rootTenant->status !== 'active') {
            $isOperational = false;
        }

        return [
            'has_subscription' => true,
            'status' => $subscription->status,
            'is_operational' => $isOperational,
            'is_managed' => $directRelationship !== null,
            'inherited_from_manager' => $inheritedFromManager,
            'billing_tenant_id' => $rootTenant->id,
            'manager_tenant' => $directRelationship?->managerTenant ? [
                'id' => $directRelationship->managerTenant->id,
                'name' => $directRelationship->managerTenant->name,
                'slug' => $directRelationship->managerTenant->slug,
            ] : null,
            'plan' => $plan ? [
                'id' => $plan->id,
                'name' => $plan->name,
                'slug' => $plan->slug,
                'code' => $plan->code,
                'billing_cycle' => $subscription->effectiveBillingCycle(),
                'currency' => $plan->currency,
                'base_price' => $subscription->effectiveBasePrice(),
                'pricing_model' => $plan->pricing_model,
            ] : null,
            'subscription' => [
                'id' => $subscription->id,
                'status' => $subscription->status,
                'starts_at' => $subscription->starts_at?->toIso8601String(),
                'ends_at' => $subscription->ends_at?->toIso8601String(),
                'grace_until' => $subscription->grace_until?->toIso8601String(),
                'auto_renew' => $subscription->auto_renew,
                'custom_price' => $subscription->custom_price,
                'overrides' => $subscription->overrides,
            ],
            'features' => $features,
            'limits' => $limits,
            'agency' => $agency,
            'custom_rules' => $customRules,
            'usage' => $this->usageForTenants($poolTenantIds, $tenant->id),
            'quota_scope' => $quotaScope,
            'pooled_tenant_ids' => $poolTenantIds,
            'hierarchy_depth' => $depth,
        ];
    }

    /**
     * @return array{root: Tenant, depth: int, direct_relationship: ?TenantRelationship}
     */
    private function resolveManagementChain(Tenant $tenant): array
    {
        $visited = [$tenant->id];
        $current = $tenant;
        $depth = 0;
        $directRelationship = null;

        while (true) {
            $rel = TenantRelationship::query()
                ->with('managerTenant')
                ->where('managed_tenant_id', $current->id)
                ->where('status', 'active')
                ->latest('id')
                ->first();

            if (! $rel || ! $rel->managerTenant || in_array($rel->managerTenant->id, $visited, true)) {
                break;
            }

            if ($depth === 0) {
                $directRelationship = $rel;
            }

            $visited[] = $rel->managerTenant->id;
            $current = $rel->managerTenant;
            $depth++;
        }

        return [
            'root' => $current,
            'depth' => $depth,
            'direct_relationship' => $directRelationship,
        ];
    }

    /**
     * @return array<int, int>
     */
    private function collectPortfolioTenantIds(int $rootTenantId): array
    {
        $allIds = [$rootTenantId];
        $queue = [$rootTenantId];

        while ($queue !== []) {
            $parentId = array_shift($queue);
            $children = TenantRelationship::query()
                ->where('manager_tenant_id', $parentId)
                ->where('status', 'active')
                ->pluck('managed_tenant_id')
                ->map(fn ($id) => (int) $id)
                ->all();

            foreach ($children as $childId) {
                if (! in_array($childId, $allIds, true)) {
                    $allIds[] = $childId;
                    $queue[] = $childId;
                }
            }
        }

        return $allIds;
    }

    /**
     * @param  array<int, int>  $tenantIds
     * @return array<string, int|float>
     */
    private function usageForTenants(array $tenantIds, int $subjectTenantId): array
    {
        $employees = Employee::withoutGlobalScopes()->whereIn('tenant_id', $tenantIds)->count();
        $users = User::query()
            ->where(function ($q) use ($tenantIds) {
                $q->whereIn('tenant_id', $tenantIds)
                    ->orWhereHas('tenantAccesses', fn ($aq) => $aq->whereIn('tenant_id', $tenantIds)->where('is_active', true));
            })
            ->distinct('users.id')
            ->count('users.id');
        $branches = Branch::withoutGlobalScopes()->whereIn('tenant_id', $tenantIds)->count();
        $departments = Department::withoutGlobalScopes()->whereIn('tenant_id', $tenantIds)->count();
        $storageBytes = (int) EmployeeDocument::withoutGlobalScopes()->whereIn('tenant_id', $tenantIds)->sum('file_size');
        $yearMonth = now()->format('Y-m');
        $ocrRequests = (int) TenantMonthlyUsage::query()->whereIn('tenant_id', $tenantIds)->where('year_month', $yearMonth)->sum('ocr_requests');
        $payrollRuns = (int) TenantMonthlyUsage::query()->whereIn('tenant_id', $tenantIds)->where('year_month', $yearMonth)->sum('payroll_runs');
        $managedTenants = TenantRelationship::query()
            ->where('manager_tenant_id', $subjectTenantId)
            ->where('status', 'active')
            ->count();

        return [
            'employees' => $employees,
            'users' => $users,
            'branches' => $branches,
            'departments' => $departments,
            'storage_mb' => round($storageBytes / 1048576, 2),
            'ocr_requests_this_month' => $ocrRequests,
            'payroll_runs_this_month' => $payrollRuns,
            'managed_tenants' => $managedTenants,
        ];
    }
}
