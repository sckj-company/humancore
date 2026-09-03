<?php

namespace App\Policies;

use App\Models\PayrollRecord;
use App\Models\User;

class PayrollRecordPolicy
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

    public function view(User $user, PayrollRecord $record): bool
    {
        if ($user->can('view_payslip')) {
            if ($record->employee_id === $user->employee_id) {
                return true;
            }
            if ($user->can('view_any_payslip')) {
                return true;
            }
        }

        return false;
    }
}
