<?php

namespace App\Policies;

use App\Models\LeaveRequest;
use App\Models\User;

class LeaveRequestPolicy
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
        return $user->can('view_any_leave');
    }

    public function view(User $user, LeaveRequest $leave): bool
    {
        if ($user->employee_id === $leave->employee_id) {
            return $user->can('view_leave');
        }

        return $user->can('view_any_leave');
    }

    public function create(User $user): bool
    {
        return $user->can('create_leave');
    }

    public function approve(User $user, LeaveRequest $leave): bool
    {
        return $user->can('approve_leave');
    }

    public function reject(User $user, LeaveRequest $leave): bool
    {
        return $user->can('reject_leave');
    }

    public function cancel(User $user, LeaveRequest $leave): bool
    {
        if ($leave->status !== 'pending') {
            return false;
        }

        return $user->employee_id === $leave->employee_id || $user->can('approve_leave');
    }
}
