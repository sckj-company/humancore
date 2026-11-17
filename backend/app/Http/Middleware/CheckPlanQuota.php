<?php

namespace App\Http\Middleware;

use App\Services\SaaS\PlanEntitlementService;
use App\Services\Tenant\TenantManager;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class CheckPlanQuota
{
    public function __construct(
        private readonly TenantManager $tenantManager,
        private readonly PlanEntitlementService $entitlementService,
    ) {}

    public function handle(Request $request, Closure $next, string $metric): Response
    {
        if (! $request->isMethod('POST')) {
            return $next($request);
        }

        $user = $request->user();
        if (! $user || $user->hasRole('super-admin')) {
            return $next($request);
        }

        $tenant = $this->tenantManager->get();
        if (! $tenant) {
            return $next($request);
        }

        $check = $this->entitlementService->checkQuota($tenant, $metric, 1);
        if (! $check['allowed']) {
            return response()->json([
                'success' => false,
                'data' => null,
                'code' => 'PLAN_QUOTA_EXCEEDED',
                'metric' => $metric,
                'limit' => $check['limit'],
                'used' => $check['used'],
                'message' => $check['message'],
            ], 422);
        }

        return $next($request);
    }
}
