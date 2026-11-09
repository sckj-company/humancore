<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PasswordResetTest extends TestCase
{
    private function configureMailgun(): void
    {
        config([
            'services.mailgun.api_key' => 'test-api-key',
            'services.mailgun.domain' => 'mg.example.test',
            'services.mailgun.region' => 'us',
            'mail.from.address' => 'no-reply@example.test',
            'mail.from.name' => 'HumanCore',
        ]);
    }

    public function test_user_can_request_verify_and_use_a_single_use_password_reset_code(): void
    {
        $this->configureMailgun();
        $user = User::factory()->create([
            'email' => 'recover@example.test',
            'password' => Hash::make('old-password'),
        ]);
        $user->createToken('existing-session');
        $sentCode = null;
        Http::fake(function (ClientRequest $request) use (&$sentCode) {
            $this->assertSame('https://api.mailgun.net/v3/mg.example.test/messages', $request->url());
            $this->assertTrue($request->hasHeader('Authorization', 'Basic '.base64_encode('api:test-api-key')));
            $this->assertSame('HumanCore <no-reply@example.test>', $request->data()['from']);
            preg_match('/\b(\d{6})\b/', $request->data()['html'], $matches);
            $sentCode = $matches[1] ?? null;

            return Http::response(['id' => '<test-message>', 'message' => 'Queued. Thank you.'], 200);
        });

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])
            ->assertOk()
            ->assertJsonPath('success', true);
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
        $this->configureMailgun();
        Http::fake();

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => 'missing@example.test'])
            ->assertOk()
            ->assertJsonPath('message', 'Se o email estiver registado, será enviado um código de verificação.');

        Http::assertNothingSent();
    }

    public function test_mailgun_uses_european_endpoint_when_configured(): void
    {
        $this->configureMailgun();
        config(['services.mailgun.region' => 'eu']);
        $user = User::factory()->create(['email' => 'european-user@example.test']);
        Http::fake();

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])
            ->assertOk();

        Http::assertSent(fn (ClientRequest $request) => $request->url() === 'https://api.eu.mailgun.net/v3/mg.example.test/messages');
    }

    public function test_missing_mailgun_configuration_returns_service_unavailable_without_creating_a_code(): void
    {
        config([
            'services.mailgun.api_key' => null,
            'services.mailgun.domain' => null,
        ]);
        $user = User::factory()->create(['email' => 'no-mail-config@example.test']);

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])
            ->assertServiceUnavailable()
            ->assertJsonPath('message', 'O serviço de email está temporariamente indisponível. Tente novamente mais tarde.');

        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_mailgun_delivery_error_returns_service_unavailable_and_removes_the_code(): void
    {
        $this->configureMailgun();
        $user = User::factory()->create(['email' => 'mailgun-error@example.test']);
        Http::fake([
            'api.mailgun.net/v3/mg.example.test/messages' => Http::response(['message' => 'Forbidden'], 401),
        ]);

        $this->postJson('/api/v1/auth/password-reset/request', ['email' => $user->email])
            ->assertServiceUnavailable();

        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_code_expires_and_is_invalidated_after_too_many_attempts(): void
    {
        $this->configureMailgun();
        Http::fake();
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
