<?php

namespace Database\Factories;

use App\Models\SalaryComponent;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SalaryComponent>
 */
class SalaryComponentFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'name' => fake()->words(2, true),
            'code' => strtoupper(fake()->unique()->lexify('COMP????')),
            'type' => 'earning',
            'calculation_type' => 'fixed',
            'default_value' => 0,
            'is_taxable' => false,
            'is_mandatory' => false,
            'is_active' => true,
            'priority' => 0,
        ];
    }
}
