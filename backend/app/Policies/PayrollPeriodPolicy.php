<?php

namespace App\Policies;

use App\Models\PayrollPeriod;
use App\Models\User;

class PayrollPeriodPolicy
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

    public function view(User $user, PayrollPeriod $period): bool
    {
        return $user->can('view_payroll');
    }

    public function create(User $user): bool
    {
        return $user->can('create_payroll');
    }

    public function process(User $user, PayrollPeriod $period): bool
    {
        return $user->can('process_payroll') && ! $period->isClosed();
    }

    public function approve(User $user, PayrollPeriod $period): bool
    {
        return $user->can('approve_payroll') && $period->status === 'completed';
    }

    public function close(User $user, PayrollPeriod $period): bool
    {
        return $user->can('close_payroll');
    }
}
