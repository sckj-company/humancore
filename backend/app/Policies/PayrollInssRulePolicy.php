<?php

namespace App\Policies;

use App\Models\PayrollInssRule;
use App\Models\User;

class PayrollInssRulePolicy
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
        return $user->can('view_any_payroll');
    }

    public function view(User $user, PayrollInssRule $rule): bool
    {
        return $rule->tenant_id === $user->tenant_id;
    }

    public function create(User $user): bool
    {
        return $user->can('process_payroll') || $user->can('create_salary-component');
    }

    public function update(User $user, PayrollInssRule $rule): bool
    {
        return $rule->tenant_id === $user->tenant_id;
    }

    public function validate(User $user, PayrollInssRule $rule): bool
    {
        return $rule->tenant_id === $user->tenant_id;
    }

    public function activate(User $user, PayrollInssRule $rule): bool
    {
        return $rule->tenant_id === $user->tenant_id;
    }

    public function delete(User $user, PayrollInssRule $rule): bool
    {
        return $rule->tenant_id === $user->tenant_id;
    }

    public function revoke(User $user, PayrollInssRule $rule): bool
    {
        return $rule->tenant_id === $user->tenant_id;
    }
}

