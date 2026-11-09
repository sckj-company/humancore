<?php

namespace App\Policies;

use App\Models\Deduction;
use App\Models\User;

class DeductionPolicy
{
    public function before(User $user): ?bool
    {
        if ($user->hasRole('super-admin') || $user->hasRole('admin') || $user->hasRole('hr-manager')) {
            return true;
        }

        return null;
    }

    public function viewAny(User $user): bool
    {
        return $user->can('view_any_deduction');
    }

    public function view(User $user, Deduction $deduction): bool
    {
        return $user->canAccessTenant($deduction->tenant_id)
            && (! $user->isSuperAdmin() || $user->can('view_deduction'));
    }

    public function create(User $user): bool
    {
        return $user->can('create_deduction');
    }

    public function update(User $user, Deduction $deduction): bool
    {
        return $user->can('update_deduction') && $user->canAccessTenant($deduction->tenant_id);
    }

    public function delete(User $user, Deduction $deduction): bool
    {
        return $user->can('delete_deduction') && $user->canAccessTenant($deduction->tenant_id);
    }

    public function approve(User $user, Deduction $deduction): bool
    {
        return $user->can('approve_deduction') && $user->canAccessTenant($deduction->tenant_id);
    }
}
