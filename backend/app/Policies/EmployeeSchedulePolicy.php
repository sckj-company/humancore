<?php

namespace App\Policies;

use App\Models\EmployeeSchedule;
use App\Models\User;

class EmployeeSchedulePolicy
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
        return $user->can('view_employee_schedule') || $user->hasRole('manager');
    }

    public function view(User $user, EmployeeSchedule $schedule): bool
    {
        return $user->can('view_employee_schedule')
            || $user->employee?->id === $schedule->employee_id;
    }

    public function create(User $user): bool
    {
        return $user->can('create_employee_schedule');
    }

    public function update(User $user, EmployeeSchedule $schedule): bool
    {
        return $user->can('update_employee_schedule');
    }

    public function delete(User $user, EmployeeSchedule $schedule): bool
    {
        return $user->can('delete_employee_schedule');
    }
}
