<?php

namespace App\Policies;

use App\Models\Branch;
use App\Models\User;

class BranchPolicy
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
        return $user->can('view_any_branch') || $user->can('view_branch');
    }

    public function view(User $user, Branch $branch): bool
    {
        return $user->can('view_branch');
    }

    public function create(User $user): bool
    {
        return $user->can('create_branch');
    }

    public function update(User $user, Branch $branch): bool
    {
        return $user->can('update_branch');
    }

    public function delete(User $user, Branch $branch): bool
    {
        return $user->can('delete_branch');
    }
}
