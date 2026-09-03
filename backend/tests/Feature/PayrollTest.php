<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\Setting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payroll\PayrollEngineService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PayrollTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    protected function setupTenantWithEmployee(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $employee = Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'active']);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 700000,
            'salary_frequency' => 'monthly',
            'is_active' => true,
        ]);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole('admin');

        return [$tenant, $employee, $user];
    }

    public function test_calculation_uses_db_settings_and_rules_are_accurate(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();

        // Ensure INSS employee rate is driven by DB settings
        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'payroll', 'key' => 'inss.employee_rate'],
            ['value' => 5.0],
        );

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Setembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-09-01',
            'period_end' => '2026-09-30',
            'status' => 'open',
        ]);

        $engine = app(PayrollEngineService::class);
        $record = $engine->calculateForEmployee($period, $employee);

        $inss = round(700000 * 0.05, 2);

        $this->assertSame(700000.0, (float) $record->gross_salary);
        $this->assertSame($inss, (float) $record->total_deductions);
        $this->assertGreaterThan(0, (float) $record->total_taxes, 'IRT should apply');
        $this->assertSame($record->gross_salary - $record->total_deductions - $record->total_taxes, (float) $record->net_salary);
        $this->assertSame('calculated', $record->status);
    }

    public function test_process_period_generates_records_for_active_employees(): void
    {
        [$tenant, $employee, $user] = $this->setupTenantWithEmployee();

        // inactive employee must be skipped
        Employee::factory()->create(['tenant_id' => $tenant->id, 'status' => 'inactive']);

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Outubro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-10-01',
            'period_end' => '2026-10-31',
            'status' => 'open',
        ]);

        $engine = app(PayrollEngineService::class);
        $count = $engine->processPeriod($period);

        $this->assertSame(1, $count);
        $this->assertSame('completed', $period->fresh()->status);
        $this->assertDatabaseHas('payroll_records', [
            'payroll_period_id' => $period->id,
            'employee_id' => $employee->id,
        ]);
    }

    public function test_admin_can_complete_payroll_workflow(): void
    {
        [$tenant, $employee, $user] = $this->setupTenantWithEmployee();

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->actingAs($user, 'sanctum');

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/approve")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSame('completed', $period->fresh()->status);
        $this->assertSame('approved', PayrollRecord::where('payroll_period_id', $period->id)->first()->status);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/close")
            ->assertOk()
            ->assertJsonPath('success', true);
        $this->assertSame('closed', $period->fresh()->status);
    }

    public function test_employee_can_view_own_payslip_but_not_others(): void
    {
        [$tenant, $employee, $admin] = $this->setupTenantWithEmployee();

        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Dezembro/2026',
            'period_type' => 'monthly',
            'period_start' => '2026-12-01',
            'period_end' => '2026-12-31',
            'status' => 'open',
        ]);

        app(PayrollEngineService::class)->processPeriod($period);
        $record = PayrollRecord::where('payroll_period_id', $period->id)->where('employee_id', $employee->id)->first();

        // Employee role user tied to the employee
        $employeeUser = User::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $employeeUser->assignRole('employee');

        // another tenant employee's record
        $otherTenant = Tenant::factory()->create();
        app(TenantManager::class)->set($otherTenant);
        $other = Employee::factory()->create(['tenant_id' => $otherTenant->id]);
        $otherContract = EmployeeContract::factory()->create(['tenant_id' => $otherTenant->id, 'employee_id' => $other->id]);
        $otherRecord = PayrollRecord::create([
            'tenant_id' => $otherTenant->id,
            'payroll_period_id' => $period->id,
            'employee_id' => $other->id,
            'contract_id' => $otherContract->id,
            'status' => 'calculated',
        ]);

        app(TenantManager::class)->set($tenant);

        $this->actingAs($employeeUser, 'sanctum');
        $this->getJson("/api/v1/payroll/records/{$record->id}/payslip")->assertOk();
        // Other tenant's record is hidden by the tenant scope (404) - not exposed
        $this->getJson("/api/v1/payroll/records/{$otherRecord->id}/payslip")->assertNotFound();
    }
}
