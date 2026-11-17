<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Plan;
use App\Models\Tenant;
use App\Models\TenantSubscription;
use App\Services\SaaS\PlanEntitlementService;
use App\Services\SaaS\TenantProvisioningService;
use App\Support\PlanCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class PlanController extends BaseController
{
    public function __construct(
        private readonly PlanEntitlementService $entitlementService,
        private readonly TenantProvisioningService $provisioningService,
    ) {}

    public function catalog(Request $request): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        return $this->success(PlanCatalog::catalogPayload());
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $plans = Plan::query()
            ->withCount(['subscriptions', 'activeSubscriptions'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(function ($sub) use ($term) {
                    $sub->where('name', 'like', "%{$term}%")
                        ->orWhere('slug', 'like', "%{$term}%")
                        ->orWhere('code', 'like', "%{$term}%");
                });
            })
            ->when($request->filled('visibility'), fn ($q) => $q->where('visibility', $request->string('visibility')))
            ->when($request->has('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(fn (Plan $plan) => $this->formatPlan($plan));

        return $this->success($plans);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $data = $this->validatePlanPayload($request);
        $data['created_by'] = $request->user()->id;

        $plan = Plan::query()->create($data);

        return $this->success($this->formatPlan($plan->fresh()), 'Plano criado com sucesso.', 201);
    }

    public function show(Request $request, Plan $plan): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $plan->loadCount(['subscriptions', 'activeSubscriptions']);
        $subscriptions = $plan->subscriptions()
            ->with('tenant:id,name,slug,status,tax_id')
            ->latest('id')
            ->get()
            ->map(fn (TenantSubscription $sub) => [
                'id' => $sub->id,
                'tenant_id' => $sub->tenant_id,
                'tenant' => $sub->tenant,
                'status' => $sub->status,
                'starts_at' => $sub->starts_at?->toIso8601String(),
                'ends_at' => $sub->ends_at?->toIso8601String(),
                'custom_price' => $sub->custom_price,
                'overrides' => $sub->overrides,
                'auto_renew' => $sub->auto_renew,
            ]);

        return $this->success(array_merge($this->formatPlan($plan), [
            'subscriptions' => $subscriptions,
        ]));
    }

    public function update(Request $request, Plan $plan): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $data = $this->validatePlanPayload($request, $plan->id);
        $plan->update($data);

        $tenantIds = $plan->subscriptions()->pluck('tenant_id')->unique()->all();
        foreach ($tenantIds as $tenantId) {
            $this->entitlementService->clearCacheForTenant((int) $tenantId);
        }

        return $this->success($this->formatPlan($plan->fresh()->loadCount(['subscriptions', 'activeSubscriptions'])), 'Plano atualizado com sucesso.');
    }

    public function duplicate(Request $request, Plan $plan): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $copy = $plan->replicate(['slug', 'code']);
        $copy->name = $plan->name.' (Cópia)';
        $copy->slug = Str::slug($copy->name).'-'.Str::lower(Str::random(4));
        $copy->code = $plan->code ? $plan->code.'-COPY-'.Str::upper(Str::random(3)) : null;
        $copy->visibility = 'private';
        $copy->created_by = $request->user()->id;
        $copy->save();

        return $this->success($this->formatPlan($copy), 'Plano duplicado com sucesso.', 201);
    }

    public function destroy(Request $request, Plan $plan): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        if ($plan->activeSubscriptions()->exists()) {
            return $this->error('Não é possível eliminar um plano com subscrições ativas vinculadas.', 422);
        }

        $plan->delete();

        return $this->success(null, 'Plano eliminado com sucesso.');
    }

    public function assignToTenants(Request $request, Plan $plan): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $data = $request->validate([
            'tenant_ids' => ['required', 'array', 'min:1'],
            'tenant_ids.*' => ['required', 'integer', 'exists:tenants,id'],
            'status' => ['sometimes', 'in:active,pending_payment,grace_period,suspended'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
            'auto_renew' => ['sometimes', 'boolean'],
            'custom_price' => ['nullable', 'numeric', 'min:0'],
            'billing_cycle_override' => ['nullable', Rule::in(array_keys(PlanCatalog::BILLING_CYCLES))],
            'overrides' => ['nullable', 'array'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $tenants = Tenant::query()->whereIn('id', $data['tenant_ids'])->get();
        $assigned = [];

        DB::transaction(function () use ($tenants, $plan, $data, $request, &$assigned): void {
            foreach ($tenants as $tenant) {
                $subscription = $this->provisioningService->assignSubscription(
                    $tenant,
                    $plan,
                    collect($data)->except(['tenant_ids'])->toArray(),
                    $request->user()->id,
                );
                $assigned[] = [
                    'tenant_id' => $tenant->id,
                    'tenant_name' => $tenant->name,
                    'subscription_id' => $subscription->id,
                    'status' => $subscription->status,
                ];
            }
        });

        return $this->success([
            'plan_id' => $plan->id,
            'assigned_count' => count($assigned),
            'subscriptions' => $assigned,
        ], 'Plano vinculado às empresas selecionadas com sucesso.');
    }

    public function tenantSubscription(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        return $this->success($this->entitlementService->resolve($tenant, true));
    }

    public function updateTenantSubscription(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorizePlatformAdmin($request);

        $data = $request->validate([
            'plan_id' => ['sometimes', 'integer', 'exists:plans,id'],
            'status' => ['sometimes', 'in:active,pending_payment,past_due,grace_period,suspended,cancelled,expired'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
            'grace_until' => ['nullable', 'date'],
            'auto_renew' => ['sometimes', 'boolean'],
            'custom_price' => ['nullable', 'numeric', 'min:0'],
            'billing_cycle_override' => ['nullable', Rule::in(array_keys(PlanCatalog::BILLING_CYCLES))],
            'overrides' => ['nullable', 'array'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        if (isset($data['plan_id'])) {
            $plan = Plan::query()->findOrFail((int) $data['plan_id']);
            $this->provisioningService->assignSubscription(
                $tenant,
                $plan,
                collect($data)->except(['plan_id'])->toArray(),
                $request->user()->id,
            );
        } else {
            $subscription = $tenant->latestSubscription()->first();
            if (! $subscription) {
                return $this->error('Esta empresa ainda não tem um plano atribuído. Selecione um plano primeiro.', 422);
            }
            $subscription->update($data);
            $this->entitlementService->clearCacheForTenant($tenant->id);
        }

        return $this->success($this->entitlementService->resolve($tenant->fresh(), true), 'Subscrição atualizada com sucesso.');
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePlanPayload(Request $request, ?int $ignoreId = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:150', 'regex:/^[a-z0-9-]+$/', Rule::unique('plans', 'slug')->ignore($ignoreId)],
            'code' => ['nullable', 'string', 'max:80', Rule::unique('plans', 'code')->ignore($ignoreId)],
            'description' => ['nullable', 'string', 'max:1000'],
            'badge_text' => ['nullable', 'string', 'max:60'],
            'visibility' => ['sometimes', 'in:public,private,archived'],
            'is_active' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'billing_cycle' => ['sometimes', Rule::in(array_keys(PlanCatalog::BILLING_CYCLES))],
            'custom_cycle_days' => ['nullable', 'integer', 'min:1', 'max:3650'],
            'currency' => ['sometimes', 'string', 'size:3'],
            'base_price' => ['sometimes', 'numeric', 'min:0'],
            'pricing_model' => ['sometimes', Rule::in(array_keys(PlanCatalog::PRICING_MODELS))],
            'included_employees' => ['sometimes', 'integer', 'min:0'],
            'extra_employee_price' => ['sometimes', 'numeric', 'min:0'],
            'included_managed_tenants' => ['sometimes', 'integer', 'min:0'],
            'extra_managed_tenant_price' => ['sometimes', 'numeric', 'min:0'],
            'setup_fee' => ['sometimes', 'numeric', 'min:0'],
            'trial_days' => ['sometimes', 'integer', 'min:0'],
            'grace_period_days' => ['sometimes', 'integer', 'min:0', 'max:90'],
            'features' => ['required', 'array'],
            'limits' => ['required', 'array'],
            'agency_config' => ['required', 'array'],
            'custom_rules' => ['nullable', 'array'],
        ]);

        if (empty($data['slug'])) {
            $baseSlug = Str::slug($data['name']);
            $slug = $baseSlug ?: 'plan';
            $counter = 1;
            while (Plan::query()->where('slug', $slug)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists()) {
                $slug = "{$baseSlug}-{$counter}";
                $counter++;
            }
            $data['slug'] = $slug;
        }

        // Normaliza chaves desconhecidas ou valores booleanos/numéricos
        $validFeatureKeys = array_keys(PlanCatalog::features());
        $features = PlanCatalog::defaultFeatures();
        foreach ($data['features'] as $k => $v) {
            if (in_array($k, $validFeatureKeys, true)) {
                $features[$k] = (bool) $v;
            }
        }
        $data['features'] = $features;

        $validLimitKeys = array_keys(PlanCatalog::limits());
        $limits = PlanCatalog::defaultLimits();
        foreach ($data['limits'] as $k => $v) {
            if (in_array($k, $validLimitKeys, true)) {
                $limits[$k] = ($v === '' || $v === null) ? null : (is_numeric($v) ? (int) $v : null);
            } elseif ($k === 'hard_limit_behavior' && in_array($v, ['block', 'allow_and_bill_overage'], true)) {
                $limits[$k] = $v;
            }
        }
        $data['limits'] = $limits;

        $agency = array_merge(PlanCatalog::defaultAgencyConfig(), $data['agency_config']);
        $agency['can_manage_other_tenants'] = (bool) ($agency['can_manage_other_tenants'] ?? false);
        $agency['can_create_managed_tenants'] = (bool) ($agency['can_create_managed_tenants'] ?? false);
        $agency['can_link_existing_tenants'] = (bool) ($agency['can_link_existing_tenants'] ?? false);
        $agency['max_managed_tenants'] = ($agency['max_managed_tenants'] === '' || $agency['max_managed_tenants'] === null)
            ? null
            : (int) $agency['max_managed_tenants'];
        $agency['max_hierarchy_depth'] = (int) ($agency['max_hierarchy_depth'] ?? ($agency['can_manage_other_tenants'] ? 1 : 0));
        $agency['quota_scope'] = in_array($agency['quota_scope'] ?? '', ['pooled_under_manager', 'per_managed_tenant'], true)
            ? $agency['quota_scope']
            : 'pooled_under_manager';
        $agency['can_manage_child_users'] = (bool) ($agency['can_manage_child_users'] ?? true);
        $agency['can_customize_child_permissions'] = (bool) ($agency['can_customize_child_permissions'] ?? true);
        $data['agency_config'] = $agency;

        return $data;
    }

    /**
     * @return array<string, mixed>
     */
    private function formatPlan(Plan $plan): array
    {
        return [
            'id' => $plan->id,
            'name' => $plan->name,
            'slug' => $plan->slug,
            'code' => $plan->code,
            'description' => $plan->description,
            'badge_text' => $plan->badge_text,
            'visibility' => $plan->visibility,
            'is_active' => $plan->is_active,
            'sort_order' => $plan->sort_order,
            'billing_cycle' => $plan->billing_cycle,
            'custom_cycle_days' => $plan->custom_cycle_days,
            'currency' => $plan->currency,
            'base_price' => (float) $plan->base_price,
            'pricing_model' => $plan->pricing_model,
            'included_employees' => $plan->included_employees,
            'extra_employee_price' => (float) $plan->extra_employee_price,
            'included_managed_tenants' => $plan->included_managed_tenants,
            'extra_managed_tenant_price' => (float) $plan->extra_managed_tenant_price,
            'setup_fee' => (float) $plan->setup_fee,
            'trial_days' => $plan->trial_days,
            'grace_period_days' => $plan->grace_period_days,
            'features' => $plan->resolvedFeatures(),
            'limits' => $plan->resolvedLimits(),
            'agency_config' => $plan->resolvedAgencyConfig(),
            'custom_rules' => $plan->custom_rules ?? [],
            'subscriptions_count' => $plan->subscriptions_count ?? 0,
            'active_subscriptions_count' => $plan->active_subscriptions_count ?? 0,
            'created_at' => $plan->created_at?->toIso8601String(),
            'updated_at' => $plan->updated_at?->toIso8601String(),
        ];
    }

    private function authorizePlatformAdmin(Request $request): void
    {
        $user = $request->user();
        if (! $user || (! $user->hasRole('super-admin') && ! $user->can('manage_platform'))) {
            abort(403, 'Acesso restrito à gestão global da plataforma.');
        }
    }
}
