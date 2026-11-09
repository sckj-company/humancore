<?php

namespace App\Services\Auth;

use App\Models\User;
use App\Services\Audit\AuditService;
use App\Services\Mail\BrevoConfigurationException;
use App\Services\Mail\BrevoMailer;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PasswordResetService
{
    public function __construct(private readonly BrevoMailer $mailer) {}

    public function requestCode(string $email): void
    {
        $this->mailer->assertConfigured();

        $user = User::query()
            ->whereRaw('LOWER(email) = ?', [Str::lower($email)])
            ->first();

        if (! $user) {
            return;
        }

        AuditService::record('password_reset_requested', $user);
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $this->resetTokenRecord($user->email)->updateOrInsert(
            ['email' => $user->email],
            [
                'token' => $this->tokenHash($code),
                'attempts' => 0,
                'created_at' => now(),
            ],
        );

        try {
            $this->mailer->sendPasswordResetCode($user, $code);
        } catch (ConnectionException|RequestException|BrevoConfigurationException $exception) {
            $this->resetTokenRecord($user->email)->delete();

            throw $exception;
        }
    }

    public function verifyCode(string $email, string $code): string
    {
        $user = $this->findUser($email);

        if (! $user) {
            $this->invalidCode();
        }

        $resetToken = bin2hex(random_bytes(32));
        $verification = DB::transaction(function () use ($user, $code, $resetToken): bool {
            $record = $this->resetTokenRecord($user->email)->lockForUpdate()->first();

            if (! $record || $this->isExpired($record->created_at)) {
                $this->resetTokenRecord($user->email)->delete();

                return false;
            }

            if (! hash_equals($record->token, $this->tokenHash($code))) {
                $attempts = $record->attempts + 1;
                if ($attempts >= config('password-reset.max_attempts')) {
                    $this->resetTokenRecord($user->email)->delete();
                } else {
                    $this->resetTokenRecord($user->email)->update(['attempts' => $attempts]);
                }

                return false;
            }

            $this->resetTokenRecord($user->email)->update([
                'token' => $this->tokenHash($resetToken),
                'attempts' => 0,
                'created_at' => now(),
            ]);

            return true;
        });

        if (! $verification) {
            $this->invalidCode();
        }

        return $resetToken;
    }

    public function resetPassword(string $email, string $resetToken, string $password): void
    {
        $user = $this->findUser($email);

        if (! $user) {
            $this->invalidResetToken();
        }

        $updated = DB::transaction(function () use ($user, $resetToken, $password): bool {
            $record = $this->resetTokenRecord($user->email)->lockForUpdate()->first();

            if (! $record || $this->isExpired($record->created_at) || ! hash_equals($record->token, $this->tokenHash($resetToken))) {
                return false;
            }

            $user->forceFill(['password' => Hash::make($password)])->save();
            $user->tokens()->delete();
            $this->resetTokenRecord($user->email)->delete();
            AuditService::record('password_reset_completed', $user);

            return true;
        });

        if (! $updated) {
            $this->invalidResetToken();
        }
    }

    private function findUser(string $email): ?User
    {
        return User::query()
            ->whereRaw('LOWER(email) = ?', [Str::lower($email)])
            ->first();
    }

    private function resetTokenRecord(string $email): Builder
    {
        return DB::table('password_reset_tokens')->where('email', $email);
    }

    private function isExpired(?string $createdAt): bool
    {
        return ! $createdAt || Carbon::parse($createdAt)->addMinutes(config('password-reset.code_ttl_minutes'))->isPast();
    }

    private function tokenHash(string $token): string
    {
        return hash_hmac('sha256', $token, config('app.key'));
    }

    private function invalidCode(): never
    {
        throw ValidationException::withMessages([
            'code' => ['O código é inválido ou expirou. Solicite um novo código.'],
        ]);
    }

    private function invalidResetToken(): never
    {
        throw ValidationException::withMessages([
            'reset_token' => ['A verificação expirou ou é inválida. Solicite um novo código.'],
        ]);
    }
}
