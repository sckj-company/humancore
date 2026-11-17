<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Deduction;
use App\Models\DeductionInstallment;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSchedule;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\Position;
use App\Models\Shift;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class OperationsEnhancementsFlowTest extends TestCase
{
    use RefreshDatabase;

    private function setupTenantAdmin(): array
    {
        $tenant = Tenant::factory()->create(['currency' => 'AOA']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $user->assignRole('admin');

        $departmentA = Department::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Engenharia']);
        $departmentB = Department::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Operações']);
        $positionA = Position::query()->create(['tenant_id' => $tenant->id, 'department_id' => $departmentA->id, 'title' => 'Engenheiro']);

        $employeeA = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $departmentA->id,
            'position_id' => $positionA->id,
            'first_name' => 'Carlos',
            'last_name' => 'Mendes',
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        $employeeB = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $departmentB->id,
            'first_name' => 'Ana',
            'last_name' => 'Silva',
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employeeA->id,
            'base_salary' => 300000,
            'contract_type' => 'permanent',
            'start_date' => '2026-01-01',
            'end_date' => null,
            'is_active' => true,
        ]);

        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employeeB->id,
            'base_salary' => 220000,
            'contract_type' => 'fixed_term',
            'start_date' => '2026-01-01',
            'end_date' => '2026-12-31',
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

        return [$tenant, $user, $employeeA, $employeeB, $departmentA, $departmentB];
    }

    public function test_deduction_receipt_pdf_is_single_portrait_page_and_signed_upload_works(): void
    {
        Storage::fake('local');
        [, $user, $employeeA] = $this->setupTenantAdmin();
        $this->actingAs($user);

        $create = $this->postJson('/api/v1/deductions', [
            'employee_id' => $employeeA->id,
            'name' => 'Vale de Emergência',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'total_amount' => 100000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 40],
                ['reference_month' => '2026-12', 'percentage' => 60],
            ],
        ])->assertCreated();

        $deductionId = $create->json('data.id');
        $this->assertNotNull($create->json('data.requested_at'));
        $this->assertFalse($create->json('data.has_signed_document'));

        $pdfResponse = $this->get("/api/v1/deductions/{$deductionId}/receipt.pdf")->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $pdfResponse->headers->get('content-type'));
        $pdfBinary = $pdfResponse->getContent();
        $this->assertStringStartsWith('%PDF-', $pdfBinary);
        // Single page enforcement check in generated PDF
        $this->assertSame(1, preg_match_all('/\/Type\s*\/Page\b/', $pdfBinary));

        $file = UploadedFile::fake()->create('vale-assinado.pdf', 120, 'application/pdf');
        $uploadResponse = $this->post("/api/v1/deductions/{$deductionId}/signed-document", [
            'document' => $file,
        ])->assertOk();

        $this->assertTrue($uploadResponse->json('data.has_signed_document'));
        $this->assertNotNull($uploadResponse->json('data.signed_document_uploaded_at'));

        $this->get("/api/v1/deductions/{$deductionId}/signed-document")->assertOk();

        $base64Pdf = base64_encode("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF");
        $this->postJson("/api/v1/deductions/{$deductionId}/signed-document", [
            'document_base64' => "data:application/pdf;base64,{$base64Pdf}",
            'document_name' => 'vale-assinado-b64.pdf',
            'document_mime' => 'application/pdf',
        ])->assertOk()->assertJsonPath('data.has_signed_document', true);

        // Simulate Cloudinary-stored URL download (streams 200 instead of cross-origin 302 redirect)
        Http::fake([
            'https://res.cloudinary.com/*' => Http::response('%PDF-1.4 remote', 200, ['Content-Type' => 'application/pdf']),
        ]);
        Deduction::query()->whereKey($deductionId)->update([
            'signed_document_path' => 'https://res.cloudinary.com/demo/image/upload/v1/signed-vale.pdf',
        ]);
        $remoteRes = $this->get("/api/v1/deductions/{$deductionId}/signed-document")->assertOk();
        $this->assertSame('%PDF-1.4 remote', $remoteRes->getContent());
    }

    public function test_percentage_installments_schedule_deducts_exact_month_and_updates_status_on_pay(): void
    {
        [$tenant, $user, $employeeA] = $this->setupTenantAdmin();
        $this->actingAs($user);

        $this->postJson('/api/v1/deductions', [
            'employee_id' => $employeeA->id,
            'name' => 'Soma Inválida',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'total_amount' => 100000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 40],
                ['reference_month' => '2026-12', 'percentage' => 40],
            ],
        ])->assertStatus(422);

        $create = $this->postJson('/api/v1/deductions', [
            'employee_id' => $employeeA->id,
            'name' => 'Adiantamento 30/70',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'total_amount' => 100000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 30],
                ['reference_month' => '2026-12', 'percentage' => 70],
            ],
        ])->assertCreated();

        $deductionId = $create->json('data.id');
        $this->assertCount(2, $create->json('data.installments'));
        $this->assertEquals(30000, $create->json('data.installments.0.amount'));
        $this->assertEquals(70000, $create->json('data.installments.1.amount'));

        $periodNov = PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$periodNov->id}/process", [
            'employee_ids' => [$employeeA->id],
        ])->assertOk();

        $novRecords = $this->getJson("/api/v1/payroll/periods/{$periodNov->id}/records")->assertOk()->json('data');
        $novDeductionItem = collect($novRecords[0]['items'])->firstWhere('deduction_id', $deductionId);
        $this->assertNotNull($novDeductionItem);
        $this->assertEquals(-30000.0, (float) $novDeductionItem['amount']);

        $this->postJson("/api/v1/payroll/periods/{$periodNov->id}/submit")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$periodNov->id}/approve")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$periodNov->id}/pay")->assertOk();

        $afterNov = Deduction::query()->with('installments')->findOrFail($deductionId);
        $this->assertSame('active', $afterNov->status);
        $this->assertEquals(30000.0, (float) $afterNov->paid_amount);
        $this->assertSame('paid', $afterNov->installments[0]->status);
        $this->assertSame('pending', $afterNov->installments[1]->status);

        $periodDec = PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Dezembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-12-01',
            'period_end' => '2026-12-31',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$periodDec->id}/process", [
            'employee_ids' => [$employeeA->id],
        ])->assertOk();

        $decRecords = $this->getJson("/api/v1/payroll/periods/{$periodDec->id}/records")->assertOk()->json('data');
        $decDeductionItem = collect($decRecords[0]['items'])->firstWhere('deduction_id', $deductionId);
        $this->assertNotNull($decDeductionItem);
        $this->assertEquals(-70000.0, (float) $decDeductionItem['amount']);

        $this->postJson("/api/v1/payroll/periods/{$periodDec->id}/submit")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$periodDec->id}/approve")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$periodDec->id}/pay")->assertOk();

        $afterDec = Deduction::query()->with('installments')->findOrFail($deductionId);
        $this->assertSame('completed', $afterDec->status);
        $this->assertEquals(100000.0, (float) $afterDec->paid_amount);
        $this->assertSame('paid', $afterDec->installments[1]->status);
        $this->assertSame(0, DeductionInstallment::query()->where('deduction_id', $deductionId)->where('status', 'pending')->count());
    }

    public function test_shift_assignment_by_date_range_and_replace_previous(): void
    {
        [$tenant, $user, $employeeA] = $this->setupTenantAdmin();
        $this->actingAs($user);

        $shiftMorning = Shift::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Manhã',
            'start_time' => '08:00',
            'end_time' => '16:00',
            'work_hours' => 8,
            'is_active' => true,
        ]);

        $shiftNight = Shift::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Noite',
            'start_time' => '20:00',
            'end_time' => '04:00',
            'work_hours' => 8,
            'is_night_shift' => true,
            'is_active' => true,
        ]);

        $first = $this->postJson('/api/v1/employee-schedules', [
            'employee_id' => $employeeA->id,
            'shift_id' => $shiftMorning->id,
            'effective_from' => '2026-01-01',
            'is_active' => true,
        ])->assertCreated();

        $second = $this->postJson('/api/v1/employee-schedules', [
            'employee_id' => $employeeA->id,
            'shift_id' => $shiftNight->id,
            'effective_from' => '2026-11-16',
            'effective_to' => '2026-11-22',
            'replace_previous' => true,
            'is_active' => true,
        ])->assertCreated();

        $firstSchedule = EmployeeSchedule::query()->findOrFail($first->json('data.id'));
        $secondSchedule = EmployeeSchedule::query()->findOrFail($second->json('data.id'));

        $this->assertSame('2026-11-15', $firstSchedule->effective_to?->toDateString());
        $this->assertSame('2026-11-16', $secondSchedule->effective_from?->toDateString());
        $this->assertSame('2026-11-22', $secondSchedule->effective_to?->toDateString());
    }

    public function test_attendance_report_daily_weekly_monthly_json_and_pdf(): void
    {
        [$tenant, $user, $employeeA, $employeeB] = $this->setupTenantAdmin();
        $this->actingAs($user);

        AttendanceRecord::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employeeA->id,
            'date' => '2026-11-17',
            'clock_in' => '2026-11-17 08:15:00',
            'clock_out' => '2026-11-17 17:00:00',
            'total_worked' => 480,
            'late_minutes' => 15,
            'overtime_minutes' => 60,
            'status' => 'late',
        ]);

        AttendanceRecord::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employeeB->id,
            'date' => '2026-11-17',
            'clock_in' => '2026-11-17 08:00:00',
            'clock_out' => '2026-11-17 16:00:00',
            'total_worked' => 480,
            'late_minutes' => 0,
            'overtime_minutes' => 0,
            'status' => 'present',
        ]);

        $dailyAll = $this->getJson('/api/v1/attendance/report?period_type=daily&date=2026-11-17')->assertOk();
        $this->assertSame(2, $dailyAll->json('data.totals.employees_count'));
        $this->assertSame(1, $dailyAll->json('data.totals.late_count'));
        $this->assertSame(1, $dailyAll->json('data.totals.present_count'));

        $weeklySingle = $this->getJson("/api/v1/attendance/report?period_type=weekly&date=2026-11-17&employee_id={$employeeA->id}")->assertOk();
        $this->assertSame(1, $weeklySingle->json('data.totals.employees_count'));
        $this->assertSame('Carlos Mendes', $weeklySingle->json('data.employees.0.full_name'));
        $this->assertSame('Engenheiro', $weeklySingle->json('data.employees.0.position'));

        $multiSelect = $this->getJson("/api/v1/attendance/report?period_type=monthly&month=2026-11&employee_ids={$employeeA->id},{$employeeB->id}")->assertOk();
        $this->assertSame(2, $multiSelect->json('data.totals.employees_count'));

        $pdfRes = $this->get("/api/v1/attendance/report.pdf?period_type=monthly&month=2026-11&employee_ids={$employeeA->id},{$employeeB->id}")->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $pdfRes->headers->get('content-type'));
        $this->assertStringStartsWith('%PDF-', $pdfRes->getContent());
    }

    public function test_payroll_periods_and_records_filters(): void
    {
        [$tenant, $user, $employeeA, $employeeB, $departmentA] = $this->setupTenantAdmin();
        $this->actingAs($user);

        $novPeriod = PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Folha Novembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'completed',
        ]);

        PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Quinzena Outubro 2025',
            'period_type' => 'biweekly',
            'period_start' => '2025-10-01',
            'period_end' => '2025-10-15',
            'status' => 'paid',
        ]);

        $filteredPeriods = $this->getJson('/api/v1/payroll/periods?search=Novembro&status=completed&period_type=monthly&year=2026&month=2026-11')
            ->assertOk()
            ->json('data.data');

        $this->assertCount(1, $filteredPeriods);
        $this->assertSame($novPeriod->id, $filteredPeriods[0]['id']);

        $this->postJson("/api/v1/payroll/periods/{$novPeriod->id}/process", [
            'employee_ids' => [$employeeA->id, $employeeB->id],
        ])->assertOk();

        $recordsByDept = $this->getJson("/api/v1/payroll/periods/{$novPeriod->id}/records?department_id={$departmentA->id}&contract_type=permanent&search=Carlos")
            ->assertOk()
            ->json('data');

        $this->assertCount(1, $recordsByDept);
        $this->assertSame($employeeA->id, $recordsByDept[0]['employee_id']);
        $this->assertSame('Engenharia', $recordsByDept[0]['employee']['department']);
    }

    public function test_deduction_installments_strictly_require_exact_sum_matching_total(): void
    {
        [, $user, $employeeA] = $this->setupTenantAdmin();
        $this->actingAs($user);

        // 99.96% (formerly passed with 0.05 tolerance) must now be rejected strictly
        $this->postJson('/api/v1/deductions', [
            'employee_id' => $employeeA->id,
            'name' => 'Multa com parcelas incompletas',
            'deduction_type' => 'fine',
            'amount_type' => 'fixed',
            'total_amount' => 100000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 49.98],
                ['reference_month' => '2026-12', 'percentage' => 49.98],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors(['installments']);

        // Mismatched explicit installment amount * count vs total_amount without schedule must also be rejected
        $this->postJson('/api/v1/deductions', [
            'employee_id' => $employeeA->id,
            'name' => 'Multa valor divergente',
            'deduction_type' => 'fine',
            'amount_type' => 'fixed',
            'amount' => 4000,
            'total_amount' => 10000,
            'installment_count' => 2,
        ])->assertStatus(422)->assertJsonValidationErrors(['total_amount']);

        // Explicit per-installment amounts not matching total_amount must also be rejected
        $this->postJson('/api/v1/deductions', [
            'employee_id' => $employeeA->id,
            'name' => 'Desconto com valores divergentes',
            'deduction_type' => 'other',
            'amount_type' => 'fixed',
            'total_amount' => 10000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 50, 'amount' => 4500],
                ['reference_month' => '2026-12', 'percentage' => 50, 'amount' => 5000],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors(['installments']);

        // Exact 3-way split (33.33 + 33.33 + 33.34 = 100.00%) succeeds and installment sum equals total
        $valid = $this->postJson('/api/v1/deductions', [
            'employee_id' => $employeeA->id,
            'name' => 'Multa 3 parcelas exatas',
            'deduction_type' => 'fine',
            'amount_type' => 'fixed',
            'total_amount' => 10000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 33.33],
                ['reference_month' => '2026-12', 'percentage' => 33.33],
                ['reference_month' => '2027-01', 'percentage' => 33.34],
            ],
        ])->assertCreated();

        $createdId = $valid->json('data.id');
        $sum = (float) collect($valid->json('data.installments'))->sum('amount');
        $this->assertEqualsWithDelta(10000.0, $sum, 0.001);

        // Updating with invalid percentage sum (99.99%) is also rejected
        $this->putJson("/api/v1/deductions/{$createdId}", [
            'total_amount' => 10000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 50],
                ['reference_month' => '2026-12', 'percentage' => 49.99],
            ],
        ])->assertStatus(422)->assertJsonValidationErrors(['installments']);
    }
}
