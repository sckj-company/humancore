<?php

namespace App\Services\Attendance;

use App\Models\AttendanceQrCode;
use Illuminate\Support\Str;

class QrCodeService
{
    public const TTL_SECONDS = 30;

    public const ACTION_CLOCK_IN = 'clock_in';

    public const ACTION_CLOCK_OUT = 'clock_out';

    public function issue(int $employeeId, int $tenantId, string $action, ?string $ip = null, ?string $userAgent = null): AttendanceQrCode
    {
        $hash = hash_hmac('sha256', implode('|', [
            $tenantId,
            $employeeId,
            $action,
            now()->timestamp,
            Str::random(16),
        ]), config('app.key'));

        return AttendanceQrCode::create([
            'tenant_id' => $tenantId,
            'employee_id' => $employeeId,
            'hash' => $hash,
            'action' => $action,
            'ip_address' => $ip,
            'user_agent' => $userAgent ? substr($userAgent, 0, 500) : null,
            'expires_at' => now()->addSeconds(self::TTL_SECONDS),
        ]);
    }

    public function validate(string $hash, int $tenantId): ?AttendanceQrCode
    {
        $code = AttendanceQrCode::query()
            ->where('tenant_id', $tenantId)
            ->where('hash', $hash)
            ->first();

        if (! $code) {
            return null;
        }

        if ($code->isExpired() || $code->isUsed()) {
            return null;
        }

        return $code;
    }

    public function consume(AttendanceQrCode $code): void
    {
        $code->update(['used_at' => now()]);
    }
}
