<?php

namespace Database\Factories;

use App\Models\PayrollIrtTable;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PayrollIrtTable>
 */
class PayrollIrtTableFactory extends Factory
{
    protected $model = PayrollIrtTable::class;

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
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'brackets' => [
                ['lower_bound' => 0, 'upper_bound' => 100000, 'rate' => 0, 'fixed_amount' => 0],
                ['lower_bound' => 100000, 'upper_bound' => 200000, 'rate' => 7, 'fixed_amount' => 0],
                ['lower_bound' => 200000, 'upper_bound' => 500000, 'rate' => 11, 'fixed_amount' => 7000],
                ['lower_bound' => 500000, 'upper_bound' => 1000000, 'rate' => 15, 'fixed_amount' => 40000],
                ['lower_bound' => 1000000, 'upper_bound' => null, 'rate' => 19, 'fixed_amount' => 115000],
            ],
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

