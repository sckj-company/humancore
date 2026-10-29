<?php

namespace App\Policies;

use App\Models\Audit;
use App\Models\User;

class AuditPolicy
{
    public function before(User $user): ?bool
    {
        if ($user->hasRole('super-admin') || $user->hasRole('admin')) {
            return true;
        }

        return null;
    }

    public function viewAny(User $user): bool
    {
        return $user->can('view_audit') || $user->hasRole('hr-manager');
    }

    public function view(User $user, Audit $audit): bool
    {
        return $user->can('view_audit');
    }
}
