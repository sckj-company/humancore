<?php

namespace App\Http\Middleware;

use App\Services\SaaS\PlanEntitlementService;
use App\Services\Tenant\TenantManager;
use App\Support\PlanCatalog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPlanFeature
{
    public function __construct(
        private readonly TenantManager $tenantManager,
        private readonly PlanEntitlementService $entitlementService,
    ) {}

    public function handle(Request $request, Closure $next, string $feature): Response
    {
        $user = $request->user();
        if (! $user || $user->isSuperAdmin()) {
            return $next($request);
        }

        $tenant = $this->tenantManager->get();
        if (! $tenant) {
            return $next($request);
        }

        if ($feature === 'can_manage_other_tenants') {
            $entitlements = $this->entitlementService->resolve($tenant);
            $allowed = (bool) ($entitlements['agency']['can_manage_other_tenants'] ?? false);
        } else {
            $allowed = $this->entitlementService->hasFeature($tenant, $feature);
        }

        if (! $allowed) {
            $label = PlanCatalog::features()[$feature]['label'] ?? $feature;

            return response()->json([
                'success' => false,
                'data' => null,
                'code' => 'PLAN_FEATURE_DISABLED',
                'feature' => $feature,
                'message' => "O módulo \"{$label}\" não está disponível no plano atual desta empresa.",
            ], 403);
        }

        return $next($request);
    }
}
