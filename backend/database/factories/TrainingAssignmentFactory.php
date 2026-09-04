<?php

namespace Database\Factories;

use App\Models\Employee;
use App\Models\Tenant;
use App\Models\Training;
use App\Models\TrainingAssignment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<TrainingAssignment>
 */
class TrainingAssignmentFactory extends Factory
{
    protected $model = TrainingAssignment::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'training_id' => Training::factory(),
            'employee_id' => Employee::factory(),
            'status' => 'enrolled',
            'enrolled_at' => now(),
        ];
    }

    public function completed(): static
    {
        return $this->state(fn () => [
            'status' => 'completed',
            'enrolled_at' => now()->subWeek(),
            'completed_at' => now(),
            'score' => fake()->randomFloat(2, 5, 10),
        ]);
    }
}
