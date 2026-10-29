<?php

namespace App\Policies;

use App\Models\Benefit;
use App\Models\User;

class BenefitPolicy
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
        return $user->can('view_any_benefit');
    }

    public function view(User $user, Benefit $benefit): bool
    {
        return $benefit->tenant_id === $user->tenant_id;
    }

    public function create(User $user): bool
    {
        return $user->can('create_benefit');
    }

    public function update(User $user, Benefit $benefit): bool
    {
        return $user->can('update_benefit') && $benefit->tenant_id === $user->tenant_id;
    }

    public function delete(User $user, Benefit $benefit): bool
    {
        return $user->can('delete_benefit') && $benefit->tenant_id === $user->tenant_id;
    }
}
