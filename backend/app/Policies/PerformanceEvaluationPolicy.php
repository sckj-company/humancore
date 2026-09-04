<?php

namespace App\Policies;

use App\Models\PerformanceEvaluation;
use App\Models\User;

class PerformanceEvaluationPolicy
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
        return $user->can('view_any_performance');
    }

    public function view(User $user, PerformanceEvaluation $evaluation): bool
    {
        if ($user->can('view_performance') && $evaluation->tenant_id === $user->tenant_id) {
            if ($user->can('view_any_performance')) {
                return true;
            }
            if ($evaluation->employee_id === $user->employee_id) {
                return true;
            }
            if ($user->hasRole('manager') && $evaluation->evaluator_id === $user->id) {
                return true;
            }
        }

        return false;
    }

    public function create(User $user): bool
    {
        return $user->can('create_performance');
    }

    public function update(User $user, PerformanceEvaluation $evaluation): bool
    {
        if (! $user->can('update_performance') || $evaluation->tenant_id !== $user->tenant_id) {
            return false;
        }

        if (in_array($evaluation->status, ['approved', 'rejected'], true)) {
            return $user->hasRole('super-admin');
        }

        return true;
    }

    public function delete(User $user, PerformanceEvaluation $evaluation): bool
    {
        return $user->can('delete_performance') && $evaluation->tenant_id === $user->tenant_id;
    }
}
