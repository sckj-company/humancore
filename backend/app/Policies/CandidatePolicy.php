<?php

namespace App\Policies;

use App\Models\Candidate;
use App\Models\User;

class CandidatePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('view_any_recruitment');
    }

    public function view(User $user, Candidate $candidate): bool
    {
        return $user->can('view_recruitment') && $candidate->tenant_id === $user->tenant_id;
    }

    public function create(User $user): bool
    {
        return $user->can('create_recruitment');
    }

    public function update(User $user, Candidate $candidate): bool
    {
        return $user->can('update_recruitment') && $candidate->tenant_id === $user->tenant_id;
    }

    public function delete(User $user, Candidate $candidate): bool
    {
        return $user->can('delete_recruitment') && $candidate->tenant_id === $user->tenant_id;
    }
}
