<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
    }

    protected function makeUser(array $overrides = []): User
    {
        $tenant = Tenant::factory()->create();

        return User::factory()->create(array_merge([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ], $overrides));
    }

    public function test_login_returns_token_and_user(): void
    {
        $this->makeUser(['email' => 'login@test.com']);
        app(TenantManager::class)->clear();

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'login@test.com',
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure([
                'data' => ['access_token', 'token_type', 'user' => ['id', 'email', 'roles']],
            ]);
    }

    public function test_login_with_wrong_credentials_fails(): void
    {
        $this->makeUser(['email' => 'wrong@test.com']);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'wrong@test.com',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('message', 'As credenciais fornecidas estão incorretas.');
    }

    public function test_me_returns_authenticated_user(): void
    {
        $user = $this->makeUser();
        $user->assignRole('employee');
        app(TenantManager::class)->set($user->tenant);

        $response = $this->actingAs($user)->getJson('/api/v1/auth/me');

        $response->assertOk()
            ->assertJsonPath('data.id', $user->id)
            ->assertJsonPath('data.roles.0', 'employee');
    }

    public function test_me_requires_authentication(): void
    {
        $response = $this->getJson('/api/v1/auth/me');

        $response->assertStatus(401);
    }

    public function test_logout_revokes_token(): void
    {
        $user = $this->makeUser();
        app(TenantManager::class)->set($user->tenant);

        $token = $user->createToken('test')->plainTextToken;

        $response = $this->withToken($token)->postJson('/api/v1/auth/logout');

        $response->assertOk();

        $this->assertDatabaseCount('personal_access_tokens', 0);
    }
}
