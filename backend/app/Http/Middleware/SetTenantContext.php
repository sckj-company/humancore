<?php

namespace App\Http\Middleware;

use App\Models\Tenant;
use App\Services\Tenant\TenantManager;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetTenantContext
{
    public function __construct(private readonly TenantManager $tenantManager) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user) {
            $isSuperAdmin = $user->hasRole('super-admin') || (method_exists($user, 'isSuperAdmin') && $user->isSuperAdmin());
            $requestedTenantId = $request->header('X-Tenant-ID') ?: ($request->query('tenant_id') ?: $request->input('tenant_id'));
            $tenantId = $isSuperAdmin
                ? ($requestedTenantId ?: ($user->tenant_id ?: (Tenant::query()->where('is_active', true)->orderBy('id')->value('id') ?: Tenant::query()->orderBy('id')->value('id'))))
                : $user->tenant_id;

            if ($tenantId) {
                $tenant = ($tenantId === $user->tenant_id && $user->tenant)
                    ? $user->tenant
                    : Tenant::query()->find($tenantId);

                if ($tenant) {
                    $this->tenantManager->set($tenant);
                    if ($tenant->timezone) {
                        date_default_timezone_set($tenant->timezone);
                        config(['app.timezone' => $tenant->timezone]);
                    }
                }
            }
        }

        return $next($request);
    }
}
