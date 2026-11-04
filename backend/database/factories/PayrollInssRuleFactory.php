<?php

namespace Database\Factories;

use App\Models\PayrollInssRule;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PayrollInssRule>
 */
class PayrollInssRuleFactory extends Factory
{
    protected $model = PayrollInssRule::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'version' => 1,
            'employee_rate' => 3.0000,
            'employer_rate' => 8.0000,
            'max_base' => null,
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'status' => 'draft',
            'legal_source' => null,
            'legal_reference' => null,
            'legal_document_path' => null,
            'validated_at' => null,
            'validated_by' => null,
            'revoked_at' => null,
            'revoked_by' => null,
            'revocation_reason' => null,
        ];
    }
}

