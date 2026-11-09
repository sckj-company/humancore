<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\Tenant;
use App\Models\User;
use App\Services\CloudinaryService;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

class ContractTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(PermissionSeeder::class);
    }

    public function test_admin_can_renew_and_edit_contract_without_losing_history(): void
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'status' => 'inactive',
            'termination_at' => now()->toDateString(),
        ]);
        $oldContract = EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'is_active' => false,
            'end_date' => now()->subDay()->toDateString(),
        ]);
        $admin = User::factory()->create([
            'tenant_id' => $tenant->id,
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $admin->assignRole('admin');

        $this->mock(CloudinaryService::class)
            ->shouldReceive('upload')
            ->once()
            ->andReturn([
                'url' => 'https://res.cloudinary.com/test/raw/upload/contract.pdf',
                'bytes' => 1200,
            ]);
        $this->actingAs($admin, 'sanctum');
        $created = $this->post("/api/v1/employees/{$employee->id}/contracts", [
            'contract_type' => 'fixed_term',
            'base_salary' => 250000,
            'salary_frequency' => 'monthly',
            'work_hours_per_week' => 40,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'signed_at' => now()->toDateString(),
            'notes' => 'Contrato renovado',
            'document' => UploadedFile::fake()->create('contract.pdf', 2, 'application/pdf'),
        ], ['Accept' => 'application/json'])
            ->assertCreated()
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.contract_type', 'fixed_term');

        $this->assertDatabaseHas('employee_documents', [
            'employee_id' => $employee->id,
            'document_type' => 'contract',
            'file_path' => 'https://res.cloudinary.com/test/raw/upload/contract.pdf',
        ]);

        $newContractId = $created->json('data.id');
        $this->assertDatabaseHas('employee_contracts', [
            'id' => $oldContract->id,
            'is_active' => false,
        ]);
        $this->assertDatabaseHas('employees', [
            'id' => $employee->id,
            'status' => 'active',
            'termination_at' => null,
        ]);

        $this->putJson("/api/v1/contracts/{$newContractId}", [
            'contract_type' => 'fixed_term',
            'base_salary' => 275000,
            'salary_frequency' => 'monthly',
            'work_hours_per_week' => 36,
            'start_date' => now()->toDateString(),
            'end_date' => now()->addYear()->toDateString(),
            'signed_at' => now()->toDateString(),
            'notes' => 'Dados atualizados',
        ])
            ->assertOk()
            ->assertJsonPath('data.base_salary', 275000)
            ->assertJsonPath('data.notes', 'Dados atualizados');

        $this->assertSame(2, EmployeeContract::where('employee_id', $employee->id)->count());
    }
}
