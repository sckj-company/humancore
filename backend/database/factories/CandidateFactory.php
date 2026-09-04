<?php

namespace Database\Factories;

use App\Models\Candidate;
use App\Models\JobOpening;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Candidate>
 */
class CandidateFactory extends Factory
{
    protected $model = Candidate::class;

    public function definition(): array
    {
        $firstName = fake()->firstName();
        $lastName = fake()->lastName();

        return [
            'tenant_id' => Tenant::factory(),
            'job_opening_id' => JobOpening::factory(),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => fake()->unique()->safeEmail(),
            'phone' => fake()->e164PhoneNumber(),
            'location' => fake()->city(),
            'source' => fake()->randomElement(['website', 'linkedin', 'referral', 'indeed', 'other']),
            'cover_letter' => fake()->paragraph(2),
            'linkedin_url' => 'https://linkedin.com/in/'.fake()->userName(),
            'years_experience' => fake()->numberBetween(0, 15),
            'status' => 'applied',
            'expected_salary' => fake()->numberBetween(300000, 1500000),
            'rating' => null,
            'applied_at' => now(),
            'last_status_at' => now(),
        ];
    }

    public function forJob(JobOpening $job): static
    {
        return $this->state(fn () => [
            'tenant_id' => $job->tenant_id,
            'job_opening_id' => $job->id,
        ]);
    }
}
