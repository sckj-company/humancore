<?php

namespace Tests\Feature;

use App\Models\AttendanceRecord;
use App\Models\Deduction;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\Position;
use App\Models\SalaryComponent;
use App\Models\SalaryComponentRegulation;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class PayrollRemunerationFlowCertificationTest extends TestCase
{
    use RefreshDatabase;

    private function seedTenantEnvironment(float $baseSalary = 300000): array
    {
        $tenant = Tenant::factory()->create(['currency' => 'AOA']);
        $user = User::factory()->create(['tenant_id' => $tenant->id]);
        Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $user->assignRole('admin');

        $department = Department::factory()->create(['tenant_id' => $tenant->id, 'name' => 'Operações']);
        $position = Position::query()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'title' => 'Técnico Sénior',
        ]);

        $employee = Employee::factory()->create([
            'tenant_id' => $tenant->id,
            'department_id' => $department->id,
            'position_id' => $position->id,
            'first_name' => 'João',
            'last_name' => 'Manuel',
            'status' => 'active',
            'approval_status' => 'approved',
        ]);

        $contract = EmployeeContract::factory()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'base_salary' => $baseSalary,
            'contract_type' => 'permanent',
            'start_date' => '2026-01-01',
            'end_date' => null,
            'is_active' => true,
        ]);

        PayrollInssRule::query()->create([
            'tenant_id' => $tenant->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'employee_rate' => 3.0,
            'employer_rate' => 8.0,
            'effective_from' => '2026-01-01',
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $user->id,
        ]);

        PayrollIrtTable::query()->create([
            'tenant_id' => $tenant->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'effective_from' => '2026-01-01',
            'status' => 'active',
            'validated_at' => now(),
            'validated_by' => $user->id,
            'brackets' => [
                ['lower_bound' => 0, 'upper_bound' => 100000, 'rate' => 0, 'fixed_amount' => 0],
                ['lower_bound' => 100000, 'upper_bound' => 200000, 'rate' => 7, 'fixed_amount' => 0],
                ['lower_bound' => 200000, 'upper_bound' => 500000, 'rate' => 11, 'fixed_amount' => 7000],
                ['lower_bound' => 500000, 'upper_bound' => 1000000, 'rate' => 15, 'fixed_amount' => 40000],
                ['lower_bound' => 1000000, 'upper_bound' => null, 'rate' => 19, 'fixed_amount' => 115000],
            ],
        ]);

        $this->actingAs($user);

        return [$tenant, $user, $employee, $contract];
    }

    public function test_certificacao_1_configuracao_individual_completa_da_tela_de_remuneracao(): void
    {
        [$tenant, $user, $employee] = $this->seedTenantEnvironment(300000);

        // 1. Configurar TODOS os 7 subsídios/abonos individuais na aba Remuneração
        $this->putJson("/api/v1/employees/{$employee->id}/payroll-settings", [
            'allowances' => [
                'meal' => ['amount' => 1500, 'period' => 'daily', 'use_global' => false],
                'transport' => ['amount' => 5000, 'period' => 'weekly', 'use_global' => false],
                'vacation' => ['amount' => 40000, 'use_global' => false],
                'christmas' => ['amount' => 40000, 'use_global' => false],
                'family' => ['amount' => 10000, 'use_global' => false],
                'additional' => ['amount' => 15000, 'use_global' => false],
                'bonus' => ['amount' => 25000, 'use_global' => false],
            ],
        ])->assertOk();

        // 2. Configurar valor individual da Hora Extra na aba Remuneração + 4h extras no mês
        $this->putJson("/api/v1/employees/{$employee->id}", [
            'overtime_hourly_rate' => 2500,
        ])->assertOk();

        AttendanceRecord::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-11-10',
            'status' => 'present',
            'overtime_minutes' => 240,
            'overtime_approved' => true,
        ]);

        // 3. Regulação fiscal (INSS + IRT) aplicada ao componente 'bonus' para comprovar incidência na base tributável
        $bonusComponent = SalaryComponent::query()
            ->where('tenant_id', $tenant->id)
            ->where('code', 'bonus')
            ->firstOrFail();

        SalaryComponentRegulation::query()->create([
            'tenant_id' => $tenant->id,
            'salary_component_id' => $bonusComponent->id,
            'country_code' => 'AO',
            'regime_code' => 'standard',
            'effective_from' => '2026-01-01',
            'employee_inss_applicable' => true,
            'employer_inss_applicable' => true,
            'irt_applicable' => true,
            'status' => 'active',
            'version' => 1,
            'validated_at' => now(),
            'validated_by' => $user->id,
        ]);

        // 4. Lançar Adiantamento (parcelado 40% Nov / 60% Dez) e Multa na aba Remuneração
        $this->postJson('/api/v1/deductions', [
            'employee_id' => $employee->id,
            'name' => 'Adiantamento Novembro',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'total_amount' => 50000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 40],
                ['reference_month' => '2026-12', 'percentage' => 60],
            ],
        ])->assertCreated();

        $this->postJson('/api/v1/deductions', [
            'employee_id' => $employee->id,
            'name' => 'Multa Disciplinar',
            'deduction_type' => 'fine',
            'amount_type' => 'fixed',
            'amount' => 5000,
            'starts_at' => '2026-11-01',
            'is_recurring' => false,
        ])->assertCreated();

        // Novembro 2026 possui 21 dias úteis (seg-sex)
        $period = PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process", [
            'employee_ids' => [$employee->id],
        ])->assertOk();

        $record = PayrollRecord::query()
            ->where('payroll_period_id', $period->id)
            ->where('employee_id', $employee->id)
            ->firstOrFail();

        $breakdown = collect($record->details['breakdown'] ?? [])->keyBy('code');

        // Verificações por componente
        $this->assertEquals(21, $record->work_days);
        $this->assertEquals(300000.0, (float) $breakdown['base_salary']['amount']);
        $this->assertEquals(31500.0, (float) $breakdown['meal_allowance']['amount']);      // 21 * 1500
        $this->assertEquals(21000.0, (float) $breakdown['transport_allowance']['amount']); // (21/5) * 5000
        $this->assertEquals(40000.0, (float) $breakdown['vacation_subsidy']['amount']);
        $this->assertEquals(40000.0, (float) $breakdown['christmas_subsidy']['amount']);
        $this->assertEquals(10000.0, (float) $breakdown['family_allowance']['amount']);
        $this->assertEquals(15000.0, (float) $breakdown['additional_allowance']['amount']);
        $this->assertEquals(25000.0, (float) $breakdown['bonus']['amount']);
        $this->assertEquals(10000.0, (float) $breakdown['overtime']['amount']);            // 4h * 2500

        // Bases tributáveis & impostos: Base (300k) + Bónus regulado (25k) = 325k
        $this->assertEquals(325000.0, (float) $record->inss_base);
        $this->assertEquals(-9750.0, (float) $breakdown['inss']['amount']);                // 3% de 325k
        $this->assertEquals(26000.0, (float) $record->employer_inss);                      // 8% de 325k
        $this->assertEquals(315250.0, (float) $record->irt_taxable_base);                  // 325k - 9750
        $this->assertEquals(-19677.5, (float) $breakdown['irt']['amount']);                // 7000 + (315250-200000)*11%

        // Totais consolidados
        $this->assertEquals(492500.0, (float) $record->gross_salary);
        $this->assertEquals(34750.0, (float) $record->total_deductions);                   // 9750 + 20000 + 5000
        $this->assertEquals(19677.5, (float) $record->total_taxes);
        $this->assertEquals(438072.5, (float) $record->net_salary);
        $this->assertEquals(518500.0, (float) $record->employer_cost);                     // 492500 + 26000

        // Aba Resumo da Folha inclui o total de IRT via registos e totais brutos/líquidos
        $this->getJson("/api/v1/payroll/periods/{$period->id}")
            ->assertOk()
            ->assertJsonPath('data.total_gross', 492500)
            ->assertJsonPath('data.total_net', 438072.5)
            ->assertJsonPath('data.records.0.total_taxes', 19677.5);
    }

    public function test_certificacao_2_padroes_globais_fallback_sobrescrita_parcial_faltas_atrasos_e_desconto_percentual(): void
    {
        [$tenant, , $employee] = $this->seedTenantEnvironment(250000);

        // 1. Configurar Padrões Globais da Empresa (Configurações -> Remuneração / Descontos)
        $this->putJson('/api/v1/settings/bulk', [
            'group' => 'payroll',
            'values' => [
                'remuneration.meal.amount' => '1000',
                'remuneration.meal.period' => 'daily',
                'remuneration.transport.amount' => '800',
                'remuneration.transport.period' => 'daily',
                'remuneration.family.amount' => '6000',
                'remuneration.bonus.amount' => '5000',
                'remuneration.overtime_hourly_rate' => '2000',
                'discounts.absence_daily_amount' => '10000',
                'discounts.lateness_hourly_amount' => '1500',
                'discounts.lateness_free_occurrences_per_week' => '0',
                'discounts.lateness_weekly_accumulation_minutes' => '0',
            ],
        ])->assertOk();

        // 2. Funcionário mantém meal/transport/family globais (use_global=true), mas sobrescreve apenas Bónus para 18.000
        $this->putJson("/api/v1/employees/{$employee->id}/payroll-settings", [
            'allowances' => [
                'meal' => ['amount' => null, 'period' => 'daily', 'use_global' => true],
                'transport' => ['amount' => null, 'period' => 'daily', 'use_global' => true],
                'family' => ['amount' => null, 'use_global' => true],
                'bonus' => ['amount' => 18000, 'use_global' => false],
            ],
        ])->assertOk();

        // 3. Registar 1 falta descontável (work_days: 21 -> 20), 120m de atraso (2h) e 120m de hora extra sem preço manual
        AttendanceRecord::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-11-04',
            'status' => 'absent',
            'deduct_from_salary' => true,
        ]);
        AttendanceRecord::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-11-05',
            'status' => 'late',
            'late_minutes' => 120,
        ]);
        AttendanceRecord::query()->create([
            'tenant_id' => $tenant->id,
            'employee_id' => $employee->id,
            'date' => '2026-11-06',
            'status' => 'present',
            'overtime_minutes' => 120,
            'overtime_approved' => true,
        ]);

        // 4. Desconto percentual recorrente (5% do bruto) na aba Remuneração
        $this->postJson('/api/v1/deductions', [
            'employee_id' => $employee->id,
            'name' => 'Seguro Corporativo',
            'deduction_type' => 'insurance',
            'amount_type' => 'percentage',
            'percentage' => 5,
            'is_recurring' => true,
        ])->assertCreated();

        $period = PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Novembro 2026 Globais',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$period->id}/process", [
            'employee_ids' => [$employee->id],
        ])->assertOk();

        $record = PayrollRecord::query()
            ->where('payroll_period_id', $period->id)
            ->where('employee_id', $employee->id)
            ->firstOrFail();

        $breakdown = collect($record->details['breakdown'] ?? [])->keyBy('code');

        // Fallbacks globais + sobrescrita parcial + regra de presença
        $this->assertEquals(20, $record->work_days);                                       // 21 - 1 falta
        $this->assertEquals(1, $record->absent_days);
        $this->assertEquals(20000.0, (float) $breakdown['meal_subsidy']['amount']);        // 20 * 1000 (SubsidyRule global)
        $this->assertEquals(16000.0, (float) $breakdown['transport_allowance']['amount']); // 20 * 800 (global fallback)
        $this->assertEquals(6000.0, (float) $breakdown['family_allowance']['amount']);     // global fallback fixo
        $this->assertEquals(18000.0, (float) $breakdown['bonus']['amount']);               // sobrescrito (ignora 5000 global)
        $this->assertEquals(4000.0, (float) $breakdown['overtime']['amount']);             // 2h * 2000 global
        $this->assertEquals(-10000.0, (float) $breakdown['absence']['amount']);            // 1 * 10000
        $this->assertEquals(-3000.0, (float) $breakdown['lateness']['amount']);            // 2h * 1500

        // Bruto = 250k + 20k + 16k + 6k + 18k + 4k = 314.000,00; Desconto 5% = 15.700,00
        $this->assertEquals(314000.0, (float) $record->gross_salary);
        $this->assertEquals(-7500.0, (float) $breakdown['inss']['amount']);                // 3% de 250k
        $this->assertEquals(-11675.0, (float) $breakdown['irt']['amount']);                // 7000 + (242500-200000)*11%
        $this->assertEquals(36200.0, (float) $record->total_deductions);                   // 10k + 3k + 7.5k + 15.7k
        $this->assertEquals(11675.0, (float) $record->total_taxes);
        $this->assertEquals(266125.0, (float) $record->net_salary);                        // 314000 - 36200 - 11675
    }

    public function test_certificacao_3_recalculo_apos_alteracao_remuneracao_e_liquidacao_de_parcelas_em_multiplos_meses(): void
    {
        [$tenant, , $employee] = $this->seedTenantEnvironment(200000);

        // 1. Configuração inicial na aba Remuneração + Adiantamento 60k parcelado (30% Nov / 70% Dez)
        $this->putJson("/api/v1/employees/{$employee->id}/payroll-settings", [
            'allowances' => [
                'meal' => ['amount' => 0, 'period' => 'daily', 'use_global' => false],
                'transport' => ['amount' => 0, 'period' => 'daily', 'use_global' => false],
                'bonus' => ['amount' => 10000, 'use_global' => false],
            ],
        ])->assertOk();

        $deductionResp = $this->postJson('/api/v1/deductions', [
            'employee_id' => $employee->id,
            'name' => 'Adiantamento Parcelado',
            'deduction_type' => 'advance',
            'amount_type' => 'fixed',
            'total_amount' => 60000,
            'installments' => [
                ['reference_month' => '2026-11', 'percentage' => 30],
                ['reference_month' => '2026-12', 'percentage' => 70],
            ],
        ])->assertCreated();
        $deductionId = $deductionResp->json('data.id');

        $novPeriod = PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Folha Novembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-11-01',
            'period_end' => '2026-11-30',
            'status' => 'open',
        ]);

        // Passo A: Processamento inicial de Novembro -> 210k bruto, INSS 6k, IRT 6.580, Adiantamento 18k (30%), Net 179.420
        $this->postJson("/api/v1/payroll/periods/{$novPeriod->id}/process", [
            'employee_ids' => [$employee->id],
        ])->assertOk();

        $initialRecord = PayrollRecord::query()
            ->where('payroll_period_id', $novPeriod->id)
            ->where('employee_id', $employee->id)
            ->firstOrFail();

        $this->assertEquals(210000.0, (float) $initialRecord->gross_salary);
        $this->assertEquals(24000.0, (float) $initialRecord->total_deductions); // 6k INSS + 18k (30%)
        $this->assertEquals(6580.0, (float) $initialRecord->total_taxes);       // (194000 - 100000) * 7%
        $this->assertEquals(179420.0, (float) $initialRecord->net_salary);

        // Passo B: RH edita Remuneração do funcionário (bónus -> 30k + abono família -> 8k) e recalcula Novembro
        $this->putJson("/api/v1/employees/{$employee->id}/payroll-settings", [
            'allowances' => [
                'meal' => ['amount' => 0, 'period' => 'daily', 'use_global' => false],
                'transport' => ['amount' => 0, 'period' => 'daily', 'use_global' => false],
                'family' => ['amount' => 8000, 'use_global' => false],
                'bonus' => ['amount' => 30000, 'use_global' => false],
            ],
        ])->assertOk();

        $this->postJson("/api/v1/payroll/periods/{$novPeriod->id}/process", [
            'employee_ids' => [$employee->id],
        ])->assertOk();

        $recalculatedRecord = $initialRecord->fresh();
        $this->assertEquals(238000.0, (float) $recalculatedRecord->gross_salary); // 200k + 30k + 8k
        $this->assertEquals(207420.0, (float) $recalculatedRecord->net_salary);   // 238k - 24k - 6.58k

        // Passo C: Submeter, aprovar e pagar Novembro -> parcela de Novembro liquidada (18k pago, resta 42k)
        $this->postJson("/api/v1/payroll/periods/{$novPeriod->id}/submit")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$novPeriod->id}/approve")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$novPeriod->id}/pay")->assertOk();

        $afterNov = Deduction::query()->with('installments')->findOrFail($deductionId);
        $this->assertEquals(18000.0, (float) $afterNov->paid_amount);
        $this->assertSame('active', $afterNov->status);
        $this->assertSame('paid', $afterNov->installments[0]->status);
        $this->assertSame('pending', $afterNov->installments[1]->status);

        // Passo D: Processar e pagar Dezembro -> aplica apenas a 2ª parcela (70% = 42k) e conclui o adiantamento
        $decPeriod = PayrollPeriod::query()->create([
            'tenant_id' => $tenant->id,
            'name' => 'Folha Dezembro 2026',
            'period_type' => 'monthly',
            'period_start' => '2026-12-01',
            'period_end' => '2026-12-31',
            'status' => 'open',
        ]);

        $this->postJson("/api/v1/payroll/periods/{$decPeriod->id}/process", [
            'employee_ids' => [$employee->id],
        ])->assertOk();

        $decRecord = PayrollRecord::query()
            ->where('payroll_period_id', $decPeriod->id)
            ->where('employee_id', $employee->id)
            ->firstOrFail();

        $this->assertEquals(238000.0, (float) $decRecord->gross_salary);
        $this->assertEquals(48000.0, (float) $decRecord->total_deductions); // 6k INSS + 42k (70%)
        $this->assertEquals(183420.0, (float) $decRecord->net_salary);      // 238k - 48k - 6.58k

        $this->postJson("/api/v1/payroll/periods/{$decPeriod->id}/submit")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$decPeriod->id}/approve")->assertOk();
        $this->postJson("/api/v1/payroll/periods/{$decPeriod->id}/pay")->assertOk();

        $afterDec = Deduction::query()->with('installments')->findOrFail($deductionId);
        $this->assertEquals(60000.0, (float) $afterDec->paid_amount);
        $this->assertSame('completed', $afterDec->status);
        $this->assertSame('paid', $afterDec->installments[1]->status);
    }
}
