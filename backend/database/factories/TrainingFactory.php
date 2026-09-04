<?php

namespace Database\Factories;

use App\Models\Tenant;
use App\Models\Training;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Training>
 */
class TrainingFactory extends Factory
{
    protected $model = Training::class;

    public function definition(): array
    {
        $title = fake()->randomElement([
            'Liderança Transformacional',
            'Excel Avançado',
            'Gestão de Conflitos',
            'Segurança no Trabalho',
            'Comunicação Eficaz',
            'Power BI para Negócios',
            'Gestão de Projetos Ágeis',
            'Atendimento ao Cliente',
        ]);

        $start = fake()->dateTimeBetween('-1 month', '+2 months');

        return [
            'tenant_id' => Tenant::factory(),
            'title' => $title,
            'description' => fake()->paragraph(),
            'category' => fake()->randomElement(array_keys(Training::CATEGORIES)),
            'duration_hours' => fake()->numberBetween(4, 80),
            'provider' => fake()->company(),
            'location' => fake()->randomElement(['Sala A', 'Online', 'Auditório', 'Sala B']),
            'cost' => fake()->numberBetween(0, 500000),
            'currency' => 'AOA',
            'max_participants' => fake()->numberBetween(10, 50),
            'start_date' => $start,
            'end_date' => (clone $start)->modify('+'.fake()->numberBetween(1, 30).' days'),
            'status' => 'planned',
        ];
    }

    public function open(): static
    {
        return $this->state(fn () => ['status' => 'open']);
    }

    public function inProgress(): static
    {
        return $this->state(fn () => ['status' => 'in_progress']);
    }
}
