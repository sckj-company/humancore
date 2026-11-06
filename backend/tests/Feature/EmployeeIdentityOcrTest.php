<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EmployeeIdentityOcrTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
    }

    public function test_admin_can_extract_basic_fields_from_an_identity_image(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        config(['services.ocr_space.key' => 'test-key']);
        Http::fake([
            'https://api.ocr.space/parse/image' => Http::response([
                'IsErroredOnProcessing' => false,
                'ParsedResults' => [[
                    'ParsedText' => "BILHETE DE IDENTIDADE\nNome: Ana Maria Costa\nBI: 004928123LA042\nData de Nascimento: 02/03/1985\nSexo: F\nNacionalidade: Angolana\nValidade: 02/03/2030",
                ]],
            ]),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->image('bi.jpg'),
        ])->assertOk()
            ->assertJsonPath('data.first_name', 'Ana')
            ->assertJsonPath('data.last_name', 'Maria Costa')
            ->assertJsonPath('data.id_document_number', '004928123LA042')
            ->assertJsonPath('data.birth_date', '1985-03-02')
            ->assertJsonPath('data.id_document_expiry', '2030-03-02')
            ->assertJsonPath('data.gender', 'female')
            ->assertJsonPath('data.nationality', 'Angolana');

        Http::assertSent(fn ($request) => $request->hasHeader('apikey', 'test-key'));
        Http::assertSent(fn ($request) => ($request->data()['filetype'] ?? null) === 'JPG'
            && ($request->data()['isOverlayRequired'] ?? null) === 'false'
            && ($request->data()['scale'] ?? null) === 'true');
    }

    public function test_admin_can_extract_fields_from_all_pages_of_a_scanned_identity_pdf(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        config(['services.ocr_space.key' => 'test-key']);
        Http::fake([
            'https://api.ocr.space/parse/image' => Http::response([
                'IsErroredOnProcessing' => false,
                'ParsedResults' => [
                    ['ParsedText' => "Nome: Ana Maria Costa\nData de Nascimento: 02/03/1985"],
                    ['ParsedText' => "BI: 004928123LA042\nSexo: F\nNacionalidade: Angolana"],
                ],
            ]),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->create('bi.pdf', 100, 'application/pdf'),
        ])->assertOk()
            ->assertJsonPath('data.first_name', 'Ana')
            ->assertJsonPath('data.last_name', 'Maria Costa')
            ->assertJsonPath('data.id_document_number', '004928123LA042')
            ->assertJsonPath('data.birth_date', '1985-03-02')
            ->assertJsonPath('data.gender', 'female')
            ->assertJsonPath('data.nationality', 'Angolana');

        Http::assertSent(fn ($request) => ($request->data()['filetype'] ?? null) === 'PDF');
    }

    public function test_ocr_endpoint_returns_service_unavailable_when_not_configured(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');
        config(['services.ocr_space.key' => null]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->image('bi.jpg'),
        ])->assertStatus(503);
    }

    public function test_ocr_endpoint_rejects_images_without_recognized_fields(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        config(['services.ocr_space.key' => 'test-key']);
        Http::fake([
            'https://api.ocr.space/parse/image' => Http::response([
                'IsErroredOnProcessing' => false,
                'ParsedResults' => [['ParsedText' => 'BILHETE DE IDENTIDADE']],
            ]),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->image('bi.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Não foram identificados dados legíveis. Tente um documento mais nítido e bem iluminado.');
    }

    public function test_ocr_provider_error_is_returned_as_a_readable_validation_error(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        config(['services.ocr_space.key' => 'test-key']);
        Http::fake([
            'https://api.ocr.space/parse/image' => Http::response([
                'IsErroredOnProcessing' => true,
                'ErrorMessage' => ['The uploaded PDF could not be parsed.'],
            ]),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->create('bi.pdf', 100, 'application/pdf'),
        ])->assertUnprocessable()
            ->assertJsonPath(
                'message',
                'O OCR.space não conseguiu ler este documento. Confirme se o ficheiro é válido e tente novamente. Detalhe: The uploaded PDF could not be parsed.',
            );
    }
}
