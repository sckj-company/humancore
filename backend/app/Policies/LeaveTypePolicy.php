<?php

namespace App\Policies;

use App\Models\LeaveType;
use App\Models\User;

class LeaveTypePolicy
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
        return $user->can('view_leave') || $user->can('view_any_leave');
    }

    public function view(User $user, LeaveType $type): bool
    {
        return $user->can('view_leave') || $user->can('view_any_leave');
    }

    public function create(User $user): bool
    {
        return $user->can('manage_leave_types') || $user->can('configure_leave') || $user->can('create_leave');
    }
}
