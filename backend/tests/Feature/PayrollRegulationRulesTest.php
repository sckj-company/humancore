<?php

namespace Tests\Feature;

use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use DateTimeImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PayrollRegulationRulesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    protected function setupTenantWithAdmin(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $admin->assignRole('admin');

        return [$tenant, $admin];
    }

    public function test_inss_rule_lifecycle_draft_validate_activate_revoke(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        // 1. Criar regra em draft
        $response = $this->postJson('/api/v1/payroll/inss-rules', [
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'employee_rate' => 3.0,
            'employer_rate' => 8.0,
            'effective_from' => '2026-01-01',
            'legal_reference' => 'Decreto Presidencial 227/18',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.version', 1);

        $this->assertEquals(3.0, (float) $response->json('data.employee_rate'));

        $ruleId = $response->json('data.id');

        // 2. Editar rascunho
        $updateResp = $this->putJson("/api/v1/payroll/inss-rules/{$ruleId}", [
            'employee_rate' => 4.0,
        ])->assertOk();

        $this->assertEquals(4.0, (float) $updateResp->json('data.employee_rate'));

        // 3. Validar rascunho
        $this->postJson("/api/v1/payroll/inss-rules/{$ruleId}/validate")
            ->assertOk()
            ->assertJsonPath('data.status', 'validated');

        // Não permite mais editar após validação
        $this->putJson("/api/v1/payroll/inss-rules/{$ruleId}", [
            'employee_rate' => 5.0,
        ])->assertStatus(422);

        // 4. Ativar regra
        $this->postJson("/api/v1/payroll/inss-rules/{$ruleId}/activate")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        // 5. Revogar com motivo (encerra a vigência)
        $revokeResp = $this->postJson("/api/v1/payroll/inss-rules/{$ruleId}/revoke", [
            'reason' => 'Substituída por nova regulamentação oficial',
        ])->assertOk()
            ->assertJsonPath('data.status', 'revoked')
            ->assertJsonPath('data.revocation_reason', 'Substituída por nova regulamentação oficial');

        $this->assertNotNull($revokeResp->json('data.effective_to'));

        // 6. Criar nova regra com a mesma data inicial é agora permitido porque a anterior foi revogada
        $this->postJson('/api/v1/payroll/inss-rules', [
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'employee_rate' => 3.0,
            'employer_rate' => 8.0,
            'effective_from' => '2026-01-01',
            'legal_reference' => 'Nova regra substituta',
        ])->assertStatus(201);

        // 7. Regra revogada pode ser eliminada definitivamente
        $this->deleteJson("/api/v1/payroll/inss-rules/{$ruleId}")
            ->assertOk();

        $this->assertDatabaseMissing('payroll_inss_rules', ['id' => $ruleId]);
    }

    public function test_prevent_overlapping_active_inss_rules(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        // Regra 1 ativa de 2026-01-01 em diante (sem data fim)
        $rule1 = PayrollInssRule::factory()->for($tenant)->create([
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'version' => 1,
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $admin->id,
        ]);

        // Regra 2 validada com sobreposição (início 2026-06-01)
        $rule2 = PayrollInssRule::factory()->for($tenant)->create([
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'version' => 2,
            'effective_from' => '2026-06-01',
            'effective_to' => null,
            'status' => 'validated',
            'validated_at' => now(),
            'validated_by' => $admin->id,
        ]);

        // Ativação da regra 2 deve falhar com 422 devido à sobreposição
        $response = $this->postJson("/api/v1/payroll/inss-rules/{$rule2->id}/activate");
        $response->assertStatus(422)
            ->assertJsonPath('message', 'A vigência sobrepõe-se a outra regra ativa. Ajuste as datas antes de ativar.');
    }

    public function test_scope_effective_for_retrieves_correct_inss_and_irt_version(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();

        // INSS ano 2025
        PayrollInssRule::factory()->for($tenant)->create([
            'version' => 1,
            'effective_from' => '2025-01-01',
            'effective_to' => '2025-12-31',
            'employee_rate' => 3.0,
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $admin->id,
        ]);

        // INSS ano 2026
        PayrollInssRule::factory()->for($tenant)->create([
            'version' => 2,
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'employee_rate' => 3.5,
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $admin->id,
        ]);

        // Consulta para junho de 2026
        $active2026 = PayrollInssRule::query()
            ->effectiveFor(new DateTimeImmutable('2026-06-01'), 'AO', 'standard')
            ->firstOrFail();

        $this->assertSame(2, $active2026->version);
        $this->assertSame(3.5, (float) $active2026->employee_rate);

        // Consulta para março de 2025
        $active2025 = PayrollInssRule::query()
            ->effectiveFor(new DateTimeImmutable('2025-03-01'), 'AO', 'standard')
            ->firstOrFail();

        $this->assertSame(1, $active2025->version);
        $this->assertSame(3.0, (float) $active2025->employee_rate);
    }

    public function test_irt_table_brackets_crud_and_json_integrity(): void
    {
        [$tenant, $admin] = $this->setupTenantWithAdmin();
        $this->actingAs($admin, 'sanctum');

        $brackets = [
            ['lower_bound' => 0, 'upper_bound' => 100000, 'rate' => 0, 'fixed_amount' => 0],
            ['lower_bound' => 100000, 'upper_bound' => 200000, 'rate' => 7, 'fixed_amount' => 0],
            ['lower_bound' => 200000, 'upper_bound' => 500000, 'rate' => 11, 'fixed_amount' => 7000],
            ['lower_bound' => 500000, 'upper_bound' => 1000000, 'rate' => 15, 'fixed_amount' => 40000],
            ['lower_bound' => 1000000, 'upper_bound' => null, 'rate' => 19, 'fixed_amount' => 115000],
        ];

        $response = $this->postJson('/api/v1/payroll/irt-tables', [
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'effective_from' => '2026-01-01',
            'brackets' => $brackets,
            'legal_reference' => 'Lei 28/20 - Código do IRT',
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.version', 1)
            ->assertJsonCount(5, 'data.brackets');

        $tableId = $response->json('data.id');

        // Validar e Ativar
        $this->postJson("/api/v1/payroll/irt-tables/{$tableId}/validate")->assertOk();
        $this->postJson("/api/v1/payroll/irt-tables/{$tableId}/activate")->assertOk()
            ->assertJsonPath('data.status', 'active');

        // Verificar scope
        $activeIrt = PayrollIrtTable::query()
            ->effectiveFor(new DateTimeImmutable('2026-05-15'), 'AO', 'standard')
            ->firstOrFail();

        $this->assertSame($tableId, $activeIrt->id);
        $this->assertCount(5, $activeIrt->brackets);
        $this->assertSame(40000, (int) $activeIrt->brackets[3]['fixed_amount']);
    }

    public function test_tenant_isolation_for_inss_and_irt_rules(): void
    {
        [$tenantA, $adminA] = $this->setupTenantWithAdmin();

        $otherTenant = Tenant::factory()->create();
        app(TenantManager::class)->set($otherTenant);
        $otherRule = PayrollInssRule::factory()->for($otherTenant)->create(['status' => 'active']);

        app(TenantManager::class)->set($tenantA);
        $this->actingAs($adminA, 'sanctum');

        // Tenant A não pode ver a regra do outro tenant (deve retornar 404 pelo tenant scope)
        $this->getJson("/api/v1/payroll/inss-rules/{$otherRule->id}")->assertNotFound();
    }

    public function test_superadmin_can_manage_salary_components_for_targeted_tenant(): void
    {
        $tenantTarget = Tenant::factory()->create(['name' => 'Empresa Alvo']);
        $tenantOther = Tenant::factory()->create(['name' => 'Outra Empresa']);

        $superAdmin = User::factory()->create([
            'tenant_id' => null,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $superAdmin->assignRole('super-admin');

        $this->actingAs($superAdmin, 'sanctum');

        // Super-admin cria componente especificando o tenant alvo via header e payload
        $response = $this->withHeader('X-Tenant-ID', (string) $tenantTarget->id)
            ->postJson('/api/v1/payroll/salary-components', [
                'tenant_id' => $tenantTarget->id,
                'name' => 'Subsídio Especial de Risco',
                'code' => 'subsidio_especial_risco',
                'type' => 'earning',
                'calculation_type' => 'fixed',
            ]);

        $response->assertStatus(201)
            ->assertJsonPath('data.tenant_id', $tenantTarget->id)
            ->assertJsonPath('data.code', 'subsidio_especial_risco');

        // Componente deve aparecer na listagem do tenant alvo
        $listResponse = $this->withHeader('X-Tenant-ID', (string) $tenantTarget->id)
            ->getJson('/api/v1/payroll/salary-component-regulations');

        $listResponse->assertOk()
            ->assertJsonFragment(['code' => 'subsidio_especial_risco']);

        // E não deve vazar para a listagem do outro tenant
        $otherListResponse = $this->withHeader('X-Tenant-ID', (string) $tenantOther->id)
            ->getJson('/api/v1/payroll/salary-component-regulations');

        $otherListResponse->assertOk()
            ->assertJsonMissing(['code' => 'subsidio_especial_risco']);
    }
}
