<?php

namespace App\Services\Mail;

use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class BrevoMailer
{
    public function assertConfigured(): void
    {
        if (! config('services.brevo.api_key') || ! config('services.brevo.sender_email')) {
            throw new BrevoConfigurationException('A configuração da API Brevo está incompleta.');
        }
    }

    /**
     * @throws ConnectionException
     */
    public function sendPasswordResetCode(User $user, string $code): void
    {
        $this->assertConfigured();
        $apiKey = config('services.brevo.api_key');
        $senderEmail = config('services.brevo.sender_email');

        $safeName = htmlspecialchars($user->name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        Http::withHeaders([
            'api-key' => $apiKey,
        ])->timeout(10)->post('https://api.brevo.com/v3/smtp/email', [
            'sender' => [
                'name' => config('services.brevo.sender_name'),
                'email' => $senderEmail,
            ],
            'to' => [
                ['email' => $user->email, 'name' => $user->name],
            ],
            'subject' => 'Código para redefinir a sua palavra-passe',
            'htmlContent' => "<p>Olá, {$safeName}.</p><p>O seu código para redefinir a palavra-passe é <strong>{$code}</strong>.</p><p>O código expira em ".config('password-reset.code_ttl_minutes')." minutos. Se não pediu esta alteração, ignore este email.</p>",
            'textContent' => "Olá, {$user->name}. O seu código para redefinir a palavra-passe é {$code}. O código expira em ".config('password-reset.code_ttl_minutes')." minutos.",
        ])->throw();
    }
}
