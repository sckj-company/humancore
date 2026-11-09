<?php

namespace Tests\Feature;

use App\Models\User;
use App\Mail\PasswordResetCodeMail;
use App\Services\Mail\BrevoSmtpMailer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Exception\TransportException;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    private function configureBrevoSmtp(): void
    {
        config([
            'services.brevo.smtp_username' => 'test-smtp-login',
            'services.brevo.smtp_key' => 'test-smtp-key',
            'services.brevo.sender_email' => 'no-reply@example.test',
            'services.brevo.sender_name' => 'HumanCore',
            'mail.mailers.brevo_smtp.host' => 'smtp-relay.brevo.com',
            'mail.mailers.brevo_smtp.username' => 'test-smtp-login',
            'mail.mailers.brevo_smtp.password' => 'test-smtp-key',
            'mail.from.address' => 'no-reply@example.test',
            'mail.from.name' => 'HumanCore',
        ]);
    }

    public function test_user_can_request_verify_and_use_a_single_use_password_reset_code(): void
    {
        $this->configureBrevoSmtp();
        $user = User::factory()->create([
            'email' => 'recover@example.test',
            'password' => Hash::make('old-password'),
        ]);
        $user->createToken('existing-session');
        Mail::fake();
        $sentCode = null;

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])
            ->assertOk()
            ->assertJsonPath('success', true);
        Mail::assertSent(PasswordResetCodeMail::class, function (PasswordResetCodeMail $mail) use ($user, &$sentCode): bool {
            $sentCode = $mail->code;

            return $mail->hasTo($user->email)
                && $mail->envelope()->from->address === 'no-reply@example.test';
        });
        $this->assertMatchesRegularExpression('/^\d{6}$/', $sentCode);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);

        $wrongCode = $sentCode === '000000' ? '000001' : '000000';
        $this->postJson('/api/v1/auth/password-reset/verify', [
            'email' => $user->email,
            'code' => $wrongCode,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('code');

        $verified = $this->postJson('/api/v1/auth/password-reset/verify', [
            'email' => $user->email,
            'code' => $sentCode,
        ])->assertOk()
            ->assertJsonStructure(['data' => ['reset_token']]);

        $resetToken = $verified->json('data.reset_token');
        $this->postJson('/api/v1/auth/password-reset/reset', [
            'email' => $user->email,
            'reset_token' => $resetToken,
            'password' => 'new-secure-password',
            'password_confirmation' => 'new-secure-password',
        ])->assertOk();

        $this->assertTrue(Hash::check('new-secure-password', $user->fresh()->password));
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);

        $this->postJson('/api/v1/auth/password-reset/reset', [
            'email' => $user->email,
            'reset_token' => $resetToken,
            'password' => 'another-password',
            'password_confirmation' => 'another-password',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('reset_token');
    }

    public function test_unknown_email_gets_generic_response_without_sending_email(): void
    {
        $this->configureBrevoSmtp();
        Mail::fake();

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => 'missing@example.test'])
            ->assertOk()
            ->assertJsonPath('message', 'Se o email estiver registado, será enviado um código de verificação.');

        Mail::assertNothingSent();
    }

    public function test_missing_brevo_smtp_configuration_returns_service_unavailable_without_creating_a_code(): void
    {
        config([
            'services.brevo.smtp_username' => null,
            'services.brevo.smtp_key' => null,
            'services.brevo.sender_email' => null,
        ]);
        $user = User::factory()->create(['email' => 'no-mail-config@example.test']);

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])
            ->assertServiceUnavailable()
            ->assertJsonPath('message', 'O serviço de email está temporariamente indisponível. Tente novamente mais tarde.');

        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_brevo_smtp_delivery_error_returns_service_unavailable_and_removes_the_code(): void
    {
        $this->configureBrevoSmtp();
        $user = User::factory()->create(['email' => 'brevo-smtp-error@example.test']);
        $mailer = $this->mock(BrevoSmtpMailer::class);
        $mailer->shouldReceive('assertConfigured')->once();
        $mailer->shouldReceive('sendPasswordResetCode')
            ->once()
            ->andThrow(new TransportException('SMTP server unavailable'));

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])
            ->assertServiceUnavailable();

        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_code_expires_and_is_invalidated_after_too_many_attempts(): void
    {
        $this->configureBrevoSmtp();
        Mail::fake();
        $user = User::factory()->create(['email' => 'expired@example.test']);

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])->assertOk();
        DB::table('password_reset_tokens')->where('email', $user->email)->update([
            'created_at' => now()->subMinutes(16),
        ]);

        $this->postJson('/api/v1/auth/password-reset/verify', [
            'email' => $user->email,
            'code' => '123456',
        ])->assertUnprocessable();
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])->assertOk();
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/v1/auth/password-reset/verify', [
                'email' => $user->email,
                'code' => '123456',
            ])->assertUnprocessable();
        }

        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_reset_request_validates_email_and_six_digit_code(): void
    {
        $this->postJson('/api/v1/auth/password-reset/request', ['email' => 'not-an-email'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->postJson('/api/v1/auth/password-reset/verify', [
            'email' => 'user@example.test',
            'code' => '12345',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('code');
    }
}
