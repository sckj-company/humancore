<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Dashboard\ExecutiveDashboardService;
use App\Services\Payroll\CompanyPayrollDossierService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ExecutiveDashboardController extends BaseController
{
    public function __construct(private readonly ExecutiveDashboardService $dashboardService) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizeExecutiveAccess($request);

        $validated = $this->validateParams($request, allowTenantFilters: true);
        $sections = $this->parseSections($request->input('include'));
        $range = $this->dashboardService->resolveDateRange($validated);

        $requestedTenantIds = $this->parseTenantIds($request->input('tenant_ids'));
        $scopedIds = $this->scopedTenantIds($request->user());

        if ($scopedIds !== null && $requestedTenantIds !== null) {
            $unauthorized = array_diff($requestedTenantIds, $scopedIds);
            if ($unauthorized !== []) {
                abort(403, 'Sem permissão para aceder a uma ou mais empresas solicitadas.');
            }
        }

        $effectiveIds = match (true) {
            $requestedTenantIds !== null => $requestedTenantIds,
            $scopedIds !== null => $scopedIds,
            default => null,
        };

        $statusFilter = $validated['status'] ?? null;

        /** @var Collection<int, Tenant> $tenants */
        $tenants = $effectiveIds === []
            ? collect()
            : Tenant::query()
                ->when($effectiveIds !== null, fn ($q) => $q->whereIn('id', $effectiveIds))
                ->when($statusFilter && $statusFilter !== 'all', fn ($q) => $q->where('status', $statusFilter))
                ->orderBy('name')
                ->get();

        $options = $this->extractBuildOptions($validated);
        $fresh = (bool) ($validated['fresh'] ?? false);

        $cacheKey = $this->cacheKey('index', $request->user(), $tenants, $range, $sections, $options);
        if (! $fresh && ($cached = Cache::get($cacheKey)) !== null) {
            $cached['meta']['cached'] = true;

            return $this->success($cached, 'Dashboard executivo gerado com sucesso.');
        }

        $payload = $this->dashboardService->build($tenants, $range, $sections, $options);
        Cache::put($cacheKey, $payload, now()->addSeconds(120));

        return $this->success($payload, 'Dashboard executivo gerado com sucesso.');
    }

    public function company(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorizeExecutiveAccess($request);

        if (! $request->user()->canAccessTenant($tenant->id)) {
            abort(403, 'Sem acesso a esta empresa.');
        }

        $validated = $this->validateParams($request, allowTenantFilters: false);
        $sections = $this->parseSections($request->input('include'));
        $range = $this->dashboardService->resolveDateRange($validated);
        $options = $this->extractBuildOptions($validated);
        $fresh = (bool) ($validated['fresh'] ?? false);

        $tenants = collect([$tenant]);
        $cacheKey = $this->cacheKey("company:{$tenant->id}", $request->user(), $tenants, $range, $sections, $options);

        if (! $fresh && ($cached = Cache::get($cacheKey)) !== null) {
            $cached['meta']['cached'] = true;

            return $this->success($cached, 'Dashboard executivo da empresa gerado com sucesso.');
        }

        $payload = $this->dashboardService->build($tenants, $range, $sections, $options);
        $payload['company_profile'] = $this->formatCompanyProfile($tenant);

        Cache::put($cacheKey, $payload, now()->addSeconds(120));

        return $this->success($payload, 'Dashboard executivo da empresa gerado com sucesso.');
    }

    private function authorizeExecutiveAccess(Request $request): void
    {
        $user = $request->user();
        if (! $user || ! $user->isSuperAdmin()) {
            abort(403, 'Acesso restrito ao Super Administrador.');
        }

        $this->authorize('viewAny', Tenant::class);

        $token = $user->currentAccessToken();
        if ($token !== null && ! $user->tokenCan('executive-dashboard:read')) {
            abort(403, 'Token sem permissão para aceder ao dashboard executivo.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function validateParams(Request $request, bool $allowTenantFilters): array
    {
        $rules = [
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date'],
            'periodicity' => ['nullable', Rule::in(CompanyPayrollDossierService::PERIODICITIES)],
            'year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
            'quarter' => ['nullable', 'integer', 'min:1', 'max:4'],
            'semester' => ['nullable', 'integer', 'min:1', 'max:2'],
            'include' => ['nullable'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
            'audit_scope' => ['nullable', Rule::in(['critical', 'all'])],
            'audit_details' => ['nullable', 'boolean'],
            'fresh' => ['nullable', 'boolean'],
        ];

        if ($allowTenantFilters) {
            $rules['tenant_ids'] = ['nullable'];
            $rules['status'] = ['nullable', Rule::in(['active', 'inactive', 'suspended', 'all'])];
        }

        return $request->validate($rules);
    }

    /**
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    private function extractBuildOptions(array $validated): array
    {
        return [
            'limit' => (int) ($validated['limit'] ?? 15),
            'audit_scope' => $validated['audit_scope'] ?? 'critical',
            'audit_details' => (bool) ($validated['audit_details'] ?? false),
        ];
    }

    /**
     * @return array<int, string>
     */
    private function parseSections(mixed $raw): array
    {
        if ($raw === null || $raw === '' || $raw === []) {
            return ExecutiveDashboardService::SECTIONS;
        }

        $items = is_array($raw)
            ? $raw
            : explode(',', (string) $raw);

        $cleaned = array_values(array_unique(array_filter(
            array_map(fn ($v) => trim((string) $v), $items),
            fn (string $v) => $v !== '',
        )));

        if ($cleaned === []) {
            return ExecutiveDashboardService::SECTIONS;
        }

        $invalid = array_diff($cleaned, ExecutiveDashboardService::SECTIONS);
        if ($invalid !== []) {
            throw ValidationException::withMessages([
                'include' => 'Secção(ões) inválida(s): '.implode(', ', $invalid).'. Valores permitidos: '.implode(', ', ExecutiveDashboardService::SECTIONS).'.',
            ]);
        }

        return $cleaned;
    }

    /**
     * @return array<int, int>|null
     */
    private function parseTenantIds(mixed $raw): ?array
    {
        if (is_array($raw)) {
            $ids = array_values(array_unique(array_filter(array_map('intval', $raw), fn ($id) => $id > 0)));

            return $ids === [] ? null : $ids;
        }

        if (is_string($raw) && trim($raw) !== '') {
            $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', $raw)), fn ($id) => $id > 0)));

            return $ids === [] ? null : $ids;
        }

        return null;
    }

    /**
     * @return array<int, int>|null Null significa acesso global a todas as empresas.
     */
    private function scopedTenantIds(User $user): ?array
    {
        if ($user->hasRole('super-admin')) {
            return null;
        }

        if ($user->hasRole('super-admin-limited') && ! $user->tenantAccesses()->exists()) {
            return null;
        }

        return $user->accessibleTenants()
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * @param  Collection<int, Tenant>  $tenants
     * @param  array<string, mixed>  $range
     * @param  array<int, string>  $sections
     * @param  array<string, mixed>  $options
     */
    private function cacheKey(
        string $prefix,
        User $user,
        Collection $tenants,
        array $range,
        array $sections,
        array $options,
    ): string {
        $fingerprint = [
            'prefix' => $prefix,
            'user_id' => $user->id,
            'tenant_ids' => $tenants->pluck('id')->all(),
            'start' => $range['start_date'],
            'end' => $range['end_date'],
            'periodicity' => $range['periodicity'],
            'sections' => $sections,
            'options' => $options,
        ];

        return 'executive_dashboard:v1:'.sha1((string) json_encode($fingerprint));
    }

    /**
     * @return array<string, mixed>
     */
    private function formatCompanyProfile(Tenant $tenant): array
    {
        $tenant->loadMissing([
            'latestSubscription.plan:id,name,slug,base_price,currency',
            'activeManagerRelationship.managerTenant:id,name,slug',
        ])->loadCount('activeManagedRelationships');

        $sub = $tenant->latestSubscription;
        $manager = $tenant->activeManagerRelationship?->managerTenant;

        return [
            'id' => $tenant->id,
            'name' => $tenant->name,
            'slug' => $tenant->slug,
            'tax_id' => $tenant->tax_id,
            'inss_number' => $tenant->inss_number,
            'legal_entity_type' => $tenant->legal_entity_type,
            'economic_sector' => $tenant->economic_sector,
            'email' => $tenant->email,
            'billing_email' => $tenant->billing_email,
            'phone' => $tenant->phone,
            'address' => $tenant->address,
            'city' => $tenant->city,
            'province' => $tenant->province,
            'country' => $tenant->country,
            'currency' => $tenant->currency ?? 'AOA',
            'timezone' => $tenant->timezone ?? 'Africa/Luanda',
            'status' => $tenant->status,
            'created_at' => $tenant->created_at?->toIso8601String(),
            'managed_tenants_count' => (int) $tenant->active_managed_relationships_count,
            'managed_by' => $manager ? [
                'id' => $manager->id,
                'name' => $manager->name,
                'slug' => $manager->slug,
            ] : null,
            'subscription' => $sub ? [
                'id' => $sub->id,
                'status' => $sub->status,
                'plan_id' => $sub->plan_id,
                'plan_name' => $sub->plan?->name,
                'effective_price' => $sub->effectiveBasePrice(),
                'currency' => $sub->plan?->currency ?? $tenant->currency ?? 'AOA',
                'starts_at' => $sub->starts_at?->toIso8601String(),
                'ends_at' => $sub->ends_at?->toIso8601String(),
                'grace_until' => $sub->grace_until?->toIso8601String(),
                'auto_renew' => (bool) $sub->auto_renew,
            ] : null,
        ];
    }
}
