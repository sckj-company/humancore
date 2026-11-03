<?php

namespace Database\Factories;

use App\Models\SalaryComponent;
use App\Models\SalaryComponentRegulation;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<SalaryComponentRegulation>
 */
class SalaryComponentRegulationFactory extends Factory
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
            'salary_component_id' => SalaryComponent::factory(),
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'version' => 1,
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'employee_inss_applicable' => null,
            'employer_inss_applicable' => null,
            'irt_applicable' => null,
            'status' => 'draft',
            'legal_source' => null,
            'legal_reference' => null,
            'validated_at' => null,
            'validated_by' => null,
        ];
    }
}
