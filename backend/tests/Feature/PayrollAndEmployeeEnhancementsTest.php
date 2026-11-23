<?php

namespace Tests\Feature;

use App\Models\Deduction;
use App\Models\DeductionInstallment;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeAsset;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\Position;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Tests\TestCase;
use ZipArchive;

class PayrollAndEmployeeEnhancementsTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([
            'view_any_employee', 'view_employee', 'create_employee', 'update_employee', 'delete_employee',
            'view_any_contract', 'view_contract', 'create_contract', 'update_contract',
            'view_any_payroll', 'view_payroll', 'process_payroll', 'approve_payroll', 'close_payroll',
            'view_any_document', 'view_document', 'create_document', 'update_document', 'delete_document',
        ] as $perm) {
            Permission::findOrCreate($perm, 'web');
        }

        $role = Role::findOrCreate('admin', 'web');
        $role->syncPermissions(Permission::all());

        $this->tenant = Tenant::factory()->create([
            'status' => 'active',
            'currency' => 'AOA',
        ]);
        app()->instance('currentTenant', $this->tenant);

        $this->admin = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'is_active' => true,
        ]);
        $this->admin->assignRole('admin');

        PayrollInssRule::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'INSS Angola',
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'version' => 1,
            'status' => 'active',
            'employee_rate' => 3.0,
            'employer_rate' => 8.0,
            'effective_from' => '2025-01-01',
            'validated_by' => $this->admin->id,
            'validated_at' => now(),
        ]);

        PayrollIrtTable::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'IRT Angola',
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'version' => 1,
            'status' => 'active',
            'effective_from' => '2025-01-01',
            'validated_by' => $this->admin->id,
            'validated_at' => now(),
            'brackets' => [
                ['order' => 1, 'min_amount' => 0, 'max_amount' => 100000, 'rate' => 0, 'fixed_amount' => 0, 'excess_over' => 0],
                ['order' => 2, 'min_amount' => 100001, 'max_amount' => null, 'rate' => 13, 'fixed_amount' => 0, 'excess_over' => 100000],
            ],
        ]);
    }

    public function test_can_manage_employee_assets_and_track_pending_liability(): void
    {
        Sanctum::actingAs($this->admin);

        $department = Department::factory()->create(['tenant_id' => $this->tenant->id]);
        $position = Position::factory()->create(['tenant_id' => $this->tenant->id, 'department_id' => $department->id]);
        $employee = Employee::factory()->create([
            'tenant_id' => $this->tenant->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        $createRes = $this->postJson("/api/v1/employees/{$employee->id}/assets", [
            'name' => 'MacBook Pro 14 M3',
            'category' => 'computer',
            'asset_code' => 'PAT-001',
            'serial_number' => 'SN-MBP-001',
            'condition' => 'new',
            'status' => 'assigned',
            'estimated_value' => 1200000,
            'chargeable_amount' => 1200000,
            'deduct_on_termination' => true,
            'assigned_at' => '2026-01-15',
        ]);

        $createRes->assertCreated()
            ->assertJsonPath('data.name', 'MacBook Pro 14 M3')
            ->assertJsonPath('data.pending_liability_amount', 1200000);

        $assetId = $createRes->json('data.id');

        $listRes = $this->getJson("/api/v1/employees/{$employee->id}/assets");
        $listRes->assertOk()
            ->assertJsonPath('data.summary.total_count', 1)
            ->assertJsonPath('data.summary.assigned_count', 1)
            ->assertJsonPath('data.summary.pending_liability_amount', 1200000);

        // Registar devolução em bom estado zera o valor imputável pendente
        $updateRes = $this->putJson("/api/v1/employees/{$employee->id}/assets/{$assetId}", [
            'status' => 'returned',
            'condition' => 'good',
            'chargeable_amount' => 0,
            'returned_at' => '2026-11-20',
        ]);

        $updateRes->assertOk()
            ->assertJsonPath('data.status', 'returned')
            ->assertJsonPath('data.pending_liability_amount', 0);
    }

    public function test_contract_termination_calculates_legal_settlement_and_discounts_advances_and_unreturned_assets(): void
    {
        Sanctum::actingAs($this->admin);

        $department = Department::factory()->create(['tenant_id' => $this->tenant->id]);
        $position = Position::factory()->create(['tenant_id' => $this->tenant->id, 'department_id' => $department->id]);
        $employee = Employee::factory()->create([
            'tenant_id' => $this->tenant->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'status' => 'active',
            'approval_status' => 'approved',
            'hired_at' => '2024-01-01',
        ]);

        $contract = EmployeeContract::query()->create([
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'contract_type' => 'permanent',
            'base_salary' => 300000,
            'salary_frequency' => 'monthly',
            'work_hours_per_week' => 40,
            'start_date' => '2024-01-01',
            'is_active' => true,
        ]);

        // Criar adiantamento com 3 parcelas (1 paga, 2 pendentes de 50.000 = 100.000 pendente)
        $deduction = Deduction::query()->create([
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'name' => 'Adiantamento Salarial',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'amount' => 50000,
            'total_amount' => 150000,
            'paid_amount' => 50000,
            'installment_count' => 3,
            'installment_amount' => 50000,
            'starts_at' => '2026-10-01',
            'is_recurring' => true,
            'status' => 'active',
        ]);

        DeductionInstallment::query()->insert([
            [
                'tenant_id' => $this->tenant->id,
                'employee_id' => $employee->id,
                'deduction_id' => $deduction->id,
                'installment_number' => 1,
                'reference_month' => '2026-10',
                'percentage' => 33.33,
                'amount' => 50000,
                'status' => 'paid',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'tenant_id' => $this->tenant->id,
                'employee_id' => $employee->id,
                'deduction_id' => $deduction->id,
                'installment_number' => 2,
                'reference_month' => '2026-11',
                'percentage' => 33.33,
                'amount' => 50000,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'tenant_id' => $this->tenant->id,
                'employee_id' => $employee->id,
                'deduction_id' => $deduction->id,
                'installment_number' => 3,
                'reference_month' => '2026-12',
                'percentage' => 33.34,
                'amount' => 50000,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        // Activo não devolvido com valor imputável de 40.000 AOA
        $asset = EmployeeAsset::query()->create([
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'name' => 'Telemóvel Corporativo',
            'category' => 'phone',
            'condition' => 'damaged',
            'status' => 'damaged_pending',
            'estimated_value' => 80000,
            'chargeable_amount' => 40000,
            'deduct_on_termination' => true,
            'is_settled' => false,
        ]);

        $previewRes = $this->postJson("/api/v1/contracts/{$contract->id}/termination-preview", [
            'termination_type' => 'employer_economic_redundancy',
            'termination_date' => '2026-11-15',
            'termination_reason' => 'Reestruturação orgânica do departamento',
        ]);

        $previewRes->assertOk()
            ->assertJsonPath('data.totals.pending_advances_total', 100000)
            ->assertJsonPath('data.totals.pending_assets_total', 40000);

        $gross = (float) $previewRes->json('data.totals.gross_settlement');
        $deductions = (float) $previewRes->json('data.totals.total_deductions');
        $net = (float) $previewRes->json('data.totals.net_settlement');

        $this->assertGreaterThan(300000, $gross);
        $this->assertGreaterThanOrEqual(140000, $deductions);
        $this->assertEqualsWithDelta($gross - $deductions, $net, 0.05);

        // Executar rescisão definitiva
        $termRes = $this->postJson("/api/v1/contracts/{$contract->id}/terminate", [
            'termination_type' => 'employer_economic_redundancy',
            'termination_date' => '2026-11-15',
            'termination_reason' => 'Reestruturação orgânica do departamento',
        ]);

        $termRes->assertOk()
            ->assertJsonPath('data.contract.is_active', false)
            ->assertJsonPath('data.contract.termination_type', 'employer_economic_redundancy');

        $this->assertSame('terminated', $employee->fresh()->status);
        $this->assertSame('completed', $deduction->fresh()->status);
        $this->assertEquals(150000, (float) $deduction->fresh()->paid_amount);
        $this->assertSame(0, $deduction->installments()->where('status', 'pending')->count());
        $this->assertTrue($asset->fresh()->is_settled);

        // Termo de Rescisão PDF
        $pdfRes = $this->get("/api/v1/contracts/{$contract->id}/termination.pdf");
        $pdfRes->assertOk();
    }

    public function test_processable_employees_returns_informative_advances_installments_and_pending_impacts(): void
    {
        Sanctum::actingAs($this->admin);

        $department = Department::factory()->create(['tenant_id' => $this->tenant->id]);
        $position = Position::factory()->create(['tenant_id' => $this->tenant->id, 'department_id' => $department->id]);
        $employee = Employee::factory()->create([
            'tenant_id' => $this->tenant->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        EmployeeContract::query()->create([
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'contract_type' => 'permanent',
            'base_salary' => 250000,
            'salary_frequency' => 'monthly',
            'start_date' => '2025-01-01',
            'is_active' => true,
        ]);

        $deduction = Deduction::query()->create([
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'name' => 'Adiantamento Emergencial',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'amount' => 30000,
            'total_amount' => 120000,
            'paid_amount' => 30000,
            'installment_count' => 4,
            'installment_amount' => 30000,
            'starts_at' => '2026-10-01',
            'is_recurring' => true,
            'status' => 'active',
        ]);

        DeductionInstallment::query()->insert([
            [
                'tenant_id' => $this->tenant->id,
                'employee_id' => $employee->id,
                'deduction_id' => $deduction->id,
                'installment_number' => 1,
                'reference_month' => '2026-10',
                'percentage' => 25,
                'amount' => 30000,
                'status' => 'paid',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'tenant_id' => $this->tenant->id,
                'employee_id' => $employee->id,
                'deduction_id' => $deduction->id,
                'installment_number' => 2,
                'reference_month' => '2026-11',
                'percentage' => 25,
                'amount' => 30000,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'tenant_id' => $this->tenant->id,
                'employee_id' => $employee->id,
                'deduction_id' => $deduction->id,
                'installment_number' => 3,
                'reference_month' => '2026-12',
                'percentage' => 25,
                'amount' => 30000,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'tenant_id' => $this->tenant->id,
                'employee_id' => $employee->id,
                'deduction_id' => $deduction->id,
                'installment_number' => 4,
                'reference_month' => '2027-01',
                'percentage' => 25,
                'amount' => 30000,
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $period = PayrollPeriod::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Novembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'payment_date' => '2026-11-30',
            'status' => 'open',
        ]);

        $res = $this->getJson("/api/v1/payroll/periods/{$period->id}/processable-employees");
        $res->assertOk()
            ->assertJsonPath('data.0.id', $employee->id)
            ->assertJsonPath('data.0.total_discount_this_period', 30000)
            ->assertJsonPath('data.0.advances_and_deductions.0.name', 'Adiantamento Emergencial')
            ->assertJsonPath('data.0.advances_and_deductions.0.installment_count', 4)
            ->assertJsonPath('data.0.advances_and_deductions.0.current_installment_number', 2)
            ->assertJsonPath('data.0.advances_and_deductions.0.current_installment_label', '2ª de 4 parcelas')
            ->assertJsonPath('data.0.advances_and_deductions.0.discount_amount_this_period', 30000)
            ->assertJsonPath('data.0.advances_and_deductions.0.remaining_balance', 90000);
    }

    public function test_can_edit_salary_and_lateness_and_delete_period_before_approval_and_blocks_after_approval(): void
    {
        Sanctum::actingAs($this->admin);

        $department = Department::factory()->create(['tenant_id' => $this->tenant->id]);
        $position = Position::factory()->create(['tenant_id' => $this->tenant->id, 'department_id' => $department->id]);

        $employees = Employee::factory()->count(3)->create([
            'tenant_id' => $this->tenant->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        foreach ($employees as $emp) {
            EmployeeContract::query()->create([
                'tenant_id' => $this->tenant->id,
                'employee_id' => $emp->id,
                'department_id' => $department->id,
                'position_id' => $position->id,
                'contract_type' => 'permanent',
                'base_salary' => 220000,
                'salary_frequency' => 'monthly',
                'start_date' => '2025-01-01',
                'is_active' => true,
            ]);
        }

        // 1. Criar período rascunho e eliminar antes da aprovação -> 200 OK
        $draftPeriod = PayrollPeriod::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Outubro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-10-01',
            'period_end' => '2026-10-31',
            'payment_date' => '2026-10-31',
            'status' => 'open',
        ]);
        $this->postJson("/api/v1/payroll/periods/{$draftPeriod->id}/process", [
            'employee_ids' => [$employees[0]->id],
        ])->assertOk();
        $this->deleteJson("/api/v1/payroll/periods/{$draftPeriod->id}")->assertOk();
        $this->assertDatabaseMissing('payroll_periods', ['id' => $draftPeriod->id]);

        // 2. Criar folha de Novembro 2026 e processar
        $period = PayrollPeriod::query()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Novembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'payment_date' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process", [
            'employee_ids' => $employees->pluck('id')->all(),
        ])->assertOk();

        // 3. Tentar sobrescrever manualmente INSS ou IRT é bloqueado com 422
        $this->postJson("/api/v1/payroll/periods/{$period->id}/recalculate", [
            'records' => [
                [
                    'employee_id' => $employees[0]->id,
                    'components' => ['inss' => 0, 'irt' => 0],
                ],
            ],
        ])->assertStatus(422);

        // 4. Antes da aprovação: editar salário base, atraso de 5000 (minutos, mesmo sem configuração horária explícita) e eliminar em massa
        $recalcRes = $this->postJson("/api/v1/payroll/periods/{$period->id}/recalculate", [
            'records' => [
                [
                    'employee_id' => $employees[0]->id,
                    'late_minutes' => 5000,
                    'components' => [
                        'base_salary' => 330000,
                    ],
                ],
                [
                    'employee_id' => $employees[1]->id,
                    'components' => [
                        'lateness' => 5000,
                    ],
                ],
            ],
        ]);

        $recalcRes->assertOk();

        $rec0 = $period->records()->where('employee_id', $employees[0]->id)->with('items')->firstOrFail();
        $this->assertSame(330000.0, (float) $rec0->base_salary);
        // 5000 min sobre 330.000 / 220 (= 1500/h): round((5000/60)*1500, 2) = 125000.00 de desconto por atraso!
        $latenessItem0 = $rec0->items->firstWhere('code', 'lateness');
        $this->assertNotNull($latenessItem0);
        $this->assertSame(-125000.0, (float) $latenessItem0->amount);
        // INSS recalculado automaticamente sobre novo salário base (3% de 330.000 = 9.900)
        $this->assertSame(-9900.0, (float) $rec0->items->firstWhere('code', 'inss')?->amount);

        $rec1 = $period->records()->where('employee_id', $employees[1]->id)->with('items')->firstOrFail();
        $this->assertSame(-5000.0, (float) $rec1->items->firstWhere('code', 'lateness')?->amount);

        // Eliminar 1 funcionário da folha antes da aprovação
        $rec2Id = $period->records()->where('employee_id', $employees[2]->id)->value('id');
        $this->postJson("/api/v1/payroll/periods/{$period->id}/records/bulk-delete", [
            'record_ids' => [$rec2Id],
        ])->assertOk()->assertJsonPath('data.employee_count', 2);

        // 5. Aprovar a folha -> bloqueia eliminação da folha, edição de registos e remoção de registos
        $this->postJson("/api/v1/payroll/periods/{$period->id}/approve")->assertOk();
        $this->assertSame('approved', $period->fresh()->status);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/recalculate", [
            'records' => [['employee_id' => $employees[0]->id, 'work_days' => 15]],
        ])->assertStatus(422);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/records/bulk-delete", [
            'record_ids' => [$rec1->id],
        ])->assertStatus(422);

        $this->deleteJson("/api/v1/payroll/periods/{$period->id}")->assertStatus(422);
    }

    public function test_employee_timeline_captures_all_changes_and_events_involving_employee(): void
    {
        Sanctum::actingAs($this->admin);

        $department = Department::factory()->create(['tenant_id' => $this->tenant->id]);
        $position = Position::factory()->create(['tenant_id' => $this->tenant->id, 'department_id' => $department->id]);
        $employee = Employee::factory()->create([
            'tenant_id' => $this->tenant->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        // Alteração de dados do perfil
        $this->putJson("/api/v1/employees/{$employee->id}", [
            'phone' => '+244 923 000 111',
        ])->assertOk();

        // Novo contrato
        $this->postJson("/api/v1/employees/{$employee->id}/contracts", [
            'contract_type' => 'permanent',
            'base_salary' => 280000,
            'salary_frequency' => 'monthly',
            'start_date' => '2026-01-01',
        ])->assertCreated();

        // Atribuição de activo
        $this->postJson("/api/v1/employees/{$employee->id}/assets", [
            'name' => 'Portátil Dell Latitude',
            'category' => 'computer',
            'condition' => 'new',
            'status' => 'assigned',
            'estimated_value' => 950000,
        ])->assertCreated();

        // Adiantamento salarial
        $deduction = Deduction::query()->create([
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'name' => 'Empréstimo Interno',
            'deduction_type' => 'loan',
            'amount_type' => 'fixed',
            'amount' => 25000,
            'total_amount' => 50000,
            'status' => 'active',
        ]);

        $timelineRes = $this->getJson("/api/v1/employees/{$employee->id}/timeline");
        $timelineRes->assertOk();

        $categories = collect($timelineRes->json('data'))->pluck('category')->unique()->all();
        $this->assertContains('profile', $categories);
        $this->assertContains('contract', $categories);
        $this->assertContains('asset', $categories);
        $this->assertContains('deduction', $categories);
    }

    public function test_can_preview_docx_document_in_application(): void
    {
        Sanctum::actingAs($this->admin);
        Storage::fake('local');

        $employee = Employee::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'active',
        ]);

        $tmpDocx = tempnam(sys_get_temp_dir(), 'test_docx_');
        $zip = new ZipArchive;
        $zip->open($tmpDocx, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString('word/document.xml', <<<'XML'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Adenda ao Contrato de Trabalho</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Cláusula Primeira:</w:t></w:r>
      <w:r><w:t> O colaborador exercerá funções em Luanda.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>
XML);
        $zip->close();

        $docxBytes = file_get_contents($tmpDocx);
        @unlink($tmpDocx);

        Storage::disk('local')->put('documents/adenda-contrato.docx', $docxBytes);

        $doc = EmployeeDocument::query()->create([
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'uploader_id' => $this->admin->id,
            'name' => 'Adenda Contratual 2026',
            'document_type' => 'contract_doc',
            'file_path' => 'documents/adenda-contrato.docx',
            'original_name' => 'adenda-contrato.docx',
            'mime_type' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'file_size' => strlen($docxBytes),
        ]);

        $res = $this->getJson("/api/v1/documents/{$doc->id}/preview");
        $res->assertOk()
            ->assertJsonPath('data.format', 'docx')
            ->assertJsonPath('data.paragraphs_count', 2);

        $html = (string) $res->json('data.html');
        $this->assertStringContainsString('<h1>Adenda ao Contrato de Trabalho</h1>', $html);
        $this->assertStringContainsString('<strong>Cláusula Primeira:</strong>', $html);
    }
}
