<?php

namespace Database\Factories;

use App\Models\JobOpening;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<JobOpening>
 */
class JobOpeningFactory extends Factory
{
    protected $model = JobOpening::class;

    public function definition(): array
    {
        $title = fake()->jobTitle();

        return [
            'tenant_id' => Tenant::factory(),
            'title' => $title,
            'slug' => \Illuminate\Support\Str::slug($title).'-'.fake()->bothify('??####'),
            'description' => fake()->paragraph(3),
            'requirements' => fake()->paragraph(2),
            'location' => fake()->city(),
            'employment_type' => fake()->randomElement(['full_time', 'part_time', 'contract', 'internship']),
            'experience_level' => fake()->randomElement(['junior', 'mid', 'senior', 'lead']),
            'salary_min' => fake()->numberBetween(200000, 800000),
            'salary_max' => fake()->numberBetween(800000, 2000000),
            'currency' => 'AOA',
            'openings_count' => fake()->numberBetween(1, 5),
            'status' => 'draft',
            'published_at' => null,
            'closes_at' => null,
        ];
    }

    public function open(): static
    {
        return $this->state(fn () => [
            'status' => 'open',
            'published_at' => now()->subDays(2),
        ]);
    }

    public function closed(): static
    {
        return $this->state(fn () => [
            'status' => 'closed',
            'closed_at' => now()->subDay(),
        ]);
    }
}
