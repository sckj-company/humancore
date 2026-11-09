<?php

namespace App\Policies;

use App\Models\PayrollIrtTable;
use App\Models\User;

class PayrollIrtTablePolicy
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

    public function view(User $user, PayrollIrtTable $table): bool
    {
        return $user->canAccessTenant($table->tenant_id)
            && (! $user->isSuperAdmin() || $user->can('view_payroll'));
    }

    public function create(User $user): bool
    {
        return $user->isSuperAdmin()
            ? $user->can('configure_payroll')
            : ($user->can('process_payroll') || $user->can('create_salary-component'));
    }

    public function update(User $user, PayrollIrtTable $table): bool
    {
        return $user->canAccessTenant($table->tenant_id)
            && (! $user->isSuperAdmin() || $user->can('configure_payroll'));
    }

    public function validate(User $user, PayrollIrtTable $table): bool
    {
        return $user->canAccessTenant($table->tenant_id)
            && (! $user->isSuperAdmin() || $user->can('approve_payroll') || $user->can('configure_payroll'));
    }

    public function activate(User $user, PayrollIrtTable $table): bool
    {
        return $user->canAccessTenant($table->tenant_id)
            && (! $user->isSuperAdmin() || $user->can('configure_payroll'));
    }

    public function delete(User $user, PayrollIrtTable $table): bool
    {
        return $user->canAccessTenant($table->tenant_id)
            && (! $user->isSuperAdmin() || $user->can('delete_payroll'));
    }

    public function revoke(User $user, PayrollIrtTable $table): bool
    {
        return $user->canAccessTenant($table->tenant_id)
            && (! $user->isSuperAdmin() || $user->can('configure_payroll'));
    }
}
