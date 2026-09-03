<?php

namespace App\Policies;

use App\Models\EmployeeDocument;
use App\Models\User;

class EmployeeDocumentPolicy
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
        return $user->can('view_any_document') || $user->can('view_document');
    }

    public function view(User $user, EmployeeDocument $document): bool
    {
        if ($user->employee_id === $document->employee_id) {
            return $user->can('view_document');
        }

        return $user->can('view_any_document');
    }

    public function create(User $user): bool
    {
        return $user->can('create_document');
    }

    public function delete(User $user, EmployeeDocument $document): bool
    {
        return $user->can('delete_document');
    }
}
