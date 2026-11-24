<?php

namespace App\Http\Controllers\Api\V1\Tenant;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\TenantResource;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TenantController extends BaseController
{
    public function __construct(private readonly TenantManager $tenantManager) {}

    public function current(): JsonResponse
    {
        $tenant = $this->tenantManager->get();

        abort_if(! $tenant, 404, 'Empresa não encontrada.');

        return $this->success(new TenantResource($tenant));
    }

    public function accessible(Request $request): JsonResponse
    {
        $search = trim((string) $request->query('search', ''));
        $status = (string) $request->query('status', 'active');

        $tenants = $request->user()
            ->accessibleTenants(
                $search !== '' ? $search : null,
                $status !== '' ? $status : 'active',
            )
            ->values();

        return $this->success($tenants);
    }
}
