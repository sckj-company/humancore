<?php

namespace Database\Factories;

use App\Models\Position;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Position>
 */
class PositionFactory extends Factory
{
    protected $model = Position::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'department_id' => null,
            'title' => fake()->randomElement([
                'Gestor de RH', 'Analista Financeiro', 'Desenvolvedor', 'Operador',
                'Vendedor', 'Técnico de Logística', 'Coordenador', 'Assistente',
            ]),
            'code' => strtoupper(fake()->lexify('????')),
            'salary_min' => fake()->numberBetween(50000, 150000),
            'salary_max' => fake()->numberBetween(150000, 600000),
            'is_management' => false,
        ];
    }
}
