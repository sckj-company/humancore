<?php

namespace Database\Factories;

use App\Models\OnboardingTemplate;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<OnboardingTemplate>
 */
class OnboardingTemplateFactory extends Factory
{
    protected $model = OnboardingTemplate::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'name' => fake()->randomElement([
                'Integração Novos Funcionários',
                'Onboarding Departamento TI',
                'Onboarding Comercial',
                'Checklist Admissão',
            ]),
            'description' => fake()->paragraph(),
            'is_active' => true,
        ];
    }
}
