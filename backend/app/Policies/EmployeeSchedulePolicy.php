<?php

namespace App\Policies;

use App\Models\EmployeeSchedule;
use App\Models\User;

class EmployeeSchedulePolicy
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
        return $user->can('view_employee_schedule')
            || $user->can('view_any_attendance')
            || $user->can('view_attendance')
            || $user->hasRole('manager');
    }

    public function view(User $user, EmployeeSchedule $schedule): bool
    {
        return $user->can('view_employee_schedule')
            || $user->can('view_any_attendance')
            || $user->can('view_attendance')
            || $user->employee?->id === $schedule->employee_id;
    }

    public function create(User $user): bool
    {
        return $user->can('create_employee_schedule') || $user->can('create_attendance') || $user->can('configure_attendance');
    }

    public function update(User $user, EmployeeSchedule $schedule): bool
    {
        return $user->can('update_employee_schedule') || $user->can('update_attendance') || $user->can('configure_attendance');
    }

    public function delete(User $user, EmployeeSchedule $schedule): bool
    {
        return $user->can('delete_employee_schedule') || $user->can('delete_attendance') || $user->can('configure_attendance');
    }
}
