<?php

namespace Tests\Feature;

use App\Models\EmailTemplate;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class EmailTemplateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_employee_cannot_list_templates(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'employee');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/email-templates')
            ->assertForbidden();
    }

    public function test_admin_can_create_template_and_list(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/email-templates', [
                'name' => 'Boas-vindas',
                'code' => 'welcome_email',
                'event' => 'employee_created',
                'subject' => 'Bem-vindo à {{company_name}}!',
                'body' => 'Olá {{employee_name}}, bem-vindo à {{company_name}}.',
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Boas-vindas')
            ->assertJsonPath('data.event_label', 'Admissão de funcionário')
            ->assertJsonPath('data.is_active', true);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/email-templates')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1);
    }

    public function test_duplicate_code_is_rejected(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');

        EmailTemplate::factory()->create([
            'tenant_id' => $tenant->id,
            'code' => 'welcome_email',
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/email-templates', [
                'name' => 'Duplicado',
                'code' => 'welcome_email',
                'subject' => 'Assunto',
                'body' => 'Corpo',
            ])
            ->assertStatus(422);
    }

    public function test_preview_renders_variables(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');
        $template = EmailTemplate::factory()->create([
            'tenant_id' => $tenant->id,
            'subject' => 'Olá {{employee_name}}',
            'body' => 'Empresa: {{company_name}}',
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/email-templates/{$template->id}/preview")
            ->assertOk()
            ->assertJsonPath('data.subject', 'Olá João Silva')
            ->assertJsonPath('data.body', 'Empresa: Empresa Demo Lda');
    }

    public function test_system_template_cannot_be_edited_or_deleted(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUser($tenant, 'admin');
        $template = EmailTemplate::factory()->create([
            'tenant_id' => $tenant->id,
            'is_system' => true,
        ]);

        $this->actingAs($user, 'sanctum')
            ->putJson("/api/v1/email-templates/{$template->id}", ['subject' => 'Hack'])
            ->assertForbidden();

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/email-templates/{$template->id}")
            ->assertForbidden();
    }

    public function test_tenant_isolation(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        app(TenantManager::class)->set($tenantA);
        $user = $this->makeUser($tenantA, 'admin');
        $templateB = EmailTemplate::factory()->create(['tenant_id' => $tenantB->id]);

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/v1/email-templates/{$templateB->id}")
            ->assertStatus(404);
    }

    private function makeUser(Tenant $tenant, string $role): User
    {
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole($role);

        return $user;
    }
}
