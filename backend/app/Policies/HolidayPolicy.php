<?php

namespace App\Policies;

use App\Models\Holiday;
use App\Models\User;

class HolidayPolicy
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
        return true;
    }

    public function view(User $user, Holiday $holiday): bool
    {
        return true;
    }

    public function create(User $user): bool
    {
        return $user->can('create_holiday')
            || $user->can('create_attendance')
            || $user->can('configure_attendance')
            || $user->can('configure_setting');
    }

    public function update(User $user, Holiday $holiday): bool
    {
        return $user->can('update_holiday')
            || $user->can('update_attendance')
            || $user->can('configure_attendance')
            || $user->can('configure_setting');
    }

    public function delete(User $user, Holiday $holiday): bool
    {
        return $user->can('delete_holiday')
            || $user->can('delete_attendance')
            || $user->can('configure_attendance')
            || $user->can('configure_setting');
    }
}
