<?php

namespace Database\Factories;

use App\Models\OnboardingTask;
use App\Models\OnboardingTemplate;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OnboardingTask>
 */
class OnboardingTaskFactory extends Factory
{
    protected $model = OnboardingTask::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'template_id' => OnboardingTemplate::factory(),
            'title' => fake()->randomElement([
                'Assinar contrato',
                'Configurar workstation',
                'Apresentar à equipa',
                'Aceder ao email',
                'Reunião com RH',
                'Formação inicial',
            ]),
            'description' => fake()->sentence(),
            'due_days' => fake()->numberBetween(1, 30),
            'sort_order' => 0,
            'status' => 'pending',
        ];
    }

    public function completed(): static
    {
        return $this->state(fn () => [
            'status' => 'completed',
            'completed_at' => now(),
        ]);
    }
}
