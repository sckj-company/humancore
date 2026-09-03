<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_user_without_view_report_cannot_access_reports(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/headcount')
            ->assertForbidden();

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/turnover')
            ->assertForbidden();
    }

    public function test_user_without_export_report_cannot_export_reports(): void
    {
        [$tenant, , $user] = $this->setupTenantWithUser('manager');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/headcount/export')
            ->assertForbidden();
    }

    public function test_headcount_report_returns_aggregations(): void
    {
        [$tenant, $department] = $this->setupTenantWithDepartment();
        Employee::factory()->count(2)->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'status' => 'active',
        ]);
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'terminated',
            'termination_at' => Carbon::today()->subDays(10),
        ]);
        $user = $this->makeUserWithRole($tenant, 'admin');

        $response = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/headcount')
            ->assertOk();

        $response
            ->assertJsonStructure([
                'data' => [
                    'range' => ['start', 'end'],
                    'summary' => ['total_employees', 'active_employees', 'hired_in_range', 'terminated_in_range'],
                    'by_department',
                    'by_status',
                    'trend',
                ],
            ])
            ->assertJsonPath('data.summary.total_employees', 3)
            ->assertJsonPath('data.summary.active_employees', 2)
            ->assertJsonPath('data.summary.terminated_in_range', 1);
    }

    public function test_turnover_report_computes_rate(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
            'hired_at' => Carbon::today()->subYear(),
        ]);
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'terminated',
            'hired_at' => Carbon::today()->subYear(),
            'termination_at' => Carbon::today()->subDays(30),
            'termination_reason' => 'Rescisão',
        ]);
        $user = $this->makeUserWithRole($tenant, 'admin');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/turnover')
            ->assertOk()
            ->assertJsonPath('data.summary.terminated', 1)
            ->assertJsonStructure([
                'data' => [
                    'range',
                    'summary' => ['hired', 'terminated', 'average_headcount', 'turnover_rate'],
                    'monthly',
                    'by_reason',
                ],
            ]);
    }

    public function test_payroll_summary_aggregates_records_by_period(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();
        $contract = EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 500000,
            'salary_frequency' => 'monthly',
            'is_active' => true,
        ]);
        $period = PayrollPeriod::create([
            'tenant_id' => $tenant->id,
            'name' => 'Test/2026',
            'period_type' => 'monthly',
            'period_start' => Carbon::today()->subMonths(2)->startOfMonth(),
            'period_end' => Carbon::today()->subMonths(2)->endOfMonth(),
            'status' => 'closed',
        ]);
        PayrollRecord::create([
            'tenant_id' => $tenant->id,
            'payroll_period_id' => $period->id,
            'employee_id' => $employee->id,
            'contract_id' => $contract->id,
            'base_salary' => 500000,
            'gross_salary' => 500000,
            'net_salary' => 450000,
            'total_taxes' => 50000,
            'total_deductions' => 0,
            'overtime_amount' => 0,
            'absent_days' => 0,
            'status' => 'approved',
        ]);
        $user = $this->makeUserWithRole($tenant, 'admin');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/payroll-summary')
            ->assertOk()
            ->assertJsonPath('data.totals.total_gross', 500000)
            ->assertJsonPath('data.totals.total_net', 450000)
            ->assertJsonStructure([
                'data' => [
                    'range',
                    'totals' => ['total_gross', 'total_net', 'total_taxes', 'total_deductions', 'total_overtime'],
                    'rows',
                    'by_department',
                ],
            ]);
    }

    public function test_attendance_summary_aggregates_records(): void
    {
        [$tenant, $employee] = $this->setupTenantWithEmployee();
        AttendanceRecord::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => Carbon::today()->subDays(2),
            'status' => 'present',
            'clock_in' => Carbon::today()->subDays(2)->setTime(8, 0),
            'clock_out' => Carbon::today()->subDays(2)->setTime(17, 0),
            'total_worked' => 540,
            'late_minutes' => 10,
        ]);
        $user = $this->makeUserWithRole($tenant, 'admin');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/attendance-summary')
            ->assertOk()
            ->assertJsonPath('data.summary.records', 1)
            ->assertJsonPath('data.summary.late_minutes', 10)
            ->assertJsonStructure([
                'data' => [
                    'range',
                    'summary' => ['records', 'total_hours', 'late_minutes', 'overtime_minutes', 'leaves_approved', 'leaves_pending'],
                    'by_status',
                    'by_department',
                ],
            ]);
    }

    public function test_export_headcount_returns_csv(): void
    {
        [$tenant, $department] = $this->setupTenantWithDepartment();
        Employee::factory()->create(['tenant_id' => $tenant->id, 'department_id' => $department->id]);
        $user = $this->makeUserWithRole($tenant, 'admin');

        $response = $this->actingAs($user, 'sanctum')
            ->get('/api/v1/reports/headcount/export')
            ->assertOk();

        $this->assertEquals('text/csv; charset=UTF-8', $response->headers->get('content-type'));
        $this->assertStringContainsString('relatorio-headcount-', (string) $response->headers->get('content-disposition'));

        $body = $response->streamedContent();
        $this->assertStringContainsString('department,total', $body);
        $this->assertStringContainsString($department->name, $body);
    }

    public function test_export_invalid_type_returns_400(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $user = $this->makeUserWithRole($tenant, 'admin');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/nope/export')
            ->assertStatus(400);
    }

    public function test_reports_respect_date_range_filter(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'terminated',
            'termination_at' => Carbon::parse('2026-01-15'),
        ]);
        $user = $this->makeUserWithRole($tenant, 'admin');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/turnover?start_date=2026-01-01&end_date=2026-01-31')
            ->assertOk()
            ->assertJsonPath('data.summary.terminated', 1);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/reports/turnover?start_date=2026-02-01&end_date=2026-02-28')
            ->assertOk()
            ->assertJsonPath('data.summary.terminated', 0);
    }

    private function setupTenantWithUser(string $role): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole($role);

        return [$tenant, null, $user];
    }

    private function setupTenantWithDepartment(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);
        $department = Department::create([
            'tenant_id' => $tenant->id,
            'name' => 'Report Test Department',
            'code' => 'RTD',
            'is_active' => true,
        ]);

        return [$tenant, $department];
    }

    private function setupTenantWithEmployee(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'active',
        ]);
        EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => 500000,
            'salary_frequency' => 'monthly',
            'is_active' => true,
        ]);

        return [$tenant, $employee];
    }

    private function makeUserWithRole(Tenant $tenant, string $role): User
    {
        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole($role);

        return $user;
    }
}
