<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollPeriod;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payroll\PayrollPeriodReportService;
use App\Services\Tenant\TenantManager;
use App\Support\PdfDocument;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Tests\TestCase;
use ZipArchive;

class CompanyPayrollDossierAndSummaryTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private Tenant $tenantA;

    private Tenant $tenantB;

    private PayrollPeriod $periodAJune;

    private PayrollPeriod $periodAJuly;

    private PayrollPeriod $periodBJune;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);

        $this->superAdmin = User::factory()->create([
            'name' => 'Super Gestor',
            'is_active' => true,
        ]);
        $this->superAdmin->assignRole('super-admin');

        $this->tenantA = Tenant::factory()->create([
            'name' => 'Alfa Comércio Lda',
            'slug' => 'alfa-comercio',
            'tax_id' => '5000100100',
            'inss_number' => 'INSS-1001',
        ]);
        $this->tenantB = Tenant::factory()->create([
            'name' => 'Beta Engenharia SA',
            'slug' => 'beta-engenharia',
            'tax_id' => '5000200200',
            'inss_number' => 'INSS-2002',
        ]);

        // Process & approve Tenant A periods (June + July 2026) and attendance
        $this->periodAJune = $this->createApprovedPeriodForTenant($this->tenantA, 'Junho/2026', '2026-06-01', '2026-06-30', 300000);
        $this->periodAJuly = $this->createApprovedPeriodForTenant($this->tenantA, 'Julho/2026', '2026-07-01', '2026-07-31', 300000);
        $this->periodBJune = $this->createApprovedPeriodForTenant($this->tenantB, 'Junho/2026', '2026-06-01', '2026-06-30', 180000);

        app(TenantManager::class)->clear();
    }

    public function test_company_dossier_blocks_without_inss_proof_and_merges_complete_pdf_with_real_pdf_or_image_proof(): void
    {
        $this->actingAs($this->superAdmin, 'sanctum');

        // Without INSS payment proof -> inspection & dossier PDF must block cleanly (422)
        $this->getJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/inspect?year=2026&month=6")
            ->assertOk()
            ->assertJsonPath('data.has_inss_payment_proof', false)
            ->assertJsonPath('data.can_print', false);

        $this->postJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/dossier.pdf", [
            'year' => 2026,
            'month' => 6,
            'sections' => ['payroll_sheet', 'payslips', 'inss_map', 'irt_map', 'inss_payment_proof', 'attendance'],
        ])->assertStatus(422);

        // Attach a REAL DomPDF-generated PDF as INSS payment proof on periodAJune
        $realProofBinary = PdfDocument::make('pdf.inss-map', [
            'tenant' => $this->tenantA,
            'period' => $this->periodAJune,
            'rows' => [],
            'totals' => [
                'total_inss_base' => 0,
                'total_inss_employee' => 0,
                'total_inss_employer' => 0,
                'total_inss' => 0,
            ],
            'inssPaid' => true,
            'inssProofSent' => true,
            'operatorName' => 'Operador',
        ], 'a4', 'portrait', 'pt')->output();

        $tmpProof = tempnam(sys_get_temp_dir(), 'inss_real_proof_').'.pdf';
        file_put_contents($tmpProof, $realProofBinary);
        $uploadedPdf = new UploadedFile($tmpProof, 'comprovativo-real-inss.pdf', 'application/pdf', null, true);

        $req = Request::create('/', 'POST', [], [], ['file' => $uploadedPdf]);
        app(PayrollPeriodReportService::class)->addDocument(
            period: $this->periodAJune,
            validated: [
                'document_type' => 'inss_payment_proof',
                'title' => 'Comprovativo Oficial Banco INSS',
                'is_paid' => true,
                'is_sent' => true,
                'notes' => 'Liquidado via Banco BAI',
            ],
            request: $req,
            actor: $this->superAdmin,
        );
        @unlink($tmpProof);

        // Now inspection passes with INSS PAGO
        $this->getJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/inspect?year=2026&month=6")
            ->assertOk()
            ->assertJsonPath('data.can_print', true)
            ->assertJsonPath('data.inss_paid', true);

        // Generate full 6-section merged dossier PDF
        $dossierRes = $this->postJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/dossier.pdf", [
            'year' => 2026,
            'month' => 6,
            'sections' => ['payroll_sheet', 'payslips', 'inss_map', 'irt_map', 'inss_payment_proof', 'attendance'],
            'lang' => 'bilingual',
            'disposition' => 'attachment',
        ]);

        $dossierRes->assertOk()
            ->assertHeader('Content-Type', 'application/pdf')
            ->assertHeader('X-INSS-Paid', '1');
        $this->assertStringStartsWith('%PDF-', $dossierRes->getContent());
        $this->assertGreaterThan(5000, strlen($dossierRes->getContent()));

        // Also test PNG image proof on July period
        $pngProof = UploadedFile::fake()->image('talao-julho.png', 400, 250);
        $reqImg = Request::create('/', 'POST', [], [], ['file' => $pngProof]);
        app(PayrollPeriodReportService::class)->addDocument(
            period: $this->periodAJuly,
            validated: [
                'document_type' => 'inss_payment_proof',
                'title' => 'Comprovativo Imagem Julho',
                'is_paid' => false,
                'is_sent' => true,
            ],
            request: $reqImg,
            actor: $this->superAdmin,
        );

        $julyPdf = $this->postJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/dossier.pdf", [
            'year' => 2026,
            'month' => 7,
            'sections' => ['inss_map', 'inss_payment_proof'],
            'lang' => 'pt',
        ]);
        $julyPdf->assertOk()->assertHeader('X-INSS-Paid', '0');
        $this->assertStringStartsWith('%PDF-', $julyPdf->getContent());
    }

    public function test_bulk_singular_zip_exports_eligible_companies_and_general_summary_supports_all_periodicities(): void
    {
        $this->actingAs($this->superAdmin, 'sanctum');

        // Give Tenant A complete report + proof in June 2026; leave Tenant B without INSS proof
        $proofImg = UploadedFile::fake()->image('proof-alfa.png', 300, 200);
        $req = Request::create('/', 'POST', [], [], ['file' => $proofImg]);
        $reportService = app(PayrollPeriodReportService::class);
        $reportService->addDocument(
            period: $this->periodAJune,
            validated: [
                'document_type' => 'inss_payment_proof',
                'title' => 'Comprovativo INSS Alfa',
                'is_paid' => true,
                'is_sent' => true,
            ],
            request: $req,
            actor: $this->superAdmin,
        );
        $reportService->upsertReport($this->periodAJune, [
            'inss_guide_sent' => true,
            'inss_payment_proof_sent' => true,
            'inss_paid' => true,
            'payslips_summary_sent' => true,
            'payroll_sheet_sent' => true,
            'is_summary_complete' => true,
        ], $this->superAdmin);

        // Bulk singular ZIP for June 2026 -> includes Alfa PDF + 00-indice-resumo-geral PDF, skips Beta (no proof)
        $zipRes = $this->postJson('/api/v1/superadmin/payroll-reports/bulk-singular.zip', [
            'year' => 2026,
            'month' => 6,
            'sections' => ['payroll_sheet', 'inss_map', 'irt_map', 'inss_payment_proof'],
            'lang' => 'bilingual',
        ]);

        $zipRes->assertOk()
            ->assertHeader('X-Included-Count', '1')
            ->assertHeader('X-Skipped-Count', '1');

        $zipFile = $zipRes->baseResponse->getFile()->getPathname();
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($zipFile) === true);
        $names = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $names[] = $zip->getNameIndex($i);
        }
        $zip->close();

        $this->assertContains('resumo-completo-alfa-comercio-2026-06.pdf', $names);
        $this->assertContains('00-indice-resumo-geral-2026-06.pdf', $names);

        // Overview + General Summary PDF across Monthly, Quarterly, Semiannual, Annual + Scope filtering
        foreach ([
            ['periodicity' => 'monthly', 'year' => 2026, 'month' => 6],
            ['periodicity' => 'quarterly', 'year' => 2026, 'quarter' => 3],
            ['periodicity' => 'semiannual', 'year' => 2026, 'semester' => 2],
            ['periodicity' => 'annual', 'year' => 2026],
        ] as $query) {
            $overview = $this->getJson('/api/v1/superadmin/payroll-reports/overview?'.http_build_query($query));
            $overview->assertOk()->assertJsonPath('data.range.periodicity', $query['periodicity']);

            $pdf = $this->postJson('/api/v1/superadmin/payroll-reports/general-summary.pdf', array_merge($query, [
                'tenant_ids' => [$this->tenantA->id],
                'lang' => 'bilingual',
            ]));
            $pdf->assertOk()->assertHeader('Content-Type', 'application/pdf');
            $this->assertStringStartsWith('%PDF-', $pdf->getContent());
        }

        // Single-tenant periodicity summary endpoints (Item 5 on /reports page)
        app(TenantManager::class)->set($this->tenantA);
        $tenantAdmin = User::factory()->create(['tenant_id' => $this->tenantA->id, 'is_active' => true]);
        $tenantAdmin->assignRole('admin');
        $this->actingAs($tenantAdmin, 'sanctum');

        $this->getJson('/api/v1/reports/payroll-period-summary?periodicity=annual&year=2026')
            ->assertOk()
            ->assertJsonPath('data.companies.0.periods_count', 2)
            ->assertJsonPath('data.companies.0.compliance.inss_paid', false);

        $tenantPdf = $this->postJson('/api/v1/reports/payroll-period-summary.pdf', [
            'periodicity' => 'annual',
            'year' => 2026,
            'lang' => 'pt',
        ]);
        $tenantPdf->assertOk()->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_limited_super_admin_only_sees_assigned_companies_in_reports(): void
    {
        $limitedRole = Role::firstOrCreate(['name' => 'super-admin-limited', 'guard_name' => 'web']);
        $limitedUser = User::factory()->create(['is_active' => true]);
        $limitedUser->assignRole($limitedRole);
        $limitedUser->givePermissionTo('view_any_tenant');
        $limitedUser->tenantAccesses()->create([
            'tenant_id' => $this->tenantA->id,
            'role_name' => 'admin',
            'permissions' => ['view_any_payroll'],
            'department_ids' => [],
            'is_active' => true,
        ]);

        $this->actingAs($limitedUser, 'sanctum');

        $this->getJson('/api/v1/superadmin/payroll-reports/overview?periodicity=monthly&year=2026&month=6')
            ->assertOk()
            ->assertJsonCount(1, 'data.companies')
            ->assertJsonPath('data.companies.0.tenant_id', $this->tenantA->id);

        $this->getJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantB->id}/inspect?year=2026&month=6")
            ->assertForbidden();
    }

    public function test_superadmin_can_download_company_inss_and_irt_maps_separately_without_inss_proof(): void
    {
        $this->actingAs($this->superAdmin, 'sanctum');

        // Confirm complete dossier still blocks when Tenant A has no INSS proof
        $this->postJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/dossier.pdf", [
            'year' => 2026,
            'month' => 6,
            'sections' => ['inss_map', 'irt_map'],
        ])->assertStatus(422);

        // Standalone INSS and IRT maps succeed even without INSS proof
        $inssRes = $this->get("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/inss-map.pdf?year=2026&month=6&lang=bilingual");
        $inssRes->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $inssRes->getContent());

        $irtRes = $this->get("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/irt-map.pdf?year=2026&month=6&lang=pt");
        $irtRes->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF-', $irtRes->getContent());

        // Limited super-admin restricted to Tenant A cannot access Tenant B's maps
        $limitedRole = Role::firstOrCreate(['name' => 'super-admin-limited', 'guard_name' => 'web']);
        $limitedUser = User::factory()->create(['is_active' => true]);
        $limitedUser->assignRole($limitedRole);
        $limitedUser->givePermissionTo('view_any_tenant');
        $limitedUser->tenantAccesses()->create([
            'tenant_id' => $this->tenantA->id,
            'role_name' => 'admin',
            'permissions' => ['view_any_payroll'],
            'department_ids' => [],
            'is_active' => true,
        ]);

        $this->actingAs($limitedUser, 'sanctum');

        $this->get("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantA->id}/inss-map.pdf?year=2026&month=6")
            ->assertOk();
        $this->getJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantB->id}/inss-map.pdf?year=2026&month=6")
            ->assertForbidden();
        $this->getJson("/api/v1/superadmin/payroll-reports/tenants/{$this->tenantB->id}/irt-map.pdf?year=2026&month=6")
            ->assertForbidden();
    }

    private function createApprovedPeriodForTenant(
        Tenant $tenant,
        string $name,
        string $start,
        string $end,
        float $salary,
    ): PayrollPeriod {
        app(TenantManager::class)->set($tenant);

        $employee = Employee::query()->where('tenant_id', $tenant->id)->first();
        if (! $employee) {
            $employee = Employee::factory()->create([
                'tenant_id' => $tenant->id,
                'status' => 'active',
            ]);
            EmployeeContract::factory()->create([
                'tenant_id' => $tenant->id,
                'employee_id' => $employee->id,
                'base_salary' => $salary,
                'is_active' => true,
                'start_date' => '2026-01-01',
            ]);
            AttendanceRecord::create([
                'tenant_id' => $tenant->id,
                'employee_id' => $employee->id,
                'date' => $start,
                'status' => 'present',
                'total_worked' => 480,
                'late_minutes' => 0,
                'overtime_minutes' => 0,
            ]);
        }

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => $name,
            'period_type' => 'monthly',
            'period_start' => $start,
            'period_end' => $end,
            'status' => 'open',
        ]);

        $this->actingAs($this->superAdmin, 'sanctum');
        $headers = ['X-Tenant-ID' => (string) $tenant->id];
        $this->postJson("/api/v1/payroll/periods/{$period->id}/process", [], $headers)->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$period->id}/approve", [], $headers)->assertOk();

        return $period->fresh();
    }
}
