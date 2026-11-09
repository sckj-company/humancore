<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Tenant;
use App\Models\User;
use App\Services\CloudinaryService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class LeaveTest extends TestCase
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

        $vacation = LeaveType::create([
            'tenant_id' => $tenant->id,
            'name' => 'Férias Anuais',
            'code' => 'vacation',
            'category' => 'vacation',
            'days_per_year' => 22,
            'is_paid' => true,
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

        return [$tenant, $employee, $user, $vacation];
    }

    public function test_employee_can_request_leave_and_see_balance(): void
    {
        [$tenant, $employee, $user, $vacation] = $this->setupEmployeeUser('employee');

        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/leave/balance')
            ->assertOk()
            ->assertJsonPath('data.annual_entitlement', 22)
            ->assertJsonPath('data.days_remaining', 22);

        $this->postJson('/api/v1/leave', [
            'leave_type_id' => $vacation->id,
            'occurrence_type' => 'medical',
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-19',
            'reason' => 'Férias',
        ])->assertCreated()
            ->assertJsonPath('data.total_days', 5)
            ->assertJsonPath('data.occurrence_type', 'medical');
    }

    public function test_admin_can_approve_request_and_balance_updates(): void
    {
        [$tenant, $employee, $admin, $vacation] = $this->setupEmployeeUser('admin');

        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-19',
            'total_days' => 5,
            'status' => 'pending',
        ]);

        $this->actingAs($admin, 'sanctum');
        $this->postJson("/api/v1/leave/{$leave->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->assertSame('approved', $leave->fresh()->status);
    }

    public function test_admin_can_edit_leave_details_without_changing_approval_status(): void
    {
        [$tenant, $employee, $admin, $vacation] = $this->setupEmployeeUser('admin');
        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-16',
            'total_days' => 2,
            'status' => 'approved',
        ]);

        $this->actingAs($admin, 'sanctum');
        $this->putJson("/api/v1/leaves/{$leave->id}", [
            'leave_type_id' => $vacation->id,
            'occurrence_type' => 'medical',
            'notice_type' => 'unanticipated',
            'is_justified' => true,
            'deduct_from_salary' => false,
            'start_date' => '2026-09-14',
            'end_date' => '2026-09-18',
            'reason' => 'Consulta médica',
        ])->assertOk()
            ->assertJsonPath('data.total_days', 5)
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.occurrence_type', 'medical');

        $this->assertSame('2026-09-14', $leave->fresh()->start_date->format('Y-m-d'));
        $this->assertSame('approved', $leave->fresh()->status);
    }

    public function test_employee_without_update_permission_cannot_edit_leave(): void
    {
        [$tenant, $employee, $user, $vacation] = $this->setupEmployeeUser('employee');
        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-16',
            'total_days' => 2,
            'status' => 'pending',
        ]);

        $this->actingAs($user, 'sanctum');
        $this->putJson("/api/v1/leaves/{$leave->id}", [
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-14',
            'end_date' => '2026-09-18',
        ])->assertForbidden();
    }

    public function test_employee_cannot_approve_but_can_cancel_own_pending(): void
    {
        [$tenant, $employee, $user, $vacation] = $this->setupEmployeeUser('employee');

        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-19',
            'total_days' => 5,
            'status' => 'pending',
        ]);

        $this->actingAs($user, 'sanctum');

        $this->postJson("/api/v1/leave/{$leave->id}/approve")->assertForbidden();

        $this->postJson("/api/v1/leave/{$leave->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_tenant_isolation_hides_other_tenant_requests(): void
    {
        [$tenant, $employee, $user] = $this->setupEmployeeUser('employee');
        [$tenantB, , , $vacationB] = $this->setupEmployeeUser('hr-manager');

        // request in tenant B
        LeaveRequest::create([
            'tenant_id' => $tenantB->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacationB->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-16',
            'total_days' => 2,
            'status' => 'pending',
        ]);

        app(TenantManager::class)->set($tenant);

        $this->actingAs($user, 'sanctum');
        $this->getJson('/api/v1/leave/my-requests')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }

    public function test_admin_can_create_a_leave_type_for_the_active_tenant(): void
    {
        [$tenant, , $admin] = $this->setupEmployeeUser('admin');
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/leave/types', [
            'name' => 'Consulta médica',
            'code' => 'medical_visit',
            'category' => 'sick',
            'days_per_year' => 3,
            'is_paid' => true,
            'requires_document' => true,
        ])->assertCreated()
            ->assertJsonPath('data.name', 'Consulta médica')
            ->assertJsonPath('data.requires_document', true);

        $this->assertDatabaseHas('leave_types', [
            'tenant_id' => $tenant->id,
            'code' => 'medical_visit',
            'category' => 'sick',
            'requires_document' => true,
        ]);
    }

    public function test_admin_can_upload_a_justification_document_to_a_leave_request(): void
    {
        Storage::fake('local');
        [$tenant, $employee, $admin, $vacation] = $this->setupEmployeeUser('admin');
        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-16',
            'total_days' => 2,
            'status' => 'approved',
        ]);
        $this->mock(CloudinaryService::class)
            ->shouldReceive('upload')
            ->once()
            ->andReturn(['url' => 'https://res.cloudinary.com/test/image/upload/medical.pdf', 'bytes' => 100]);
        $this->actingAs($admin, 'sanctum');

        $this->postJson("/api/v1/leave/{$leave->id}/documents/justification", [
            'document' => UploadedFile::fake()->create('medical.pdf', 100, 'application/pdf'),
        ])->assertOk()->assertJsonPath('data.has_justification_document', true);

        $this->assertSame('https://res.cloudinary.com/test/image/upload/medical.pdf', $leave->fresh()->justification_document_path);
        Storage::disk('local')->assertDirectoryEmpty('leave-documents/'.$tenant->id);
    }

    public function test_leave_document_upload_rejects_unsupported_file_types(): void
    {
        Storage::fake('local');
        [$tenant, $employee, $admin, $vacation] = $this->setupEmployeeUser('admin');
        $leave = LeaveRequest::create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'leave_type_id' => $vacation->id,
            'start_date' => '2026-09-15',
            'end_date' => '2026-09-16',
            'total_days' => 2,
            'status' => 'approved',
        ]);
        $this->actingAs($admin, 'sanctum');

        $this->postJson("/api/v1/leave/{$leave->id}/documents/justification", [
            'document' => UploadedFile::fake()->create('notes.txt', 10, 'text/plain'),
        ])->assertUnprocessable()->assertJsonValidationErrors('document');

        $this->assertNull($leave->fresh()->justification_document_path);
        $this->assertSame([], Storage::disk('local')->allFiles('leave-documents/'.$tenant->id));
    }
}
