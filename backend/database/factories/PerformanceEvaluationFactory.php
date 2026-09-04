<?php

namespace Database\Factories;

use App\Models\Employee;
use App\Models\PerformanceEvaluation;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PerformanceEvaluation>
 */
class PerformanceEvaluationFactory extends Factory
{
    protected $model = PerformanceEvaluation::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'employee_id' => Employee::factory(),
            'evaluator_id' => User::factory(),
            'period' => '2026-H1',
            'cycle' => 'semi_annual',
            'period_start' => now()->subMonths(6),
            'period_end' => now(),
            'score' => fake()->randomFloat(2, 1, 5),
            'criteria' => [
                'productivity' => fake()->numberBetween(1, 5),
                'quality' => fake()->numberBetween(1, 5),
                'teamwork' => fake()->numberBetween(1, 5),
                'communication' => fake()->numberBetween(1, 5),
                'initiative' => fake()->numberBetween(1, 5),
            ],
            'strengths' => fake()->paragraph(),
            'improvements' => fake()->paragraph(),
            'goals' => fake()->paragraph(),
            'comments' => fake()->paragraph(),
            'status' => 'draft',
        ];
    }

    public function submitted(): static
    {
        return $this->state(fn () => [
            'status' => 'submitted',
            'submitted_at' => now(),
        ]);
    }

    public function approved(): static
    {
        return $this->state(fn () => [
            'status' => 'approved',
            'submitted_at' => now()->subDay(),
            'approved_at' => now(),
        ]);
    }
}
