<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSalaryComponent;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

class EmployeeImportTest extends TestCase
{
    public function test_hr_manager_can_download_template_preview_and_process_standard_excel(): void
    {
        $tenant = Tenant::factory()->create(['name' => 'Empresa Alfa Lda']);
        app(TenantManager::class)->set($tenant);

        $hr = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);
        $hr->assignRole('hr-manager');

        // 1. Download template
        $templateRes = $this->actingAs($hr, 'sanctum')
            ->get('/api/v1/imports/employees/template')
            ->assertOk();

        $binary = $templateRes->streamedContent();
        $tmpPath = sys_get_temp_dir().'/humancore_tpl_'.uniqid().'.xlsx';
        file_put_contents($tmpPath, $binary);

        try {
            $spreadsheet = IOFactory::load($tmpPath);
            $sheet = $spreadsheet->getActiveSheet();
            $this->assertSame('Empresa Alfa Lda', $sheet->getCell('R2')->getValue());

            // Add a second row using Portuguese numbers, DD/MM/YYYY date, and empty company column R
            $sheet->setCellValue('A3', 'EMP-002');
            $sheet->setCellValue('B3', 'Maria João Baptista');
            $sheet->setCellValue('C3', 'Angolana');
            $sheet->setCellValue('D3', 'Passaporte');
            $sheet->setCellValue('E3', 'N00112233');
            $sheet->setCellValue('F3', '31/12/2031');
            $sheet->setCellValue('G3', '001122334LA041');
            $sheet->setCellValue('H3', '923 111 222');
            $sheet->setCellValue('K3', 'Finanças');
            $sheet->setCellValue('L3', 'Contabilista');
            $sheet->setCellValue('M3', '01/02/2026');
            $sheet->setCellValue('N3', 'indeterminado');
            $sheet->setCellValue('O3', '250.000,00');
            $sheet->setCellValue('P3', '40.000,00');
            $sheet->setCellValue('Q3', '20.000,00');
            $sheet->setCellValue('R3', '');

            $writer = new Xlsx($spreadsheet);
            $writer->save($tmpPath);

            // 2. Preview
            $upload = new UploadedFile(
                $tmpPath,
                'funcionarios.xlsx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                null,
                true
            );

            $this->actingAs($hr, 'sanctum')
                ->postJson('/api/v1/imports/employees/preview', ['file' => $upload])
                ->assertOk()
                ->assertJsonPath('data.total_records', 2)
                ->assertJsonPath('data.dry_run', true)
                ->assertJsonPath('data.salaries.total_base_payroll', 400000);

            // 3. Process
            $uploadProcess = new UploadedFile(
                $tmpPath,
                'funcionarios.xlsx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                null,
                true
            );

            $this->actingAs($hr, 'sanctum')
                ->postJson('/api/v1/imports/employees/process', [
                    'file' => $uploadProcess,
                    'upload_cloudinary' => false,
                ])
                ->assertOk()
                ->assertJsonPath('data.dry_run', false)
                ->assertJsonPath('data.imported.employees_created', 2)
                ->assertJsonPath('data.imported.contracts_created', 2)
                ->assertJsonPath('data.imported.salary_components_created', 4)
                ->assertJsonPath('data.imported.tenants_created_or_matched', 1);

            $maria = Employee::withoutGlobalScopes()
                ->where('tenant_id', $tenant->id)
                ->where('employee_code', 'EMP-002')
                ->first();

            $this->assertNotNull($maria);
            $this->assertSame('Maria', $maria->first_name);
            $this->assertSame('João Baptista', $maria->last_name);
            $this->assertSame('passport', $maria->id_document_type);
            $this->assertSame('2031-12-31', $maria->id_document_expiry?->format('Y-m-d'));
            $this->assertSame('2026-02-01', $maria->hired_at?->format('Y-m-d'));

            $contract = EmployeeContract::withoutGlobalScopes()
                ->where('employee_id', $maria->id)
                ->first();
            $this->assertNotNull($contract);
            $this->assertSame('permanent', $contract->contract_type);
            $this->assertSame(250000.0, (float) $contract->base_salary);

            $components = EmployeeSalaryComponent::withoutGlobalScopes()
                ->where('employee_id', $maria->id)
                ->count();
            $this->assertSame(2, $components);

            // 4. Re-importing same file updates existing records cleanly
            $uploadReimport = new UploadedFile(
                $tmpPath,
                'funcionarios.xlsx',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                null,
                true
            );

            $this->actingAs($hr, 'sanctum')
                ->postJson('/api/v1/imports/employees/process', [
                    'file' => $uploadReimport,
                    'upload_cloudinary' => false,
                ])
                ->assertOk()
                ->assertJsonPath('data.imported.employees_created', 0)
                ->assertJsonPath('data.imported.employees_updated', 2);
        } finally {
            @unlink($tmpPath);
        }
    }

    public function test_unauthorized_employee_cannot_import_and_tenant_admin_cannot_create_other_tenants(): void
    {
        $tenant = Tenant::factory()->create(['name' => 'Empresa Única']);
        app(TenantManager::class)->set($tenant);

        $regularEmployee = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);
        $regularEmployee->assignRole('employee');

        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'is_active' => true,
        ]);
        $admin->assignRole('admin');

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setCellValue('A1', 'Código Funcionário');
        $sheet->setCellValue('B1', 'Nome Completo');
        $sheet->setCellValue('O1', 'Salário Base (Kz)');
        $sheet->setCellValue('R1', 'Empresa');
        $sheet->setCellValue('A2', 'EMP-900');
        $sheet->setCellValue('B2', 'Carlos Neto');
        $sheet->setCellValue('O2', '100000');
        $sheet->setCellValue('R2', 'Outra Empresa Qualquer');

        $tmpPath = sys_get_temp_dir().'/humancore_iso_'.uniqid().'.xlsx';
        (new Xlsx($spreadsheet))->save($tmpPath);

        try {
            $uploadForbidden = new UploadedFile($tmpPath, 'f.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
            $this->actingAs($regularEmployee, 'sanctum')
                ->postJson('/api/v1/imports/employees/preview', ['file' => $uploadForbidden])
                ->assertForbidden();

            $uploadAdmin = new UploadedFile($tmpPath, 'f.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/v1/imports/employees/process', [
                    'file' => $uploadAdmin,
                    'upload_cloudinary' => false,
                ])
                ->assertOk()
                ->assertJsonPath('data.imported.employees_created', 1);

            $this->assertSame(1, Tenant::withoutGlobalScopes()->count());
            $this->assertDatabaseHas('employees', [
                'tenant_id' => $tenant->id,
                'employee_code' => 'EMP-900',
            ]);
        } finally {
            @unlink($tmpPath);
        }
    }

    public function test_legacy_jiandaoyun_layout_remains_supported(): void
    {
        $tenant = Tenant::factory()->create(['name' => 'Empresa Legada']);
        app(TenantManager::class)->set($tenant);

        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setCellValue('A1', 'ID');
        $sheet->setCellValue('AC1', 'Código');
        $sheet->setCellValue('AD1', 'Nome');
        $sheet->setCellValue('A2', 'Sub-ID');
        $sheet->setCellValue('A3', '1001');
        $sheet->setCellValue('F3', 'Empresa Legada');
        $sheet->setCellValue('AC3', 'LEG-001');
        $sheet->setCellValue('AD3', 'Pedro Sebastião');
        $sheet->setCellValue('AJ3', 'Operações');
        $sheet->setCellValue('AK3', 'Operador');
        $sheet->setCellValue('BU3', '120000');

        $tmpPath = sys_get_temp_dir().'/humancore_legacy_'.uniqid().'.xlsx';
        (new Xlsx($spreadsheet))->save($tmpPath);

        try {
            $upload = new UploadedFile($tmpPath, 'legacy.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);

            $this->actingAs($superAdmin, 'sanctum')
                ->postJson('/api/v1/imports/employees/process', [
                    'file' => $upload,
                    'upload_cloudinary' => false,
                ])
                ->assertOk()
                ->assertJsonPath('data.imported.employees_created', 1);

            $this->assertDatabaseHas('employees', [
                'tenant_id' => $tenant->id,
                'employee_code' => 'LEG-001',
                'first_name' => 'Pedro',
                'last_name' => 'Sebastião',
            ]);
        } finally {
            @unlink($tmpPath);
        }
    }
}
