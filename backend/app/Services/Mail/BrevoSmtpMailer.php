<?php

namespace App\Services\Mail;

use App\Mail\PasswordResetCodeMail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

class BrevoSmtpMailer
{
    public function assertConfigured(): void
    {
        if (
            ! config('services.brevo.smtp_username')
            || ! config('services.brevo.smtp_key')
            || ! config('services.brevo.sender_email')
        ) {
            throw new BrevoSmtpConfigurationException('A configuração SMTP da Brevo está incompleta.');
        }
    }

    public function sendPasswordResetCode(User $user, string $code): void
    {
        $this->assertConfigured();

        Mail::mailer('brevo_smtp')->send(new PasswordResetCodeMail(
            user: $user,
            code: $code,
        ));
    }
}
