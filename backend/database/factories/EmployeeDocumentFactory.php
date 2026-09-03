<?php

namespace Database\Factories;

use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<EmployeeDocument>
 */
class EmployeeDocumentFactory extends Factory
{
    protected $model = EmployeeDocument::class;

    public function definition(): array
    {
        return [
            'employee_id' => Employee::factory(),
            'tenant_id' => Tenant::factory(),
            'name' => fake()->sentence(3),
            'document_type' => 'other',
            'file_path' => 'documents/'.fake()->uuid().'.pdf',
            'original_name' => fake()->word().'.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => fake()->numberBetween(1024, 2_000_000),
            'expiry_date' => null,
            'notes' => null,
            'is_confidential' => false,
        ];
    }

    public function forEmployee(Employee $employee): static
    {
        return $this->state(fn () => [
            'employee_id' => $employee->id,
            'tenant_id' => $employee->tenant_id,
        ]);
    }
}
