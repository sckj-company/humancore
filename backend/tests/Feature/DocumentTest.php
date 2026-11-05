<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Models\Tenant;
use App\Models\User;
use App\Services\CloudinaryService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DocumentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    protected function setupEmployeeUser(string $role): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $employee = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole($role);

        return [$tenant, $employee, $user];
    }

    public function test_hr_manager_can_upload_document(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('hr-manager');
        $other = Employee::factory()->create(['tenant_id' => $tenant->id]);
        $this->mock(CloudinaryService::class)
            ->shouldReceive('upload')
            ->once()
            ->andReturn(['url' => 'https://res.cloudinary.com/test/raw/upload/certificado.pdf', 'bytes' => 2048]);

        $this->actingAs($user, 'sanctum');

        $this->post('/api/v1/documents', [
            'employee_id' => $other->id,
            'name' => 'Certificado de Formação',
            'document_type' => 'certification',
            'file' => UploadedFile::fake()->create('certificado.pdf', 2048, 'application/pdf'),
        ])->assertCreated()->assertJson(['success' => true]);

        $this->assertDatabaseHas('employee_documents', [
            'tenant_id' => $tenant->id,
            'employee_id' => $other->id,
            'name' => 'Certificado de Formação',
            'file_path' => 'https://res.cloudinary.com/test/raw/upload/certificado.pdf',
        ]);
    }

    public function test_employee_cannot_upload_document(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('employee');

        $this->actingAs($user, 'sanctum');

        $this->post('/api/v1/documents', [
            'employee_id' => $employee->id,
            'name' => 'Sem permissão',
            'document_type' => 'other',
            'file' => UploadedFile::fake()->create('doc.pdf', 100),
        ])->assertForbidden();
    }

    public function test_employee_sees_only_own_documents(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('employee');
        $other = Employee::factory()->create(['tenant_id' => $tenant->id]);
        $owner = Employee::factory()->create(['tenant_id' => $tenant->id]);

        EmployeeDocument::factory()->forEmployee($employee)->create(['name' => 'Meu doc']);
        EmployeeDocument::factory()->forEmployee($other)->create(['name' => 'Doc de outrem']);

        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/documents')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonMissing(['name' => 'Doc de outrem']);
    }

    public function test_manager_can_download_document_of_employee(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('manager');

        Storage::fake('local');
        $document = EmployeeDocument::factory()->forEmployee($employee)->create();
        Storage::disk('local')->put($document->file_path, 'conteudo pdf');

        $this->actingAs($user, 'sanctum');

        $this->get('/api/v1/documents/'.$document->id.'/download')
            ->assertOk();
    }

    public function test_cloudinary_pdf_download_uses_attachment_name_without_extension(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('manager');
        $document = EmployeeDocument::factory()->forEmployee($employee)->create([
            'tenant_id' => $tenant->id,
            'file_path' => 'https://res.cloudinary.com/example/image/upload/v1234567890/humancore/tenants/1/documents/bi.pdf',
            'original_name' => 'copiadebi.pdf',
            'mime_type' => 'application/pdf',
        ]);

        $this->actingAs($user, 'sanctum')
            ->get('/api/v1/documents/'.$document->id.'/download')
            ->assertRedirect('https://res.cloudinary.com/example/image/upload/fl_attachment:copiadebi/v1234567890/humancore/tenants/1/documents/bi.pdf');
    }

    public function test_upload_does_not_fall_back_to_local_storage_when_cloudinary_is_unconfigured(): void
    {
        Storage::fake('local');
        config([
            'services.cloudinary.cloud_name' => '',
            'services.cloudinary.api_key' => '',
            'services.cloudinary.api_secret' => '',
        ]);

        try {
            app(CloudinaryService::class)->upload(
                UploadedFile::fake()->create('document.pdf', 100, 'application/pdf'),
                'humancore/test',
            );
            $this->fail('O upload devia falhar quando o Cloudinary não está configurado.');
        } catch (\RuntimeException $exception) {
            $this->assertSame('O Cloudinary não está configurado.', $exception->getMessage());
        }

        Storage::disk('local')->assertDirectoryEmpty('test');
    }

    public function test_employee_cannot_download_document_of_other_employee(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('employee');
        $other = Employee::factory()->create(['tenant_id' => $tenant->id]);

        Storage::fake('local');
        $document = EmployeeDocument::factory()->forEmployee($other)->create();

        $this->actingAs($user, 'sanctum');

        $this->get('/api/v1/documents/'.$document->id.'/download')
            ->assertForbidden();
    }

    public function test_cross_tenant_document_is_not_accessible(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('hr-manager');
        $otherTenant = Tenant::factory()->create();
        $otherEmployee = Employee::factory()->create(['tenant_id' => $otherTenant->id]);
        $document = EmployeeDocument::factory()->create([
            'tenant_id' => $otherTenant->id,
            'employee_id' => $otherEmployee->id,
        ]);

        $this->actingAs($user, 'sanctum');

        $this->get('/api/v1/documents/'.$document->id.'/download')
            ->assertNotFound();
    }
}
