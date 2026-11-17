<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Plan;
use App\Models\SubscriptionInvoice;
use App\Models\Tenant;
use App\Models\TenantRelationship;
use App\Models\TenantSubscription;
use App\Models\User;
use App\Support\PlanCatalog;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SaasPlanAndHierarchyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    private function createSuperAdmin(): User
    {
        $user = User::factory()->create(['is_active' => true, 'email_verified_at' => now()]);
        $user->assignRole('super-admin');

        return $user;
    }

    private function createTenantWithAdmin(string $name): array
    {
        $tenant = Tenant::factory()->create(['name' => $name]);
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $admin->assignRole('admin');

        return [$tenant, $admin];
    }

    public function test_super_admin_can_create_custom_plan_and_link_to_multiple_tenants(): void
    {
        $superAdmin = $this->createSuperAdmin();
        [$tenantA] = $this->createTenantWithAdmin('Empresa Alpha');
        [$tenantB] = $this->createTenantWithAdmin('Empresa Beta');

        $features = PlanCatalog::defaultFeatures();
        $features['recruitment'] = true;

        $limits = PlanCatalog::defaultLimits();
        $limits['max_employees'] = 40;

        $agency = PlanCatalog::defaultAgencyConfig();

        $createRes = $this->actingAs($superAdmin, 'sanctum')
            ->postJson('/api/v1/superadmin/plans', [
                'name' => 'Plano Personalizado Angola',
                'visibility' => 'private',
                'billing_cycle' => 'quarterly',
                'currency' => 'AOA',
                'base_price' => 120000,
                'pricing_model' => 'flat',
                'features' => $features,
                'limits' => $limits,
                'agency_config' => $agency,
                'custom_rules' => ['sla_hours' => 4, 'account_manager' => 'VIP'],
            ]);

        $createRes->assertCreated()
            ->assertJsonPath('data.name', 'Plano Personalizado Angola')
            ->assertJsonPath('data.limits.max_employees', 40)
            ->assertJsonPath('data.custom_rules.sla_hours', 4);

        $planId = $createRes->json('data.id');

        $assignRes = $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/v1/superadmin/plans/{$planId}/assign-tenants", [
                'tenant_ids' => [$tenantA->id, $tenantB->id],
                'status' => 'active',
            ]);

        $assignRes->assertOk()
            ->assertJsonPath('data.assigned_count', 2);

        // Override individual na Empresa B
        $this->actingAs($superAdmin, 'sanctum')
            ->putJson("/api/v1/superadmin/tenants/{$tenantB->id}/subscription", [
                'overrides' => ['limits' => ['max_employees' => 150]],
            ])
            ->assertOk()
            ->assertJsonPath('data.limits.max_employees', 150);

        // Empresa A mantém limite base do plano
        $this->actingAs($superAdmin, 'sanctum')
            ->getJson("/api/v1/superadmin/tenants/{$tenantA->id}/subscription")
            ->assertOk()
            ->assertJsonPath('data.limits.max_employees', 40);
    }

    public function test_plan_features_quotas_and_suspended_status_are_enforced(): void
    {
        $superAdmin = $this->createSuperAdmin();
        [$tenant, $admin] = $this->createTenantWithAdmin('Empresa Quota');

        $features = PlanCatalog::defaultFeatures();
        $features['recruitment'] = false;

        $limits = PlanCatalog::defaultLimits();
        $limits['max_employees'] = 2;

        $plan = Plan::query()->create([
            'name' => 'Micro',
            'slug' => 'micro',
            'features' => $features,
            'limits' => $limits,
            'agency_config' => PlanCatalog::defaultAgencyConfig(),
        ]);

        TenantSubscription::query()->create([
            'tenant_id' => $tenant->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
        ]);

        // Módulo desativado no plano -> 403
        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/recruitment/jobs')
            ->assertForbidden()
            ->assertJsonPath('code', 'PLAN_FEATURE_DISABLED');

        // Criar 2 funcionários permitidos
        for ($i = 1; $i <= 2; $i++) {
            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/v1/employees', [
                    'first_name' => "Func{$i}",
                    'last_name' => 'Teste',
                    'email' => "func{$i}@quota.ao",
                    'phone' => "+24492300000{$i}",
                    'status' => 'active',
                ])
                ->assertCreated();
        }

        // 3º funcionário bloqueado pela quota do plano
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/employees', [
                'first_name' => 'Func3',
                'last_name' => 'Excesso',
                'email' => 'func3@quota.ao',
                'phone' => '+244923000009',
                'status' => 'active',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'PLAN_QUOTA_EXCEEDED');

        // Suspender subscrição -> bloqueia rotas operacionais (402), mas permite ver faturação
        $this->actingAs($superAdmin, 'sanctum')
            ->putJson("/api/v1/superadmin/tenants/{$tenant->id}/subscription", [
                'status' => 'suspended',
            ])
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/employees')
            ->assertStatus(402)
            ->assertJsonPath('code', 'SUBSCRIPTION_INACTIVE');

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/company/subscription')
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');
    }

    public function test_manager_company_can_create_and_manage_independent_companies_within_its_limits(): void
    {
        [$gestoraA, $adminA] = $this->createTenantWithAdmin('Consultora A');
        [$gestoraB, $adminB] = $this->createTenantWithAdmin('Consultora B');
        [$normalTenant, $normalAdmin] = $this->createTenantWithAdmin('Cliente Normal');

        $partnerPlan = Plan::query()->create([
            'name' => 'Parceiro BPO',
            'slug' => 'parceiro-bpo-test',
            'base_price' => 150000,
            'features' => array_fill_keys(array_keys(PlanCatalog::features()), true),
            'limits' => array_merge(PlanCatalog::defaultLimits(), ['max_employees' => 3]),
            'agency_config' => [
                'can_manage_other_tenants' => true,
                'can_create_managed_tenants' => true,
                'can_link_existing_tenants' => false,
                'max_managed_tenants' => 2,
                'max_hierarchy_depth' => 1,
                'quota_scope' => 'pooled_under_manager',
                'can_manage_child_users' => true,
                'can_customize_child_permissions' => true,
            ],
        ]);

        $simplePlan = Plan::query()->create([
            'name' => 'Simples',
            'slug' => 'simples-test',
            'features' => PlanCatalog::defaultFeatures(),
            'limits' => PlanCatalog::defaultLimits(),
            'agency_config' => PlanCatalog::defaultAgencyConfig(),
        ]);

        TenantSubscription::query()->create([
            'tenant_id' => $gestoraA->id,
            'plan_id' => $partnerPlan->id,
            'status' => 'active',
            'starts_at' => now(),
        ]);
        TenantSubscription::query()->create([
            'tenant_id' => $gestoraB->id,
            'plan_id' => $partnerPlan->id,
            'status' => 'active',
            'starts_at' => now(),
        ]);
        TenantSubscription::query()->create([
            'tenant_id' => $normalTenant->id,
            'plan_id' => $simplePlan->id,
            'status' => 'active',
            'starts_at' => now(),
        ]);

        // Empresa normal sem permissão de gerir outras -> 403
        $this->actingAs($normalAdmin, 'sanctum')
            ->postJson('/api/v1/portfolio/tenants', [
                'name' => 'Tentativa Invalida',
            ])
            ->assertForbidden();

        // Gestora A cria 2 empresas geridas independentes (não são filiais)
        $c1 = $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/v1/portfolio/tenants', [
                'name' => 'Cliente Um Lda',
                'tax_id' => '5000111222',
                'relationship_type' => 'accounting',
            ])
            ->assertCreated();
        $client1Id = $c1->json('data.id');

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/v1/portfolio/tenants', [
                'name' => 'Cliente Dois SA',
                'tax_id' => '5000333444',
                'relationship_type' => 'bpo',
            ])
            ->assertCreated();

        // 3ª empresa gerida excede max_managed_tenants = 2
        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/v1/portfolio/tenants', [
                'name' => 'Cliente Tres',
            ])
            ->assertUnprocessable();

        // Gestora A vê Cliente Um no /auth/me e consegue operar dentro dele via X-Tenant-ID
        $this->actingAs($adminA, 'sanctum')
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonFragment(['id' => $client1Id, 'name' => 'Cliente Um Lda']);

        // Gestora A cria 2 funcionários na Gestora A e 1 no Cliente Um (pool total = 3)
        Employee::factory()->count(2)->create(['tenant_id' => $gestoraA->id]);

        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/v1/employees', [
                'first_name' => 'Joao',
                'last_name' => 'Cliente',
                'email' => 'joao@cliente1.ao',
                'phone' => '+244923111001',
                'status' => 'active',
            ], ['X-Tenant-ID' => (string) $client1Id])
            ->assertCreated();

        // 4º funcionário no pool da Gestora A (mesmo sendo em Cliente Um) é bloqueado pelo limite da Gestora A!
        $this->actingAs($adminA, 'sanctum')
            ->postJson('/api/v1/employees', [
                'first_name' => 'Maria',
                'last_name' => 'Excesso',
                'email' => 'maria@cliente1.ao',
                'phone' => '+244923111002',
                'status' => 'active',
            ], ['X-Tenant-ID' => (string) $client1Id])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'PLAN_QUOTA_EXCEEDED');

        // Gestora B não pode aceder nem gerir Cliente Um da Gestora A
        $this->actingAs($adminB, 'sanctum')
            ->getJson('/api/v1/employees', ['X-Tenant-ID' => (string) $client1Id])
            ->assertForbidden();

        // Profundidade = 1: Cliente Um não pode criar sub-empresas mesmo herdando plano do gestor
        $client1Admin = User::factory()->create(['tenant_id' => $client1Id, 'is_active' => true, 'email_verified_at' => now()]);
        $client1Admin->assignRole('admin');
        $this->actingAs($client1Admin, 'sanctum')
            ->postJson('/api/v1/portfolio/tenants', ['name' => 'Sub Cliente'], ['X-Tenant-ID' => (string) $client1Id])
            ->assertForbidden();

        // Revogar relação remove o acesso da Gestora A ao Cliente Um
        $this->actingAs($adminA, 'sanctum')
            ->deleteJson("/api/v1/portfolio/tenants/{$client1Id}")
            ->assertOk();

        $this->actingAs($adminA, 'sanctum')
            ->getJson('/api/v1/employees', ['X-Tenant-ID' => (string) $client1Id])
            ->assertForbidden();
    }

    public function test_billing_is_only_for_manager_company_and_payment_proof_approval_renews_subscription(): void
    {
        Storage::fake('local');

        $superAdmin = $this->createSuperAdmin();
        [$gestora, $adminGestora] = $this->createTenantWithAdmin('Gestora Billing');
        $client = Tenant::factory()->create(['name' => 'Cliente Faturacao']);

        $plan = Plan::query()->create([
            'name' => 'Parceiro Mensal',
            'slug' => 'parceiro-mensal',
            'base_price' => 100000,
            'billing_cycle' => 'monthly',
            'features' => PlanCatalog::defaultFeatures(),
            'limits' => PlanCatalog::defaultLimits(),
            'agency_config' => [
                'can_manage_other_tenants' => true,
                'can_create_managed_tenants' => true,
                'can_link_existing_tenants' => false,
                'max_managed_tenants' => 5,
                'max_hierarchy_depth' => 1,
                'quota_scope' => 'pooled_under_manager',
                'can_manage_child_users' => true,
                'can_customize_child_permissions' => true,
            ],
        ]);

        TenantSubscription::query()->create([
            'tenant_id' => $gestora->id,
            'plan_id' => $plan->id,
            'status' => 'past_due',
            'starts_at' => now()->subMonth(),
            'ends_at' => now()->subDay(),
        ]);

        TenantRelationship::query()->create([
            'manager_tenant_id' => $gestora->id,
            'managed_tenant_id' => $client->id,
            'relationship_type' => 'bpo',
            'status' => 'active',
            'accepted_at' => now(),
        ]);

        // Empresa gerida vê indicação de faturação centralizada na gestora
        $this->actingAs($adminGestora, 'sanctum')
            ->getJson('/api/v1/company/billing/invoices', ['X-Tenant-ID' => (string) $client->id])
            ->assertOk()
            ->assertJsonPath('data.billed_to_manager', true);

        // SuperAdmin gera fatura para a Gestora
        $invRes = $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/v1/superadmin/tenants/{$gestora->id}/invoices")
            ->assertCreated();
        $invoiceId = $invRes->json('data.id');

        // Gestora envia comprovativo de transferência
        $proofRes = $this->actingAs($adminGestora, 'sanctum')
            ->post("/api/v1/company/billing/invoices/{$invoiceId}/payments", [
                'payment_method' => 'bank_transfer',
                'reference_code' => 'TRF-998877',
                'proof_file' => UploadedFile::fake()->create('comprovativo.pdf', 120, 'application/pdf'),
            ], ['X-Tenant-ID' => (string) $gestora->id]);
        $proofRes->assertCreated();
        $paymentId = $proofRes->json('data.id');

        $this->assertEquals('under_review', SubscriptionInvoice::find($invoiceId)->status);

        // SuperAdmin aprova o comprovativo -> fatura paga e subscrição ativa/renovada
        $this->actingAs($superAdmin, 'sanctum')
            ->postJson("/api/v1/superadmin/billing/payments/{$paymentId}/approve")
            ->assertOk();

        $this->assertEquals('paid', SubscriptionInvoice::find($invoiceId)->status);
        $this->assertEquals('active', $gestora->latestSubscription()->first()->status);
    }

    public function test_tenant_admin_can_invite_user_respecting_max_users_and_user_can_accept(): void
    {
        [$tenant, $admin] = $this->createTenantWithAdmin('Empresa Convites');

        $plan = Plan::query()->create([
            'name' => 'Convite Test',
            'slug' => 'convite-test',
            'features' => PlanCatalog::defaultFeatures(),
            'limits' => array_merge(PlanCatalog::defaultLimits(), ['max_users' => 2]),
            'agency_config' => PlanCatalog::defaultAgencyConfig(),
        ]);

        TenantSubscription::query()->create([
            'tenant_id' => $tenant->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
        ]);

        // Admin conta como 1 utilizador; pode convidar mais 1 (limite 2)
        $invRes = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/team/invitations', [
                'email' => 'novo.rh@empresa.ao',
                'name' => 'Ana RH',
                'role_name' => 'hr-manager',
            ])
            ->assertCreated();

        $token = $invRes->json('data.token');

        $this->getJson("/api/v1/invitations/{$token}")
            ->assertOk()
            ->assertJsonPath('data.email', 'novo.rh@empresa.ao');

        $this->postJson("/api/v1/invitations/{$token}/accept", [
            'name' => 'Ana RH',
            'password' => 'segredo123',
            'password_confirmation' => 'segredo123',
        ])->assertCreated();

        // Agora existem 2 utilizadores; próximo convite excede max_users = 2
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/team/invitations', [
                'email' => 'terceiro@empresa.ao',
                'role_name' => 'employee',
            ])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'PLAN_QUOTA_EXCEEDED');
    }

    public function test_super_admin_can_batch_link_multiple_managed_tenants_to_manager(): void
    {
        $superAdmin = $this->createSuperAdmin();
        [$gestora] = $this->createTenantWithAdmin('Gestora Lote');
        $c1 = Tenant::factory()->create(['name' => 'Cliente Lote 1']);
        $c2 = Tenant::factory()->create(['name' => 'Cliente Lote 2']);
        $c3 = Tenant::factory()->create(['name' => 'Cliente Lote 3']);

        $plan = Plan::query()->create([
            'name' => 'Lote Max 2',
            'slug' => 'lote-max-2',
            'features' => PlanCatalog::defaultFeatures(),
            'limits' => PlanCatalog::defaultLimits(),
            'agency_config' => [
                'can_manage_other_tenants' => true,
                'can_create_managed_tenants' => true,
                'can_link_existing_tenants' => true,
                'max_managed_tenants' => 2,
                'max_hierarchy_depth' => 1,
                'quota_scope' => 'pooled_under_manager',
                'can_manage_child_users' => true,
                'can_customize_child_permissions' => true,
            ],
        ]);

        TenantSubscription::query()->create([
            'tenant_id' => $gestora->id,
            'plan_id' => $plan->id,
            'status' => 'active',
            'starts_at' => now(),
        ]);

        // Tentar vincular 3 de uma vez quando o limite é 2 deve falhar atomicamente (0 gravados)
        $this->actingAs($superAdmin, 'sanctum')
            ->postJson('/api/v1/superadmin/relationships', [
                'manager_tenant_id' => $gestora->id,
                'managed_tenant_ids' => [$c1->id, $c2->id, $c3->id],
                'relationship_type' => 'bpo',
            ])
            ->assertUnprocessable();

        $this->assertDatabaseCount('tenant_relationships', 0);

        // Vincular 2 de uma vez funciona
        $this->actingAs($superAdmin, 'sanctum')
            ->postJson('/api/v1/superadmin/relationships', [
                'manager_tenant_id' => $gestora->id,
                'managed_tenant_ids' => [$c1->id, $c2->id],
                'relationship_type' => 'accounting',
            ])
            ->assertCreated()
            ->assertJsonPath('data.attached_count', 2);

        $this->assertDatabaseCount('tenant_relationships', 2);
    }
}
