<?php

namespace Database\Factories;

use App\Models\Benefit;
use App\Models\Employee;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Benefit>
 */
class BenefitFactory extends Factory
{
    protected $model = Benefit::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'employee_id' => Employee::factory(),
            'name' => fake()->randomElement([
                'Seguro de Saúde',
                'Subsídio de Transporte',
                'Subsídio de Alimentação',
                'Alojamento',
                'Telefone',
                'Ginásio',
            ]),
            'benefit_type' => fake()->randomElement(array_keys(Benefit::TYPES)),
            'amount_type' => 'fixed',
            'amount' => fake()->numberBetween(5000, 150000),
            'percentage' => null,
            'is_taxable' => fake()->boolean(20),
            'provider' => fake()->randomElement(['ENSA Seguros', 'AAA Seguros', null]),
            'start_date' => fake()->dateTimeBetween('-1 year', '-1 month')->format('Y-m-d'),
            'end_date' => null,
            'status' => 'active',
        ];
    }

    public function percentage(): static
    {
        return $this->state(fn () => [
            'amount_type' => 'percentage',
            'percentage' => fake()->randomElement([5.0, 7.5, 10.0, 15.0]),
            'amount' => 0,
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn () => ['status' => 'inactive']);
    }
}
