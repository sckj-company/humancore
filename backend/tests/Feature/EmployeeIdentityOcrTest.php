<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use App\Services\IdentityDocumentOcrService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Symfony\Component\Process\Process;
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

        config([
            'services.groq.key' => 'test-key',
            'services.groq.base_url' => 'https://api.groq.com/openai/v1',
            'services.groq.model' => 'qwen/qwen3.8-27b',
            'services.groq.max_prompt_words' => 1000,
            'services.groq.max_completion_tokens' => 10000,
            'services.groq.max_images' => 100,
            'services.groq.max_image_bytes' => 100000000,
        ]);
        Http::fake([
            'https://api.groq.com/openai/v1/chat/completions' => Http::response([
                'choices' => [['message' => ['content' => json_encode([
                    'first_name' => 'Ana',
                    'last_name' => 'Maria Costa',
                    'id_document_number' => '004928123LA042',
                    'birth_date' => '1985-03-02',
                    'id_document_expiry' => '2030-03-02',
                    'gender' => 'female',
                    'nationality' => 'Angolana',
                ])]]],
            ]),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->image('bi.jpg', 2400, 1200),
        ])->assertOk()
            ->assertJsonPath('data.first_name', 'Ana')
            ->assertJsonPath('data.last_name', 'Maria Costa')
            ->assertJsonPath('data.id_document_number', '004928123LA042')
            ->assertJsonPath('data.birth_date', '1985-03-02')
            ->assertJsonPath('data.id_document_expiry', '2030-03-02')
            ->assertJsonPath('data.gender', 'female')
            ->assertJsonPath('data.nationality', 'Angolana');

        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer test-key'));
        Http::assertSent(fn ($request) => ($request->data()['model'] ?? null) === 'qwen/qwen3.8-27b'
            && ($request->data()['max_completion_tokens'] ?? null) === 256
            && ($request->data()['response_format']['type'] ?? null) === 'json_object'
            && $this->assertRequestBudget($request->data()));
    }

    public function test_admin_can_extract_fields_from_a_scanned_identity_pdf(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        config(['services.groq.key' => 'test-key']);
        $ocr = \Mockery::mock(IdentityDocumentOcrService::class);
        $ocr->shouldReceive('extract')->once()->andReturn([
            'first_name' => 'Ana',
            'last_name' => 'Maria Costa',
            'id_document_number' => '004928123LA042',
            'birth_date' => '1985-03-02',
            'gender' => 'female',
            'nationality' => 'Angolana',
        ]);
        $this->app->instance(IdentityDocumentOcrService::class, $ocr);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->create('bi.pdf', 100, 'application/pdf'),
        ])->assertOk()
            ->assertJsonPath('data.first_name', 'Ana')
            ->assertJsonPath('data.last_name', 'Maria Costa')
            ->assertJsonPath('data.id_document_number', '004928123LA042')
            ->assertJsonPath('data.birth_date', '1985-03-02')
            ->assertJsonPath('data.gender', 'female')
            ->assertJsonPath('data.nationality', 'Angolana');
    }

    public function test_ocr_sends_all_three_allowed_pdf_pages_within_the_request_budget(): void
    {
        $this->requirePoppler();

        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');
        config(['services.groq.key' => 'test-key']);
        Http::fake([
            'https://api.groq.com/openai/v1/chat/completions' => Http::response([
                'choices' => [['message' => ['content' => '{"first_name":"Ana","last_name":"Costa"}']]],
            ]),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->createWithContent('bi.pdf', $this->pdfWithPages(3)),
        ])->assertOk()
            ->assertJsonPath('data.first_name', 'Ana');

        Http::assertSent(fn ($request) => count(array_filter(
            $request->data()['messages'][0]['content'] ?? [],
            fn ($item) => ($item['type'] ?? null) === 'image_url',
        )) === 3 && $this->assertRequestBudget($request->data()));
    }

    public function test_ocr_endpoint_returns_service_unavailable_when_not_configured(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');
        config(['services.groq.key' => null]);

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

        config(['services.groq.key' => 'test-key']);
        Http::fake([
            'https://api.groq.com/openai/v1/chat/completions' => Http::response([
                'choices' => [['message' => ['content' => '{"first_name":null,"last_name":null}']]],
            ]),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->image('bi.jpg'),
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Não foram identificados dados legíveis. Tente um documento mais nítido e bem iluminado.');
    }

    public function test_ocr_does_not_send_a_prompt_that_exceeds_its_word_budget(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        config([
            'services.groq.key' => 'test-key',
            'services.groq.max_prompt_words' => 1,
        ]);
        Http::fake();

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->image('bi.jpg'),
        ])->assertUnprocessable();

        Http::assertNothingSent();
    }

    public function test_ocr_rejects_pdfs_with_more_pages_than_the_provider_image_limit(): void
    {
        $this->requirePoppler();

        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');
        config([
            'services.groq.key' => 'test-key',
            'services.groq.max_images' => 100,
            'services.groq.max_pdf_pages' => 100,
        ]);
        Http::fake();

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->createWithContent('bi.pdf', $this->pdfWithPages(4)),
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'A leitura inteligente não conseguiu processar este documento. Confirme se o ficheiro é válido e tente novamente. Detalhe: O PDF deve conter entre 1 e 3 páginas para leitura.');

        Http::assertNothingSent();
    }

    private function assertRequestBudget(array $payload): bool
    {
        $content = $payload['messages'][0]['content'] ?? [];
        $prompt = $content[0]['text'] ?? '';
        preg_match_all('/[\p{L}\p{N}_-]+/u', $prompt, $words);

        $images = array_values(array_filter(
            $content,
            fn ($item) => ($item['type'] ?? null) === 'image_url',
        ));
        if (count($images) > 3 || count($words[0] ?? []) > 80) {
            return false;
        }

        $rawImageBytes = 0;
        foreach ($images as $image) {
            $url = $image['image_url']['url'] ?? '';
            if (! is_string($url) || ! str_starts_with($url, 'data:image/jpeg;base64,')) {
                return false;
            }

            $bytes = base64_decode(substr($url, strlen('data:image/jpeg;base64,')), true);
            if ($bytes === false) {
                return false;
            }

            $rawImageBytes += strlen($bytes);
            $dimensions = getimagesizefromstring($bytes);
            if ($dimensions === false || max($dimensions[0], $dimensions[1]) > 1800) {
                return false;
            }
        }

        $encodedPayload = json_encode($payload);

        return ($payload['max_completion_tokens'] ?? 0) <= 256
            && (count($images) * 2048) + (count($words[0] ?? []) * 2) <= 6400
            && $rawImageBytes <= 12 * 1024 * 1024
            && is_string($encodedPayload)
            && strlen($encodedPayload) <= 20 * 1024 * 1024;
    }

    private function pdfWithPages(int $pageCount): string
    {
        $objects = [
            1 => '<< /Type /Catalog /Pages 2 0 R >>',
        ];
        $pageReferences = [];

        for ($page = 0; $page < $pageCount; $page++) {
            $pageObject = 3 + $page * 2;
            $contentObject = $pageObject + 1;
            $pageReferences[] = "{$pageObject} 0 R";
            $objects[$pageObject] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents {$contentObject} 0 R >>";
            $objects[$contentObject] = "<< /Length 0 >> stream\n\nendstream";
        }
        $objects[2] = '<< /Type /Pages /Kids ['.implode(' ', $pageReferences)."] /Count {$pageCount} >>";
        ksort($objects);

        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $id => $object) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$object}\nendobj\n";
        }

        $xrefOffset = strlen($pdf);
        $pdf .= "xref\n0 ".(count($objects) + 1)."\n0000000000 65535 f \n";
        for ($id = 1; $id <= count($objects); $id++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$id]);
        }

        return $pdf."trailer\n<< /Size ".(count($objects) + 1)." /Root 1 0 R >>\nstartxref\n{$xrefOffset}\n%%EOF\n";
    }

    private function requirePoppler(): void
    {
        try {
            $pdfInfo = new Process(['pdfinfo', '-v']);
            $pdfInfo->run();
        } catch (\RuntimeException) {
            $this->markTestSkipped('Poppler is required to validate PDF OCR limits.');
        }

        if (! $pdfInfo->isSuccessful()) {
            $this->markTestSkipped('Poppler is required to validate PDF OCR limits.');
        }
    }

    public function test_ocr_provider_error_is_returned_as_a_readable_validation_error(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');

        config(['services.groq.key' => 'test-key']);
        Http::fake([
            'https://api.groq.com/openai/v1/chat/completions' => Http::response([
                'error' => ['message' => 'Invalid API key'],
            ], 401),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->image('bi.jpg'),
        ])->assertStatus(502)
            ->assertJsonPath('message', 'O serviço de leitura respondeu com erro HTTP 401. Tente novamente mais tarde.');
    }

    public function test_ocr_rate_limit_is_returned_as_retryable_response(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id]);
        $admin->assignRole('admin');
        $this->actingAs($admin, 'sanctum');
        config(['services.groq.key' => 'test-key']);
        Http::fake([
            'https://api.groq.com/openai/v1/chat/completions' => Http::response(
                ['error' => ['message' => 'Rate limit reached']],
                429,
                ['Retry-After' => '10'],
            ),
        ]);

        $this->post('/api/v1/employees/ocr-id', [
            'image' => UploadedFile::fake()->image('bi.jpg'),
        ])->assertStatus(429)
            ->assertHeader('Retry-After', '10')
            ->assertJsonPath('message', 'O serviço de leitura atingiu temporariamente o limite de pedidos. Aguarde e tente novamente.');
    }
}
