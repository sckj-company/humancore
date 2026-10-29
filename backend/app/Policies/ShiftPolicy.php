<?php

namespace App\Policies;

use App\Models\Shift;
use App\Models\User;

class ShiftPolicy
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
        return $user->can('view_shift');
    }

    public function view(User $user, Shift $shift): bool
    {
        return $user->can('view_shift');
    }

    public function create(User $user): bool
    {
        return $user->can('create_shift');
    }

    public function update(User $user, Shift $shift): bool
    {
        return $user->can('update_shift');
    }

    public function delete(User $user, Shift $shift): bool
    {
        return $user->can('delete_shift');
    }
}
