<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Models\Tenant;
use App\Models\User;
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
            ->assertJsonCount(1, 'data')
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
