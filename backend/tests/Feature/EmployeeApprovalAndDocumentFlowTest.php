<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Models\PayrollPeriod;
use App\Models\Setting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\CloudinaryService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class EmployeeApprovalAndDocumentFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);

        $mockCloudinary = $this->createMock(CloudinaryService::class);
        $mockCloudinary->method('upload')->willReturn([
            'url' => 'https://example.test/doc.pdf',
            'bytes' => 1024,
        ]);
        $this->app->instance(CloudinaryService::class, $mockCloudinary);
    }

    public function test_optional_documents_do_not_block_employee_creation_while_mandatory_ones_do(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'is_active' => true]);
        $admin->assignRole('admin');

        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'documents', 'key' => 'required'],
            [
                'type' => 'json',
                'value' => [
                    ['type' => 'id_card', 'label' => 'BI', 'required' => true],
                    ['type' => 'vaccination_card', 'label' => 'Cartão de Vacinas', 'required' => false],
                ],
            ],
        );

        $this->actingAs($admin, 'sanctum');

        // Sem documento obrigatório -> 422
        $this->post('/api/v1/employees', [
            'first_name' => 'Ana',
            'phone' => '+244923000010',
            'status' => 'active',
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('documents');

        // Apenas com o obrigatório (sem apelido e sem email; opcional ausente) -> 201 e estado pendente
        $res = $this->post('/api/v1/employees', [
            'first_name' => 'Ana',
            'phone' => '+244923000010',
            'status' => 'active',
            'documents' => [UploadedFile::fake()->create('bi.pdf', 100, 'application/pdf')],
            'document_names' => ['BI'],
            'document_types' => ['id_card'],
        ], ['Accept' => 'application/json'])->assertCreated();

        $res->assertJsonPath('data.approval_status', 'pending');

        // Override bilateral com telefone alternativo apenas (sem principal, email ou apelido) -> 201
        $overrideRes = $this->post('/api/v1/employees', [
            'first_name' => 'Bruno',
            'alternative_phone' => '+244923000011',
            'status' => 'active',
            'optional_document_types' => ['id_card'],
        ], ['Accept' => 'application/json'])->assertCreated();

        $overrideRes->assertJsonPath('data.approval_status', 'pending');

        // Sem nenhum telefone -> 422 no campo phone
        $this->post('/api/v1/employees', [
            'first_name' => 'SemTelefone',
            'status' => 'active',
            'optional_document_types' => ['id_card'],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('phone');

        // Override inverso: documento opcional promovido a obrigatório na criação -> 422 se faltar
        $this->post('/api/v1/employees', [
            'first_name' => 'Celia',
            'phone' => '+244923000012',
            'status' => 'active',
            'optional_document_types' => ['id_card'],
            'required_document_types' => ['vaccination_card'],
        ], ['Accept' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('documents');
    }

    public function test_pending_employee_workflow_blocks_operations_until_documents_verified_and_approved(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $admin = User::factory()->create(['tenant_id' => $tenant->id, 'is_active' => true]);
        $admin->assignRole('admin');

        $dept = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Operações',
            'code' => 'OPS',
            'status' => 'active',
        ]);

        $this->actingAs($admin, 'sanctum');

        $createRes = $this->post('/api/v1/employees', [
            'first_name' => 'Carlos',
            'last_name' => 'Mendes',
            'email' => 'carlos.pending@test.ao',
            'phone' => '+244923000013',
            'status' => 'active',
            'department_id' => $dept->id,
            'contract_type' => 'permanent',
            'base_salary' => 250000,
            'documents' => [UploadedFile::fake()->create('contrato.pdf', 120, 'application/pdf')],
            'document_names' => ['Contrato Assinado'],
            'document_types' => ['contract'],
        ], ['Accept' => 'application/json'])->assertCreated();

        $empId = $createRes->json('data.id');
        $doc = EmployeeDocument::query()->where('employee_id', $empId)->firstOrFail();

        $this->assertEquals('pending', $createRes->json('data.approval_status'));
        $this->assertFalse((bool) $doc->is_verified);

        // Operações bloqueadas enquanto Pendente
        $this->postJson('/api/v1/attendance/toggle', ['employee_id' => $empId])->assertUnprocessable();
        $this->postJson('/api/v1/deductions', [
            'employee_id' => $empId,
            'name' => 'Vale',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'amount' => 10000,
        ])->assertUnprocessable();

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Dezembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-12-01',
            'period_end' => '2026-12-31',
            'status' => 'open',
        ]);

        $processable = $this->getJson("/api/v1/payroll/periods/{$period->id}/processable-employees")->assertOk();
        $this->assertEmpty($processable->json('data'));

        // Não pode aprovar antes de verificar os documentos
        $this->patchJson("/api/v1/employees/{$empId}/approval", [
            'approval_status' => 'approved',
        ])->assertUnprocessable();

        // Verificar documento
        $this->patchJson("/api/v1/documents/{$doc->id}/verify", [
            'is_verified' => true,
        ])->assertOk()->assertJsonPath('data.is_verified', true);

        // Agora aprovação funciona
        $this->patchJson("/api/v1/employees/{$empId}/approval", [
            'approval_status' => 'approved',
        ])->assertOk()->assertJsonPath('data.approval_status', 'approved');

        // Passa a estar elegível para folha e operações
        $processableAfter = $this->getJson("/api/v1/payroll/periods/{$period->id}/processable-employees")->assertOk();
        $this->assertCount(1, $processableAfter->json('data'));

        $this->postJson('/api/v1/attendance/toggle', ['employee_id' => $empId])->assertOk();

        // Pode voltar a mudar estado de Aprovado para Pendente
        $this->patchJson("/api/v1/employees/{$empId}/approval", [
            'approval_status' => 'pending',
        ])->assertOk()->assertJsonPath('data.approval_status', 'pending');
    }
}
