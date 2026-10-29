<?php

namespace App\Policies;

use App\Models\AttendanceQrCode;
use App\Models\User;

class AttendanceQrCodePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('view_any_attendance');
    }

    public function view(User $user, AttendanceQrCode $code): bool
    {
        return $user->can('view_attendance') && $code->tenant_id === $user->tenant_id;
    }
}
