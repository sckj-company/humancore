<?php

namespace App\Policies;

use App\Models\Shift;
use App\Models\User;

class ShiftPolicy
{
    public function before(User $user): ?bool
    {
        if ($user->hasRole('super-admin') || (! $user->hasTenantScopedAccess() && ($user->hasRole('admin') || $user->hasRole('hr-manager')))) {
            return true;
        }

        return null;
    }

    public function viewAny(User $user): bool
    {
        return $user->can('view_shift') || $user->can('view_any_attendance') || $user->can('view_attendance');
    }

    public function view(User $user, Shift $shift): bool
    {
        return $user->can('view_shift') || $user->can('view_any_attendance') || $user->can('view_attendance');
    }

    public function create(User $user): bool
    {
        return $user->can('create_shift') || $user->can('create_attendance') || $user->can('configure_attendance');
    }

    public function update(User $user, Shift $shift): bool
    {
        return $user->can('update_shift') || $user->can('update_attendance') || $user->can('configure_attendance');
    }

    public function delete(User $user, Shift $shift): bool
    {
        return $user->can('delete_shift') || $user->can('delete_attendance') || $user->can('configure_attendance');
    }
}
