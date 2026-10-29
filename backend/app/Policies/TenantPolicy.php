<?php

namespace App\Policies;

use App\Models\Tenant;
use App\Models\User;

class TenantPolicy
{
    public function before(User $user): ?bool
    {
        if ($user->hasRole('super-admin') || $user->can('manage_platform')) {
            return true;
        }

        return null;
    }

    public function viewAny(User $user): bool
    {
        return $user->hasRole('super-admin') || $user->can('view_any_tenant');
    }

    public function view(User $user, Tenant $tenant): bool
    {
        return $user->hasRole('super-admin') || $user->tenant_id === $tenant->id;
    }

    public function create(User $user): bool
    {
        return $user->hasRole('super-admin') || $user->can('create_tenant');
    }

    public function update(User $user, Tenant $tenant): bool
    {
        return $user->hasRole('super-admin') || $user->can('update_tenant');
    }

    public function delete(User $user, Tenant $tenant): bool
    {
        return $user->hasRole('super-admin') || $user->can('delete_tenant');
    }
}
