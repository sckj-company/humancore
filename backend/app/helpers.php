<?php

use App\Models\Tenant;
use App\Services\Tenant\TenantManager;

if (! function_exists('tenant_id')) {
    function tenant_id(): ?int
    {
        return app(TenantManager::class)->id();
    }
}

if (! function_exists('tenant')) {
    function tenant(): ?Tenant
    {
        return app(TenantManager::class)->get();
    }
}
