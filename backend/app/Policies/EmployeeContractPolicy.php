<?php

namespace App\Policies;

use App\Models\EmployeeContract;
use App\Models\User;

class EmployeeContractPolicy
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
        return $user->can('view_any_contract');
    }

    public function view(User $user, EmployeeContract $contract): bool
    {
        if ($user->can('view_contract')) {
            if ($contract->employee_id === $user->employee_id) {
                return true;
            }

            if ($user->can('view_any_contract')) {
                return true;
            }
        }

        return false;
    }

    public function create(User $user): bool
    {
        return $user->can('create_contract');
    }

    public function update(User $user, EmployeeContract $contract): bool
    {
        return $user->can('update_contract');
    }

    public function delete(User $user, EmployeeContract $contract): bool
    {
        return $user->can('delete_contract');
    }
}
