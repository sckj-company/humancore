<?php

namespace App\Policies;

use App\Models\JobOpening;
use App\Models\User;

class JobOpeningPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('view_any_recruitment');
    }

    public function view(User $user, JobOpening $job): bool
    {
        return $user->can('view_recruitment') && $job->tenant_id === $user->tenant_id;
    }

    public function create(User $user): bool
    {
        return $user->can('create_recruitment');
    }

    public function update(User $user, JobOpening $job): bool
    {
        return $user->can('update_recruitment') && $job->tenant_id === $user->tenant_id;
    }

    public function delete(User $user, JobOpening $job): bool
    {
        return $user->can('delete_recruitment') && $job->tenant_id === $user->tenant_id;
    }
}
