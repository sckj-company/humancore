<?php

namespace Database\Factories;

use App\Models\Employee;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Employee>
 */
class EmployeeFactory extends Factory
{
    protected $model = Employee::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'employee_code' => 'EMP-'.str_pad((string) fake()->unique()->randomNumber(5), 5, '0', STR_PAD_LEFT),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->phoneNumber(),
            'birth_date' => fake()->date('Y-m-d', '2000-01-01'),
            'gender' => fake()->randomElement(['male', 'female']),
            'marital_status' => fake()->randomElement(['single', 'married']),
            'nationality' => 'Angolana',
            'address' => fake()->streetAddress(),
            'city' => fake()->randomElement(['Luanda', 'Benguela', 'Huambo', 'Lubango']),
            'id_document_type' => 'BI',
            'id_document_number' => fake()->numerify('###########'),
            'tax_id' => fake()->numerify('###########'),
            'status' => 'active',
            'hired_at' => fake()->dateTimeBetween('-5 years', '-1 month')->format('Y-m-d'),
        ];
    }

    public function active(): static
    {
        return $this->state(fn (array $attributes) => ['status' => 'active']);
    }

    public function inactive(): static
    {
        return $this->state(fn (array $attributes) => ['status' => 'inactive']);
    }

    public function terminated(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => 'terminated',
            'termination_at' => now()->subDays(rand(30, 365))->format('Y-m-d'),
            'termination_reason' => fake()->randomElement(['Despedimento', 'Demissão', 'Reforma', 'Fim de contrato']),
        ]);
    }
}
