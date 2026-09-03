<?php

namespace App\Policies;

use App\Models\Setting;
use App\Models\User;

class SettingPolicy
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
        return $user->can('view_any_setting') || $user->can('view_setting');
    }

    public function view(User $user, Setting $setting): bool
    {
        return $user->can('view_setting');
    }

    public function update(User $user, Setting $setting): bool
    {
        return $user->can('update_setting') || $user->can('configure_setting');
    }
}
