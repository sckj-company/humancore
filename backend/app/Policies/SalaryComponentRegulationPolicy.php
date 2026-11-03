<?php

namespace App\Policies;

use App\Models\SalaryComponentRegulation;
use App\Models\User;

class SalaryComponentRegulationPolicy
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
        return $user->can('view_any_salary-component');
    }

    public function view(User $user, SalaryComponentRegulation $salaryComponentRegulation): bool
    {
        return $salaryComponentRegulation->tenant_id === $user->tenant_id
            && $user->can('view_salary-component');
    }

    public function create(User $user): bool
    {
        return $user->can('create_salary-component');
    }

    public function update(User $user, SalaryComponentRegulation $salaryComponentRegulation): bool
    {
        return $salaryComponentRegulation->tenant_id === $user->tenant_id
            && $user->can('update_salary-component');
    }

    public function validate(User $user, SalaryComponentRegulation $salaryComponentRegulation): bool
    {
        return $salaryComponentRegulation->tenant_id === $user->tenant_id
            && $user->can('configure_salary-component');
    }

    public function activate(User $user, SalaryComponentRegulation $salaryComponentRegulation): bool
    {
        return $salaryComponentRegulation->tenant_id === $user->tenant_id
            && $user->can('configure_salary-component');
    }

    public function delete(User $user, SalaryComponentRegulation $salaryComponentRegulation): bool
    {
        return $salaryComponentRegulation->tenant_id === $user->tenant_id
            && $user->can('delete_salary-component');
    }

    public function revoke(User $user, SalaryComponentRegulation $salaryComponentRegulation): bool
    {
        return $salaryComponentRegulation->tenant_id === $user->tenant_id
            && $user->can('configure_salary-component');
    }
}
