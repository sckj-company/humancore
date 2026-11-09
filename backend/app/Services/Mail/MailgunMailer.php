<?php

namespace App\Services\Mail;

use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

class MailgunMailer
{
    public function assertConfigured(): void
    {
        if (! config('services.mailgun.api_key') || ! config('services.mailgun.domain') || ! config('mail.from.address')) {
            throw new MailgunConfigurationException('A configuração da API Mailgun está incompleta.');
        }

        if (! in_array(config('services.mailgun.region'), ['us', 'eu'], true)) {
            throw new MailgunConfigurationException('A região configurada para a API Mailgun é inválida.');
        }
    }

    /**
     * @throws ConnectionException
     */
    public function sendPasswordResetCode(User $user, string $code): void
    {
        $this->assertConfigured();

        $domain = config('services.mailgun.domain');
        $region = config('services.mailgun.region');
        $apiHost = $region === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
        $senderEmail = config('mail.from.address');
        $senderName = config('mail.from.name', config('app.name'));
        $safeName = htmlspecialchars($user->name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $ttlMinutes = config('password-reset.code_ttl_minutes');
        $text = "Olá, {$user->name}. O seu código para redefinir a palavra-passe é {$code}. O código expira em {$ttlMinutes} minutos.";

        Http::withBasicAuth('api', config('services.mailgun.api_key'))
            ->asForm()
            ->timeout(10)
            ->post("https://{$apiHost}/v3/{$domain}/messages", [
                'from' => "{$senderName} <{$senderEmail}>",
                'to' => $user->email,
                'subject' => 'Código para redefinir a sua palavra-passe',
                'text' => $text,
                'html' => "<p>Olá, {$safeName}.</p><p>O seu código para redefinir a palavra-passe é <strong>{$code}</strong>.</p><p>O código expira em {$ttlMinutes} minutos. Se não pediu esta alteração, ignore este email.</p>",
            ])->throw();
    }
}
