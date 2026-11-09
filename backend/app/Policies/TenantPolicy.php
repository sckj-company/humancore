<?php

namespace App\Policies;

use App\Models\Tenant;
use App\Models\User;

class TenantPolicy
{
    public function before(User $user): ?bool
    {
        return null;
    }

    public function viewAny(User $user): bool
    {
        return $user->can('view_any_tenant');
    }

    public function view(User $user, Tenant $tenant): bool
    {
        return $user->tenant_id === $tenant->id || $user->can('view_tenant');
    }

    public function create(User $user): bool
    {
        return $user->can('create_tenant');
    }

    public function update(User $user, Tenant $tenant): bool
    {
        return $user->can('update_tenant');
    }

    public function delete(User $user, Tenant $tenant): bool
    {
        return $user->can('delete_tenant');
    }
}
