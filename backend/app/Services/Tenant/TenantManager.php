<?php

namespace App\Services\Tenant;

use App\Models\Tenant;
use RuntimeException;

class TenantManager
{
    protected ?Tenant $current = null;

    public function set(Tenant $tenant): void
    {
        $this->current = $tenant;
        app()->instance('currentTenant', $tenant);
    }

    public function get(): ?Tenant
    {
        return $this->current;
    }

    public function id(): ?int
    {
        return $this->current?->id;
    }

    public function clear(): void
    {
        $this->current = null;
        app()->forgetInstance('currentTenant');
    }

    public function requireTenant(): Tenant
    {
        if (! $this->current) {
            throw new RuntimeException('No tenant context set.');
        }

        return $this->current;
    }

    public function isSet(): bool
    {
        return $this->current !== null;
    }
}
