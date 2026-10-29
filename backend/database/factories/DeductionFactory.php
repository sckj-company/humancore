<?php

namespace Database\Factories;

use App\Models\Deduction;
use App\Models\Employee;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Deduction>
 */
class DeductionFactory extends Factory
{
    protected $model = Deduction::class;

    public function definition(): array
    {
        $total = fake()->numberBetween(100000, 3000000);

        return [
            'tenant_id' => Tenant::factory(),
            'employee_id' => Employee::factory(),
            'name' => fake()->randomElement([
                'Empréstimo do Banco BAI',
                'Adiantamento Salarial',
                'Pensão Alimentícia',
                'Seguro de Vida',
                'Quota Sindical',
            ]),
            'deduction_type' => fake()->randomElement(array_keys(Deduction::TYPES)),
            'amount_type' => 'fixed',
            'amount' => fake()->numberBetween(5000, 200000),
            'percentage' => null,
            'total_amount' => $total,
            'paid_amount' => fake()->numberBetween(0, $total),
            'installment_count' => fake()->numberBetween(3, 24),
            'installment_amount' => fake()->numberBetween(5000, 200000),
            'is_recurring' => fake()->boolean(70),
            'status' => 'active',
            'approved_at' => fake()->dateTimeBetween('-6 months', '-1 month'),
        ];
    }

    public function percentage(): static
    {
        return $this->state(fn () => [
            'amount_type' => 'percentage',
            'percentage' => fake()->randomElement([5.0, 10.0, 15.0]),
            'amount' => 0,
            'total_amount' => null,
        ]);
    }

    public function completed(): static
    {
        return $this->state(fn () => [
            'status' => 'completed',
            'paid_amount' => fn (array $attributes) => $attributes['total_amount'],
        ]);
    }

    public function cancelled(): static
    {
        return $this->state(fn () => ['status' => 'cancelled']);
    }
}
