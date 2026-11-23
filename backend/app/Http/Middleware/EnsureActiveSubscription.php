<?php

namespace App\Http\Middleware;

use App\Services\SaaS\PlanEntitlementService;
use App\Services\Tenant\TenantManager;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureActiveSubscription
{
    public function __construct(
        private readonly TenantManager $tenantManager,
        private readonly PlanEntitlementService $entitlementService,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user || $user->isSuperAdmin()) {
            return $next($request);
        }

        $tenant = $this->tenantManager->get();
        if (! $tenant) {
            return $next($request);
        }

        $entitlements = $this->entitlementService->resolve($tenant);
        if (! ($entitlements['is_operational'] ?? false)) {
            $status = $entitlements['status'] ?? 'suspended';

            return response()->json([
                'success' => false,
                'data' => null,
                'code' => 'SUBSCRIPTION_INACTIVE',
                'subscription_status' => $status,
                'message' => match ($status) {
                    'unassigned' => 'Esta empresa não possui um plano ativo atribuído. Contacte o administrador da plataforma.',
                    'pending_payment' => 'A subscrição aguarda confirmação de pagamento.',
                    'suspended', 'expired', 'cancelled' => 'A subscrição desta empresa encontra-se suspensa ou expirada. Regularize o pagamento para continuar.',
                    default => 'A subscrição desta empresa não está operacional.',
                },
            ], 402);
        }

        return $next($request);
    }
}
