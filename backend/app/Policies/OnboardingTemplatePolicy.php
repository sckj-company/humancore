<?php

namespace App\Policies;

use App\Models\OnboardingTemplate;
use App\Models\User;

class OnboardingTemplatePolicy
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
        return $user->can('view_any_training') || $user->can('view_any_performance');
    }

    public function view(User $user, OnboardingTemplate $template): bool
    {
        return $template->tenant_id === $user->tenant_id;
    }

    public function create(User $user): bool
    {
        return $user->can('create_training');
    }

    public function update(User $user, OnboardingTemplate $template): bool
    {
        return $user->can('update_training') && $template->tenant_id === $user->tenant_id;
    }

    public function delete(User $user, OnboardingTemplate $template): bool
    {
        return $user->can('delete_training') && $template->tenant_id === $user->tenant_id;
    }
}
