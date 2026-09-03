<?php

namespace App\Policies;

use App\Models\Employee;
use App\Models\User;

class EmployeePolicy
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
        return $user->can('view_any_employee');
    }

    public function view(User $user, Employee $employee): bool
    {
        if ($user->can('view_employee')) {
            if ($user->employee_id === $employee->id) {
                return true;
            }

            if ($user->can('view_any_employee')) {
                return true;
            }

            if ($user->hasRole('manager') && $employee->manager_id === $user->employee_id) {
                return true;
            }
        }

        return false;
    }

    public function create(User $user): bool
    {
        return $user->can('create_employee');
    }

    public function update(User $user, Employee $employee): bool
    {
        return $user->can('update_employee');
    }

    public function delete(User $user, Employee $employee): bool
    {
        return $user->can('delete_employee');
    }

    public function restore(User $user, Employee $employee): bool
    {
        return $user->can('restore_employee');
    }

    public function forceDelete(User $user, Employee $employee): bool
    {
        return $user->can('force_delete_employee');
    }
}
