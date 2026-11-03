<?php

namespace Tests\Feature;

use App\Models\SalaryComponent;
use App\Models\SalaryComponentRegulation;
use App\Models\Tenant;
use App\Models\User;
use DateTimeImmutable;
use Tests\TestCase;

class SalaryComponentRegulationTest extends TestCase
{
    public function test_effective_rules_require_validation_and_preserve_unknown_incidences(): void
    {
        $tenant = Tenant::factory()->create();
        $component = SalaryComponent::factory()->for($tenant)->create();
        $validator = User::factory()->create(['tenant_id' => $tenant->id]);

        SalaryComponentRegulation::factory()->for($tenant)->for($component, 'component')->create([
            'version' => 1,
            'effective_from' => '2025-01-01',
            'effective_to' => '2025-12-31',
            'status' => 'active',
            'legal_source' => 'Fonte legal anterior',
            'legal_reference' => 'Artigo anterior',
            'validated_at' => '2025-01-01 09:00:00',
            'validated_by' => $validator->id,
        ]);

        SalaryComponentRegulation::factory()->for($tenant)->for($component, 'component')->create([
            'version' => 2,
            'effective_from' => '2026-01-01',
            'effective_to' => null,
            'employee_inss_applicable' => false,
            'employer_inss_applicable' => false,
            'irt_applicable' => true,
            'status' => 'active',
            'legal_source' => 'Fonte legal validada',
            'legal_reference' => 'Artigo validado',
            'validated_at' => '2026-01-01 09:00:00',
            'validated_by' => $validator->id,
        ]);

        SalaryComponentRegulation::factory()->for($tenant)->for($component, 'component')->create([
            'version' => 3,
            'effective_from' => '2026-02-01',
            'status' => 'draft',
        ]);

        $effectiveRegulation = SalaryComponentRegulation::query()
            ->effectiveFor(new DateTimeImmutable('2026-06-01'), 'ao', 'standard')
            ->firstOrFail();

        $this->assertSame(2, $effectiveRegulation->version);
        $this->assertFalse($effectiveRegulation->employee_inss_applicable);
        $this->assertFalse($effectiveRegulation->employer_inss_applicable);
        $this->assertTrue($effectiveRegulation->irt_applicable);

        $draftRegulation = SalaryComponentRegulation::query()->where('version', 3)->firstOrFail();
        $this->assertNull($draftRegulation->employer_inss_applicable);
    }
}
