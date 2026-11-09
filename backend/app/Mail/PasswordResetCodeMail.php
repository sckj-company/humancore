<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class PasswordResetCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public User $user,
        public string $code,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            from: new Address(
                config('services.brevo.sender_email'),
                config('services.brevo.sender_name'),
            ),
            to: [new Address($this->user->email, $this->user->name)],
            subject: 'Código para redefinir a sua palavra-passe',
        );
    }

    public function content(): Content
    {
        $safeName = htmlspecialchars($this->user->name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $ttlMinutes = config('password-reset.code_ttl_minutes');

        return new Content(
            htmlString: "<p>Olá, {$safeName}.</p><p>O seu código para redefinir a palavra-passe é <strong>{$this->code}</strong>.</p><p>O código expira em {$ttlMinutes} minutos. Se não pediu esta alteração, ignore este email.</p>",
            text: 'emails.password-reset-code-text',
            with: [
                'user' => $this->user,
                'code' => $this->code,
                'ttlMinutes' => $ttlMinutes,
            ],
        );
    }
}
