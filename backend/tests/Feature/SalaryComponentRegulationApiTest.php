<?php

namespace Tests\Feature;

use App\Models\SalaryComponent;
use App\Models\SalaryComponentRegulation;
use App\Models\Tenant;
use App\Models\User;
use App\Services\CloudinaryService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SalaryComponentRegulationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
    }

    public function test_salary_regulation_can_be_created_validated_and_activated(): void
    {
        [$tenant, $user, $component] = $this->createAdminContext();
        $this->actingAs($user, 'sanctum');

        $response = $this->postJson('/api/v1/payroll/salary-component-regulations', [
            'salary_component_id' => $component->id,
            'country_code' => 'ao',
            'regime_code' => 'standard',
            'effective_from' => '2026-01-01',
            'employee_inss_applicable' => false,
            'employer_inss_applicable' => true,
            'irt_applicable' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.version', 1)
            ->assertJsonPath('data.country_code', 'AO');

        $regulationId = $response->json('data.id');
        $this->assertDatabaseHas('salary_component_regulations', [
            'id' => $regulationId,
            'tenant_id' => $tenant->id,
            'status' => 'draft',
            'validated_by' => null,
        ]);

        $this->postJson("/api/v1/payroll/salary-component-regulations/{$regulationId}/validate")
            ->assertOk()
            ->assertJsonPath('data.status', 'validated')
            ->assertJsonPath('data.validated_by.id', $user->id);

        $this->postJson("/api/v1/payroll/salary-component-regulations/{$regulationId}/activate")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $this->assertDatabaseHas('salary_component_regulations', [
            'id' => $regulationId,
            'status' => 'active',
            'validated_by' => $user->id,
        ]);
    }

    public function test_unprivileged_user_cannot_create_salary_regulation(): void
    {
        [, $user, $component] = $this->createAdminContext();
        $user->syncRoles(['employee']);
        $this->actingAs($user, 'sanctum');

        $this->postJson('/api/v1/payroll/salary-component-regulations', [
            'salary_component_id' => $component->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'effective_from' => '2026-01-01',
        ])->assertForbidden();
    }

    public function test_activation_rejects_overlapping_active_regulations(): void
    {
        [$tenant, $user, $component] = $this->createAdminContext();
        $this->actingAs($user, 'sanctum');

        $existing = SalaryComponentRegulation::factory()->for($tenant)->for($component, 'component')->create([
            'version' => 1,
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'status' => 'active',
            'legal_source' => 'Fonte legal',
            'legal_reference' => 'Referência validada',
            'validated_at' => now(),
            'validated_by' => $user->id,
        ]);
        $pending = SalaryComponentRegulation::factory()->for($tenant)->for($component, 'component')->create([
            'version' => 2,
            'effective_from' => '2026-06-01',
            'effective_to' => '2026-12-31',
            'employee_inss_applicable' => true,
            'employer_inss_applicable' => true,
            'irt_applicable' => true,
            'status' => 'validated',
            'legal_source' => 'Fonte legal',
            'legal_reference' => 'Referência validada',
            'validated_at' => now(),
            'validated_by' => $user->id,
        ]);

        $this->postJson("/api/v1/payroll/salary-component-regulations/{$pending->id}/activate")
            ->assertUnprocessable()
            ->assertJsonPath('message', 'A vigência sobrepõe-se a outra regra activa. Ajuste as datas antes de activar.');

        $this->assertSame('active', $existing->fresh()->status);
        $this->assertSame('validated', $pending->fresh()->status);
    }

    public function test_regulation_listing_is_scoped_to_the_current_tenant(): void
    {
        [$tenant, $user, $component] = $this->createAdminContext();
        $otherTenant = Tenant::factory()->create();
        $otherComponent = SalaryComponent::factory()->for($otherTenant)->create();

        SalaryComponentRegulation::factory()->for($tenant)->for($component, 'component')->create();
        SalaryComponentRegulation::factory()->for($otherTenant)->for($otherComponent, 'component')->create();

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/payroll/salary-component-regulations')
            ->assertOk()
            ->assertJsonCount(1, 'data.regulations');
    }

    public function test_angola_initialization_creates_draft_defaults_only_once(): void
    {
        [$tenant, $user] = $this->createAdminContext();
        $this->actingAs($user, 'sanctum');

        $firstInitialization = $this->postJson('/api/v1/payroll/salary-component-regulations/initialize-angola')
            ->assertOk()
            ->assertJsonPath('data.draft_regulations_created', 12);

        $secondInitialization = $this->postJson('/api/v1/payroll/salary-component-regulations/initialize-angola')
            ->assertOk()
            ->assertJsonPath('data.components_created', 0)
            ->assertJsonPath('data.draft_regulations_created', 0);

        $baseSalary = SalaryComponent::query()->where('code', 'base_salary')->firstOrFail();
        $baseRegulation = $baseSalary->regulations()->firstOrFail();
        $mealAllowance = SalaryComponent::query()->where('code', 'meal_allowance')->firstOrFail();
        $mealRegulation = $mealAllowance->regulations()->firstOrFail();

        $this->assertSame('draft', $baseRegulation->status);
        $this->assertTrue($baseRegulation->employee_inss_applicable);
        $this->assertTrue($baseRegulation->employer_inss_applicable);
        $this->assertTrue($baseRegulation->irt_applicable);
        $this->assertNull($mealRegulation->employee_inss_applicable);
        $this->assertNull($mealRegulation->employer_inss_applicable);
        $this->assertNull($mealRegulation->irt_applicable);
        $this->assertDatabaseHas('salary_component_regulations', [
            'tenant_id' => $tenant->id,
            'salary_component_id' => $baseSalary->id,
            'country_code' => 'AO',
            'version' => 1,
            'status' => 'draft',
        ]);
    }

    public function test_new_component_can_be_added_without_an_incidence_version(): void
    {
        [, $user] = $this->createAdminContext();
        $this->actingAs($user, 'sanctum');

        $response = $this->postJson('/api/v1/payroll/salary-components', [
            'name' => 'Subsídio de conectividade',
            'code' => 'connectivity_allowance',
            'type' => 'benefit',
            'calculation_type' => 'fixed',
        ])->assertCreated();

        $componentId = $response->json('data.id');
        $this->assertDatabaseHas('salary_components', [
            'id' => $componentId,
            'code' => 'connectivity_allowance',
        ]);
        $this->assertDatabaseMissing('salary_component_regulations', [
            'salary_component_id' => $componentId,
        ]);
    }

    public function test_duplicate_component_regulations_with_the_same_start_date_are_rejected(): void
    {
        [, $user, $component] = $this->createAdminContext();
        $this->actingAs($user, 'sanctum');

        $payload = [
            'salary_component_id' => $component->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'effective_from' => '2026-01-01',
            'employee_inss_applicable' => true,
            'employer_inss_applicable' => true,
            'irt_applicable' => true,
        ];

        $this->postJson('/api/v1/payroll/salary-component-regulations', $payload)->assertCreated();

        $this->postJson('/api/v1/payroll/salary-component-regulations', $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('effective_from');

        $this->assertSame(1, SalaryComponentRegulation::query()->count());
    }

    public function test_draft_regulation_can_be_deleted_with_its_private_document(): void
    {
        Storage::fake('local');
        [$tenant, $user, $component] = $this->createAdminContext();
        $this->actingAs($user, 'sanctum');
        $documentPath = "payroll-regulations/{$tenant->id}/{$component->id}/draft.pdf";
        Storage::disk('local')->put($documentPath, 'legal document');
        $regulation = SalaryComponentRegulation::factory()->for($tenant)->for($component, 'component')->create([
            'legal_document_path' => $documentPath,
        ]);

        $this->deleteJson("/api/v1/payroll/salary-component-regulations/{$regulation->id}")
            ->assertOk();

        $this->assertDatabaseMissing('salary_component_regulations', ['id' => $regulation->id]);
        Storage::disk('local')->assertMissing($documentPath);
    }

    public function test_active_regulation_is_revoked_with_reason_instead_of_deleted(): void
    {
        [$tenant, $user, $component] = $this->createAdminContext();
        $this->actingAs($user, 'sanctum');
        $regulation = SalaryComponentRegulation::factory()->for($tenant)->for($component, 'component')->create([
            'employee_inss_applicable' => true,
            'employer_inss_applicable' => true,
            'irt_applicable' => true,
            'status' => 'active',
            'legal_source' => null,
            'legal_reference' => null,
            'validated_at' => now(),
            'validated_by' => $user->id,
        ]);

        $this->postJson("/api/v1/payroll/salary-component-regulations/{$regulation->id}/revoke", [
            'reason' => 'Substituída por nova regra validada.',
        ])
            ->assertOk()
            ->assertJsonPath('data.status', 'revoked')
            ->assertJsonPath('data.revocation_reason', 'Substituída por nova regra validada.')
            ->assertJsonPath('data.revoked_by.id', $user->id);

        $this->assertDatabaseHas('salary_component_regulations', [
            'id' => $regulation->id,
            'status' => 'revoked',
            'revoked_by' => $user->id,
            'revocation_reason' => 'Substituída por nova regra validada.',
        ]);
    }

    public function test_legal_document_is_optional_and_uploaded_document_url_redirects_to_cloudinary(): void
    {
        Storage::fake('local');
        [$tenant, $user, $component] = $this->createAdminContext();
        $this->actingAs($user, 'sanctum');

        $response = $this->postJson('/api/v1/payroll/salary-component-regulations', [
            'salary_component_id' => $component->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'effective_from' => '2026-01-01',
            'employee_inss_applicable' => true,
            'employer_inss_applicable' => true,
            'irt_applicable' => true,
        ])->assertCreated();

        $regulationId = $response->json('data.id');
        $this->postJson("/api/v1/payroll/salary-component-regulations/{$regulationId}/validate")
            ->assertOk()
            ->assertJsonPath('data.status', 'validated');

        $cloudinaryUrl = 'https://res.cloudinary.com/test/raw/upload/diploma.pdf';
        $this->mock(CloudinaryService::class)
            ->shouldReceive('upload')
            ->once()
            ->andReturn(['url' => $cloudinaryUrl, 'bytes' => 24]);
        app(CloudinaryService::class)
            ->shouldReceive('isCloudinaryUrl')
            ->once()
            ->with($cloudinaryUrl)
            ->andReturn(true);

        $upload = $this->post('/api/v1/payroll/salary-component-regulations', [
            'salary_component_id' => $component->id,
            'country_code' => 'AO',
            'regime_code' => 'special',
            'effective_from' => '2026-01-01',
            'legal_document' => UploadedFile::fake()->create('diploma.pdf', 24, 'application/pdf'),
        ], [
            'Accept' => 'application/json',
        ])->assertCreated();

        $uploadedRegulationId = $upload->json('data.id');
        $documentPath = SalaryComponentRegulation::query()->findOrFail($uploadedRegulationId)->legal_document_path;

        $this->assertSame($cloudinaryUrl, $documentPath);
        Storage::disk('local')->assertDirectoryEmpty('payroll-regulations');
        $this->get("/api/v1/payroll/salary-component-regulations/{$uploadedRegulationId}/document")
            ->assertRedirect($cloudinaryUrl);
        $this->assertSame($tenant->id, SalaryComponentRegulation::query()->findOrFail($uploadedRegulationId)->tenant_id);
    }

    private function createAdminContext(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $component = SalaryComponent::factory()->for($tenant)->create();
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        $user->assignRole('admin');

        return [$tenant, $user, $component];
    }
}
