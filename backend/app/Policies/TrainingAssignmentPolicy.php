<?php

namespace App\Policies;

use App\Models\TrainingAssignment;
use App\Models\User;

class TrainingAssignmentPolicy
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

    public function view(User $user, TrainingAssignment $assignment): bool
    {
        if ($assignment->tenant_id !== $user->tenant_id) {
            return false;
        }
        if ($user->can('view_any_training')) {
            return true;
        }
        if ($assignment->employee_id === $user->employee_id) {
            return true;
        }

        return false;
    }

    public function create(User $user): bool
    {
        return $user->can('create_training');
    }

    public function update(User $user, TrainingAssignment $assignment): bool
    {
        if ($assignment->tenant_id !== $user->tenant_id) {
            return false;
        }

        return $user->can('update_training') || $assignment->employee_id === $user->employee_id;
    }

    public function delete(User $user, TrainingAssignment $assignment): bool
    {
        return $user->can('delete_training') && $assignment->tenant_id === $user->tenant_id;
    }
}
