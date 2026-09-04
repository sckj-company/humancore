<?php

namespace App\Policies;

use App\Models\OnboardingTask;
use App\Models\User;

class OnboardingTaskPolicy
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
        return $user->can('view_any_training');
    }

    public function view(User $user, OnboardingTask $task): bool
    {
        if ($task->tenant_id !== $user->tenant_id) {
            return false;
        }
        if ($user->can('view_any_training')) {
            return true;
        }
        if ($task->assignee_id === $user->id) {
            return true;
        }
        if ($task->employee_id === $user->employee_id) {
            return true;
        }

        return false;
    }

    public function create(User $user): bool
    {
        return $user->can('create_training');
    }

    public function update(User $user, OnboardingTask $task): bool
    {
        if ($task->tenant_id !== $user->tenant_id) {
            return false;
        }
        if ($user->can('update_training')) {
            return true;
        }
        if ($task->assignee_id === $user->id) {
            return true;
        }

        return false;
    }

    public function delete(User $user, OnboardingTask $task): bool
    {
        return $user->can('delete_training') && $task->tenant_id === $user->tenant_id;
    }
}
