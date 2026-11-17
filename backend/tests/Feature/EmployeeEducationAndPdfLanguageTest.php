<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Deduction;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeEducation;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\Position;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class EmployeeEducationAndPdfLanguageTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenantAdmin(): array
    {
        $tenant = Tenant::factory()->create(['name' => 'Empresa Teste Lda', 'currency' => 'AOA']);
        $user = User::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Gestor RH']);
        Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $user->assignRole('admin');

        $department = Department::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Operações']);
        $position = Position::query()->create(['tenant_id' => $tenant->id, 'department_id' => $department->id, 'title' => 'Técnico']);

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'first_name' => 'João',
            'last_name' => 'Manuel',
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 250000,
            'contract_type' => 'permanent',
            'start_date' => '2026-01-01',
            'is_active' => true,
        ]);

        PayrollInssRule::query()->create([
            'tenant_id' => $tenant->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'employee_rate' => 3.0,
            'employer_rate' => 8.0,
            'effective_from' => '2026-01-01',
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $user->id,
        ]);

        PayrollIrtTable::query()->create([
            'tenant_id' => $tenant->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'effective_from' => '2026-01-01',
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $user->id,
            'brackets' => [
                ['from' => 0, 'to' => 100000, 'fixed' => 0, 'rate' => 0, 'excess_over' => 0],
                ['from' => 100000, 'to' => 99999999, 'fixed' => 0, 'rate' => 10, 'excess_over' => 100000],
            ],
        ]);

        return [$tenant, $user, $employee];
    }

    public function test_employee_education_crud_uploads_and_pdf_languages(): void
    {
        Storage::fake('local');
        [, $user, $employee] = $this->setupTenantAdmin();
        $this->actingAs($user, 'sanctum');

        // Validation: reason is required
        $this->postJson("/api/v1/employees/{$employee->id}/educations", [
            'title' => 'Sem motivo',
        ])->assertStatus(422);

        $attachment = UploadedFile::fake()->create('evidencia.pdf', 50, 'application/pdf');
        $created = $this->post("/api/v1/employees/{$employee->id}/educations", [
            'title' => 'Incumprimento de procedimento de segurança',
            'occurred_on' => '2026-11-10',
            'reason' => 'Utilização do equipamento sem capacete de proteção na área operacional.',
            'sanction_warning' => 'Em caso de reincidência será aplicada suspensão disciplinar.',
            'document' => $attachment,
        ])->assertCreated();

        $educationId = $created->json('data.id');
        $this->assertTrue($created->json('data.has_document'));
        $this->assertFalse($created->json('data.has_signed_document'));

        // List educations
        $this->getJson("/api/v1/employees/{$employee->id}/educations")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $educationId);

        // Download attachment
        $this->get("/api/v1/employees/{$employee->id}/educations/{$educationId}/documents/attachment")
            ->assertOk();

        // Update education
        $this->putJson("/api/v1/employees/{$employee->id}/educations/{$educationId}", [
            'title' => 'Incumprimento de EPI',
            'reason' => 'Não utilização de equipamento de proteção individual no turno.',
            'occurred_on' => '2026-11-11',
        ])->assertOk()->assertJsonPath('data.title', 'Incumprimento de EPI');

        // Upload signed document via base64 JSON fallback
        $base64Pdf = base64_encode("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF");
        $this->postJson("/api/v1/employees/{$employee->id}/educations/{$educationId}/signed-document", [
            'document_base64' => "data:application/pdf;base64,{$base64Pdf}",
            'document_name' => 'educacao-assinada.pdf',
            'document_mime' => 'application/pdf',
        ])->assertOk()->assertJsonPath('data.has_signed_document', true);

        $this->get("/api/v1/employees/{$employee->id}/educations/{$educationId}/documents/signed")
            ->assertOk();

        // PDF endpoints in both PT and Bilingual modes
        $ptPdf = $this->get("/api/v1/employees/{$employee->id}/educations/{$educationId}/receipt.pdf?lang=pt")
            ->assertOk();
        $this->assertStringStartsWith('%PDF-', $ptPdf->getContent());

        $biPdf = $this->get("/api/v1/employees/{$employee->id}/educations/{$educationId}/receipt.pdf?lang=bilingual")
            ->assertOk();
        $this->assertStringStartsWith('%PDF-', $biPdf->getContent());

        // Blade HTML verification for PT vs Bilingual + free signature area
        $education = EmployeeEducation::query()->findOrFail($educationId);
        $employee->loadMissing(['tenant', 'department', 'position']);

        $htmlPt = view('pdf.employee-education', [
            'employee' => $employee,
            'education' => $education,
            'operatorName' => $user->name,
            'lang' => 'pt',
            'isBilingual' => false,
        ])->render();
        $this->assertStringContainsString('TERMO DE EDUCAÇÃO E AVISO', $htmlPt);
        $this->assertStringContainsString('Área Livre para Assinaturas', $htmlPt);
        $this->assertStringNotContainsString('员工教育与警示通知书', $htmlPt);

        $htmlBi = view('pdf.employee-education', [
            'employee' => $employee,
            'education' => $education,
            'operatorName' => $user->name,
            'lang' => 'bilingual',
            'isBilingual' => true,
        ])->render();
        $this->assertStringContainsString('员工教育与警示通知书', $htmlBi);
        $this->assertStringContainsString('全体人员自由签名区', $htmlBi);

        // Tenant isolation: another tenant user cannot access
        $otherTenant = Tenant::factory()->create();
        $otherUser = User::factory()->create(['tenant_id' => $otherTenant->id]);
        $otherUser->assignRole('admin');
        $this->actingAs($otherUser, 'sanctum');
        $this->getJson("/api/v1/employees/{$employee->id}/educations")->assertNotFound();

        // Delete back as original admin
        $this->actingAs($user, 'sanctum');
        $this->deleteJson("/api/v1/employees/{$employee->id}/educations/{$educationId}")->assertOk();
        $this->assertSoftDeleted('employee_educations', ['id' => $educationId]);
    }

    public function test_general_education_without_employee_crud_uploads_and_pdf_languages(): void
    {
        Storage::fake('local');
        [, $user, $employee] = $this->setupTenantAdmin();
        $this->actingAs($user, 'sanctum');

        $created = $this->postJson('/api/v1/educations', [
            'title' => 'Uso obrigatório de EPI na oficina',
            'occurred_on' => '2026-11-17',
            'reason' => 'Todos os colaboradores devem usar equipamento de proteção durante o horário laboral.',
            'sanction_warning' => 'O incumprimento após este aviso geral implicará processo disciplinar.',
        ])->assertCreated();

        $generalId = $created->json('data.id');
        $this->assertNull($created->json('data.employee_id'));
        $this->assertTrue($created->json('data.is_general'));

        // Should appear in general educations list, and NOT in specific employee educations list
        $this->getJson('/api/v1/educations')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $generalId);

        $this->getJson("/api/v1/employees/{$employee->id}/educations")
            ->assertOk()
            ->assertJsonCount(0, 'data');

        // Upload signed document for general education
        $file = UploadedFile::fake()->create('educacao-geral-assinada.pdf', 80, 'application/pdf');
        $this->post("/api/v1/educations/{$generalId}/signed-document", [
            'document' => $file,
        ])->assertOk()->assertJsonPath('data.has_signed_document', true);

        $this->get("/api/v1/educations/{$generalId}/documents/signed")->assertOk();

        // PDF in both PT and Bilingual
        $ptPdf = $this->get("/api/v1/educations/{$generalId}/receipt.pdf?lang=pt")->assertOk();
        $this->assertStringStartsWith('%PDF-', $ptPdf->getContent());

        $biPdf = $this->get("/api/v1/educations/{$generalId}/receipt.pdf?lang=bilingual")->assertOk();
        $this->assertStringStartsWith('%PDF-', $biPdf->getContent());

        $education = EmployeeEducation::query()->with(['creator', 'tenant'])->findOrFail($generalId);
        $htmlPt = view('pdf.employee-education', [
            'employee' => null,
            'tenant' => $education->tenant,
            'education' => $education,
            'operatorName' => $user->name,
            'lang' => 'pt',
            'isBilingual' => false,
        ])->render();
        $this->assertStringContainsString('TERMO DE EDUCAÇÃO GERAL E AVISO', $htmlPt);
        $this->assertStringContainsString('Educação Geral — Todos os Trabalhadores', $htmlPt);
        $this->assertStringNotContainsString('Identificação do Trabalhador', $htmlPt);
        $this->assertStringNotContainsString('全员通用教育与警示通知书', $htmlPt);

        $htmlBi = view('pdf.employee-education', [
            'employee' => null,
            'tenant' => $education->tenant,
            'education' => $education,
            'operatorName' => $user->name,
            'lang' => 'bilingual',
            'isBilingual' => true,
        ])->render();
        $this->assertStringContainsString('全员通用教育与警示通知书', $htmlBi);
        $this->assertStringContainsString('全体人员自由签名区', $htmlBi);

        // Tenant isolation
        $otherTenant = Tenant::factory()->create();
        $otherUser = User::factory()->create(['tenant_id' => $otherTenant->id]);
        $otherUser->assignRole('admin');
        $this->actingAs($otherUser, 'sanctum');
        $this->getJson("/api/v1/educations/{$generalId}/receipt.pdf")->assertNotFound();

        $this->actingAs($user, 'sanctum');
        $this->deleteJson("/api/v1/educations/{$generalId}")->assertOk();
        $this->assertSoftDeleted('employee_educations', ['id' => $generalId]);
    }

    public function test_all_system_pdfs_support_portuguese_only_and_bilingual_modes_and_irt_total(): void
    {
        [$tenant, $user, $employee] = $this->setupTenantAdmin();
        $this->actingAs($user, 'sanctum');

        $period = PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process", [
            'employee_ids' => [$employee->id],
        ])->assertOk();

        $record = PayrollRecord::query()->where('payroll_period_id', $period->id)->firstOrFail();

        // Payslip PDF (PT and Bilingual)
        $payslipPt = $this->get("/api/v1/payroll/records/{$record->id}/payslip.pdf?lang=pt")->assertOk();
        $this->assertStringStartsWith('%PDF-', $payslipPt->getContent());
        $payslipBi = $this->get("/api/v1/payroll/records/{$record->id}/payslip.pdf?lang=bilingual")->assertOk();
        $this->assertStringStartsWith('%PDF-', $payslipBi->getContent());

        // Payroll period PDF (PT and Bilingual) + IRT total check in Blade view
        $periodPt = $this->get("/api/v1/payroll/periods/{$period->id}/payslip.pdf?lang=pt")->assertOk();
        $this->assertStringStartsWith('%PDF-', $periodPt->getContent());
        $periodBi = $this->get("/api/v1/payroll/periods/{$period->id}/payslip.pdf?lang=bilingual")->assertOk();
        $this->assertStringStartsWith('%PDF-', $periodBi->getContent());

        $period->loadMissing('tenant', 'processedBy', 'approvedBy', 'records.employee', 'records.contract.position', 'records.items.deduction');
        $periodHtmlPt = view('pdf.payroll-period', [
            'period' => $period,
            'operatorName' => $user->name,
            'lang' => 'pt',
            'isBilingual' => false,
        ])->render();
        $this->assertStringContainsString('IRT total', $periodHtmlPt);
        $this->assertStringNotContainsString('工资表', $periodHtmlPt);

        $periodHtmlBi = view('pdf.payroll-period', [
            'period' => $period,
            'operatorName' => $user->name,
            'lang' => 'bilingual',
            'isBilingual' => true,
        ])->render();
        $this->assertStringContainsString('工资所得税总额', $periodHtmlBi);

        // Deduction receipt PDF (PT and Bilingual, single page)
        $deductionRes = $this->postJson('/api/v1/deductions', [
            'employee_id' => $employee->id,
            'name' => 'Vale Teste Idioma',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'total_amount' => 50000,
        ])->assertCreated();
        $deductionId = $deductionRes->json('data.id');

        $dedPt = $this->get("/api/v1/deductions/{$deductionId}/receipt.pdf?lang=pt")->assertOk();
        $this->assertStringStartsWith('%PDF-', $dedPt->getContent());
        $this->assertSame(1, preg_match_all('/\/Type\s*\/Page\b/', $dedPt->getContent()));

        $dedBi = $this->get("/api/v1/deductions/{$deductionId}/receipt.pdf?lang=bilingual")->assertOk();
        $this->assertStringStartsWith('%PDF-', $dedBi->getContent());
        $this->assertSame(1, preg_match_all('/\/Type\s*\/Page\b/', $dedBi->getContent()));

        $deduction = Deduction::query()->with(['tenant', 'employee.department', 'employee.position', 'approver', 'installments.payrollPeriod'])->findOrFail($deductionId);
        $dedHtmlBi = view('pdf.deduction-receipt', [
            'deduction' => $deduction,
            'operatorName' => $user->name,
            'lang' => 'bilingual',
            'isBilingual' => true,
        ])->render();
        $this->assertStringContainsString('预支工资 / 借款凭证', $dedHtmlBi);

        // Attendance Report PDF (PT and Bilingual)
        AttendanceRecord::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-11-10',
            'status' => 'present',
            'total_worked' => 480,
        ]);

        $attPt = $this->get('/api/v1/attendance/report.pdf?period_type=monthly&month=2026-11&lang=pt')->assertOk();
        $this->assertStringStartsWith('%PDF-', $attPt->getContent());
        $attBi = $this->get('/api/v1/attendance/report.pdf?period_type=monthly&month=2026-11&lang=bilingual')->assertOk();
        $this->assertStringStartsWith('%PDF-', $attBi->getContent());
    }
}
