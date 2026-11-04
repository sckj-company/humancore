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
        return $table->tenant_id === $user->tenant_id;
    }

    public function create(User $user): bool
    {
        return $user->can('process_payroll') || $user->can('create_salary-component');
    }

    public function update(User $user, PayrollIrtTable $table): bool
    {
        return $table->tenant_id === $user->tenant_id;
    }

    public function validate(User $user, PayrollIrtTable $table): bool
    {
        return $table->tenant_id === $user->tenant_id;
    }

    public function activate(User $user, PayrollIrtTable $table): bool
    {
        return $table->tenant_id === $user->tenant_id;
    }

    public function delete(User $user, PayrollIrtTable $table): bool
    {
        return $table->tenant_id === $user->tenant_id;
    }

    public function revoke(User $user, PayrollIrtTable $table): bool
    {
        return $table->tenant_id === $user->tenant_id;
    }
}

