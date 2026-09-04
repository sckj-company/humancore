<?php

namespace App\Policies;

use App\Models\Training;
use App\Models\User;

class TrainingPolicy
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

    public function view(User $user, Training $training): bool
    {
        return $training->tenant_id === $user->tenant_id;
    }

    public function create(User $user): bool
    {
        return $user->can('create_training');
    }

    public function update(User $user, Training $training): bool
    {
        return $user->can('update_training') && $training->tenant_id === $user->tenant_id;
    }

    public function delete(User $user, Training $training): bool
    {
        return $user->can('delete_training') && $training->tenant_id === $user->tenant_id;
    }
}
