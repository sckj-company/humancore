<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollPeriod;
use App\Models\PayrollPeriodReport;
use App\Models\PayrollPeriodReportDocument;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PayrollPeriodReportTest extends TestCase
{
    use RefreshDatabase;

    private Tenant $tenant;

    private User $hrManager;

    private PayrollPeriod $period;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);

        $this->tenant = Tenant::factory()->create(['name' => 'Empresa Relatório Lda', 'tax_id' => '5400001111']);
        app(TenantManager::class)->set($this->tenant);

        $this->hrManager = User::factory()->create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Gestora RH',
            'is_active' => true,
        ]);
        $this->hrManager->assignRole('hr-manager');

        $employee = Employee::factory()->create([
            'tenant_id' => $this->tenant->id,
            'status' => 'active',
        ]);

        EmployeeContract::factory()->create([
            'tenant_id' => $this->tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 250000,
            'is_active' => true,
            'start_date' => '2026-01-01',
        ]);

        $this->actingAs($this->hrManager, 'sanctum');

        $this->period = PayrollPeriod::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Maio/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-05-01',
            'period_end' => '2026-05-31',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$this->period->id}/process")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$this->period->id}/approve")->assertOk();
        $this->period->refresh();
    }

    public function test_non_approved_period_cannot_manage_reports(): void
    {
        $openPeriod = PayrollPeriod::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Junho/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-06-01',
            'period_end' => '2026-06-30',
            'status' => 'completed',
        ]);

        $this->putJson("/api/v1/payroll/periods/{$openPeriod->id}/report", [
            'inss_guide_sent' => true,
            'inss_payment_proof_sent' => true,
            'inss_paid' => true,
            'payslips_summary_sent' => true,
            'payroll_sheet_sent' => true,
            'is_summary_complete' => true,
        ])->assertStatus(422);
    }

    public function test_hr_can_save_mandatory_states_upload_n_documents_attach_system_pdfs_and_toggle_states(): void
    {
        // Mandatory boolean validation enforced
        $this->putJson("/api/v1/payroll/periods/{$this->period->id}/report", [
            'title' => 'Relatório Incompleto',
        ])->assertStatus(422);

        // Save initial states
        $this->putJson("/api/v1/payroll/periods/{$this->period->id}/report", [
            'title' => 'Fecho Mensal Maio/2026',
            'notes' => 'Enviado à contabilidade',
            'inss_guide_sent' => true,
            'inss_payment_proof_sent' => false,
            'inss_paid' => false,
            'payslips_summary_sent' => false,
            'payroll_sheet_sent' => false,
            'is_summary_complete' => false,
        ])
            ->assertOk()
            ->assertJsonPath('data.inss_guide_sent', true)
            ->assertJsonPath('data.inss_paid', false)
            ->assertJsonPath('data.has_inss_payment_proof', false);

        // Upload N documents (INSS Guide PDF, INSS Payment Proof PNG, and IRT Guide)
        $guideFile = UploadedFile::fake()->create('guia-inss.pdf', 120, 'application/pdf');
        $proofImage = UploadedFile::fake()->image('comprovativo-inss.png', 800, 600);
        $irtFile = UploadedFile::fake()->create('guia-irt.pdf', 90, 'application/pdf');

        $this->post("/api/v1/payroll/periods/{$this->period->id}/report/documents", [
            'document_type' => 'inss_guide',
            'title' => 'Guia INSS Maio',
            'is_paid' => '0',
            'is_sent' => '1',
            'file' => $guideFile,
        ])->assertCreated();

        $proofResponse = $this->post("/api/v1/payroll/periods/{$this->period->id}/report/documents", [
            'document_type' => 'inss_payment_proof',
            'title' => 'Talão Depósito INSS',
            'is_paid' => 'false',
            'is_sent' => 'true',
            'notes' => 'Referência TPA 99123',
            'file' => $proofImage,
        ])->assertCreated();

        $proofDocId = $proofResponse->json('data.document.id');

        $this->post("/api/v1/payroll/periods/{$this->period->id}/report/documents", [
            'document_type' => 'irt_guide',
            'title' => 'Guia IRT Maio',
            'is_paid' => '1',
            'is_sent' => '1',
            'file' => $irtFile,
        ])->assertCreated();

        // Attach system-generated payroll sheet, bulk payslips summary, and attendance report
        $sheetAttach = $this->postJson("/api/v1/payroll/periods/{$this->period->id}/report/documents/attach-system", [
            'document_type' => 'payroll_sheet',
            'is_sent' => true,
            'is_paid' => false,
            'lang' => 'bilingual',
        ])->assertCreated();

        $sheetDocId = $sheetAttach->json('data.document.id');
        $sheetDoc = PayrollPeriodReportDocument::query()->findOrFail($sheetDocId);
        $this->assertLessThan(500000, (int) $sheetDoc->file_size);

        $this->postJson("/api/v1/payroll/periods/{$this->period->id}/report/documents/attach-system", [
            'document_type' => 'payslips_summary_pdf',
            'is_sent' => true,
            'is_paid' => false,
            'lang' => 'bilingual',
        ])->assertCreated();

        $this->postJson("/api/v1/payroll/periods/{$this->period->id}/report/documents/attach-system", [
            'document_type' => 'attendance_report',
            'is_sent' => true,
            'is_paid' => false,
            'lang' => 'pt',
        ])->assertCreated();

        // Update proof document payment flag via PATCH -> updates parent report inss_paid
        $this->patchJson("/api/v1/payroll/periods/{$this->period->id}/report/documents/{$proofDocId}", [
            'is_paid' => true,
            'is_sent' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.inss_paid', true)
            ->assertJsonPath('data.inss_payment_proof_sent', true)
            ->assertJsonPath('data.mandatory_status.all_mandatory_attached', true)
            ->assertJsonPath('data.documents_count', 6);

        // Mark summary complete
        $this->putJson("/api/v1/payroll/periods/{$this->period->id}/report", [
            'inss_guide_sent' => true,
            'inss_payment_proof_sent' => true,
            'inss_paid' => true,
            'payslips_summary_sent' => true,
            'payroll_sheet_sent' => true,
            'is_summary_complete' => true,
        ])
            ->assertOk()
            ->assertJsonPath('data.is_summary_complete', true)
            ->assertJsonPath('data.mandatory_status.all_mandatory_sent', true);

        // Download document works (attachment & inline preview)
        $download = $this->get("/api/v1/payroll/periods/{$this->period->id}/report/documents/{$proofDocId}/download");
        $download->assertOk();

        $inline = $this->get("/api/v1/payroll/periods/{$this->period->id}/report/documents/{$sheetDocId}/download?inline=1");
        $inline->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('inline;', (string) $inline->headers->get('Content-Disposition'));
        $this->assertStringStartsWith('%PDF-', $inline->getContent());

        // Period index exposes report summary badge fields
        $this->getJson('/api/v1/payroll/periods')
            ->assertOk()
            ->assertJsonPath('data.data.0.is_reportable', true)
            ->assertJsonPath('data.data.0.report.documents_count', 6)
            ->assertJsonPath('data.data.0.report.inss_paid', true)
            ->assertJsonPath('data.data.0.report.is_summary_complete', true);

        // Deleting the proof document resets has_inss_payment_proof and inss_paid
        $this->deleteJson("/api/v1/payroll/periods/{$this->period->id}/report/documents/{$proofDocId}")
            ->assertOk()
            ->assertJsonPath('data.has_inss_payment_proof', false)
            ->assertJsonPath('data.inss_paid', false);

        $this->assertDatabaseHas('payroll_period_reports', [
            'payroll_period_id' => $this->period->id,
            'inss_paid' => false,
        ]);
        $this->assertSame(5, PayrollPeriodReportDocument::query()->count());
        $this->assertDatabaseHas('payroll_period_reports', ['id' => PayrollPeriodReport::first()->id]);
    }

    public function test_other_tenant_user_cannot_access_report_documents(): void
    {
        $report = PayrollPeriodReport::create([
            'tenant_id' => $this->tenant->id,
            'payroll_period_id' => $this->period->id,
            'inss_guide_sent' => true,
        ]);

        $otherTenant = Tenant::factory()->create(['name' => 'Outra Empresa Lda']);
        $otherUser = User::factory()->create(['tenant_id' => $otherTenant->id, 'is_active' => true]);
        $otherUser->assignRole('admin');

        app(TenantManager::class)->set($otherTenant);
        $this->actingAs($otherUser, 'sanctum');

        $this->getJson("/api/v1/payroll/periods/{$this->period->id}/report")
            ->assertNotFound();

        $this->assertDatabaseHas('payroll_period_reports', ['id' => $report->id]);
    }

    public function test_tenant_can_download_inss_and_irt_maps_separately_without_inss_proof(): void
    {
        // Even with no INSS payment proof uploaded, standalone INSS & IRT maps are available
        $inssBilingual = $this->get("/api/v1/payroll/periods/{$this->period->id}/inss-map.pdf?lang=bilingual");
        $inssBilingual->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $inssBilingual->getContent());
        $this->assertStringContainsString('DejaVuSans', $inssBilingual->getContent());
        $this->assertStringContainsString('DroidSansFallback', $inssBilingual->getContent());

        $periodPdfBilingual = $this->get("/api/v1/payroll/periods/{$this->period->id}/payslip.pdf?lang=bilingual");
        $periodPdfBilingual->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringContainsString('DejaVuSans', $periodPdfBilingual->getContent());
        $this->assertStringContainsString('DroidSansFallback', $periodPdfBilingual->getContent());

        $inssInlinePt = $this->get("/api/v1/payroll/periods/{$this->period->id}/inss-map.pdf?lang=pt&disposition=inline");
        $inssInlinePt->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('inline;', (string) $inssInlinePt->headers->get('Content-Disposition'));
        $this->assertStringStartsWith('%PDF-', $inssInlinePt->getContent());

        $irtBilingual = $this->get("/api/v1/payroll/periods/{$this->period->id}/irt-map.pdf?lang=bilingual");
        $irtBilingual->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $irtBilingual->getContent());

        // Empty (unprocessed) period returns validation error (422)
        $emptyPeriod = PayrollPeriod::create([
            'tenant_id' => $this->tenant->id,
            'name' => 'Julho/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-07-01',
            'period_end' => '2026-07-31',
            'status' => 'open',
        ]);
        $this->getJson("/api/v1/payroll/periods/{$emptyPeriod->id}/inss-map.pdf")->assertStatus(422);
        $this->getJson("/api/v1/payroll/periods/{$emptyPeriod->id}/irt-map.pdf")->assertStatus(422);

        // Another tenant cannot download maps for this tenant's period
        $otherTenant = Tenant::factory()->create(['name' => 'Empresa Terceira Lda']);
        $otherUser = User::factory()->create(['tenant_id' => $otherTenant->id, 'is_active' => true]);
        $otherUser->assignRole('admin');

        app(TenantManager::class)->set($otherTenant);
        $this->actingAs($otherUser, 'sanctum');

        $this->getJson("/api/v1/payroll/periods/{$this->period->id}/inss-map.pdf")->assertNotFound();
        $this->getJson("/api/v1/payroll/periods/{$this->period->id}/irt-map.pdf")->assertNotFound();
    }
}
