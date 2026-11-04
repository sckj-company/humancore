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
        return $user->can('process_payroll') && ! $period->isClosed() && ! in_array($period->status, ['paid', 'cancelled'], true);
    }

    public function approve(User $user, PayrollPeriod $period): bool
    {
        if (! $user->can('approve_payroll')) {
            return false;
        }

        // Legado: período calculado sem erros bloqueantes pode ser aprovado directamente.
        // Novo fluxo: após submissão explícita o período fica em pending_approval.
        return in_array($period->status, ['completed', 'pending_approval'], true);
    }

    public function close(User $user, PayrollPeriod $period): bool
    {
        if (! $user->can('close_payroll')) {
            return false;
        }

        // Fecho é permitido a partir de approved (fluxo novo) ou completed (legado,
        // quando a aprovação não alterou o estado para approved).
        return in_array($period->status, ['approved', 'completed'], true);
    }

    public function reopen(User $user, PayrollPeriod $period): bool
    {
        return $user->can('close_payroll') && in_array($period->status, ['closed'], true);
    }

    public function pay(User $user, PayrollPeriod $period): bool
    {
        return $user->can('close_payroll') && in_array($period->status, ['approved', 'closed'], true);
    }
}
