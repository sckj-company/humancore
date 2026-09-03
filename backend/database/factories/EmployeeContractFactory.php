<?php

namespace Database\Factories;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<EmployeeContract>
 */
class EmployeeContractFactory extends Factory
{
    protected $model = EmployeeContract::class;

    public function definition(): array
    {
        return [
            'employee_id' => Employee::factory(),
            'tenant_id' => Tenant::factory(),
            'contract_type' => fake()->randomElement(['permanent', 'fixed_term', 'probation']),
            'base_salary' => fake()->numberBetween(100000, 1000000),
            'salary_frequency' => 'monthly',
            'work_hours_per_week' => 40,
            'start_date' => fake()->dateTimeBetween('-2 years', '-1 month')->format('Y-m-d'),
            'is_active' => true,
            'signed_at' => fake()->dateTimeBetween('-2 years', '-1 month')->format('Y-m-d'),
        ];
    }

    public function active(): static
    {
        return $this->state(fn (array $attributes) => ['is_active' => true]);
    }

    public function permanent(): static
    {
        return $this->state(fn (array $attributes) => ['contract_type' => 'permanent']);
    }
}
