<?php

namespace App\Policies;

use App\Models\Position;
use App\Models\User;

class PositionPolicy
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
        return $user->can('view_any_position') || $user->can('view_position');
    }

    public function view(User $user, Position $position): bool
    {
        return $user->can('view_position');
    }

    public function create(User $user): bool
    {
        return $user->can('create_position');
    }

    public function update(User $user, Position $position): bool
    {
        return $user->can('update_position');
    }

    public function delete(User $user, Position $position): bool
    {
        return $user->can('delete_position');
    }
}
