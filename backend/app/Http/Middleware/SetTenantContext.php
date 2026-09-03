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

        if ($user && $user->tenant_id) {
            $tenant = $user->tenant ?? Tenant::query()->find($user->tenant_id);
            if ($tenant) {
                $this->tenantManager->set($tenant);
                if ($tenant->timezone) {
                    date_default_timezone_set($tenant->timezone);
                    config(['app.timezone' => $tenant->timezone]);
                }
            }
        }

        return $next($request);
    }
}
