<?php

namespace App\Policies;

use App\Models\Department;
use App\Models\User;

class DepartmentPolicy
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
        return $user->can('view_any_department') || $user->can('view_department');
    }

    public function view(User $user, Department $department): bool
    {
        return $user->can('view_department');
    }

    public function create(User $user): bool
    {
        return $user->can('create_department');
    }

    public function update(User $user, Department $department): bool
    {
        return $user->can('update_department');
    }

    public function delete(User $user, Department $department): bool
    {
        return $user->can('delete_department');
    }
}
