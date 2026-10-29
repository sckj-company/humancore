<?php

namespace App\Policies;

use App\Models\EmailTemplate;
use App\Models\User;

class EmailTemplatePolicy
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
        return $user->can('view_any_email-template');
    }

    public function view(User $user, EmailTemplate $template): bool
    {
        return $template->tenant_id === $user->tenant_id;
    }

    public function create(User $user): bool
    {
        return $user->can('create_email-template');
    }

    public function update(User $user, EmailTemplate $template): bool
    {
        return $user->can('update_email-template')
            && $template->tenant_id === $user->tenant_id
            && ! $template->is_system;
    }

    public function delete(User $user, EmailTemplate $template): bool
    {
        return $user->can('delete_email-template')
            && $template->tenant_id === $user->tenant_id
            && ! $template->is_system;
    }
}
