<?php

namespace App\Services\Payroll;

use App\Models\Setting;

class RemunerationDefaultsService
{
    public const ALLOWANCES = [
        'meal' => [
            'code' => 'meal_allowance',
            'name' => 'Subsídio de Alimentação',
            'period' => 'daily',
            'amount_key' => 'remuneration.meal.amount',
            'period_key' => 'remuneration.meal.period',
            'legacy_amount_key' => 'subsidies.meal.daily',
        ],
        'transport' => [
            'code' => 'transport_allowance',
            'name' => 'Subsídio de Transporte',
            'period' => 'daily',
            'amount_key' => 'remuneration.transport.amount',
            'period_key' => 'remuneration.transport.period',
            'legacy_amount_key' => 'subsidies.transport.monthly',
        ],
        'vacation' => [
            'code' => 'vacation_subsidy',
            'name' => 'Subsídio de Férias',
            'period' => 'fixed',
            'amount_key' => 'remuneration.vacation.amount',
        ],
        'christmas' => [
            'code' => 'christmas_subsidy',
            'name' => 'Subsídio de Natal',
            'period' => 'fixed',
            'amount_key' => 'remuneration.christmas.amount',
        ],
        'family' => [
            'code' => 'family_allowance',
            'name' => 'Abono de Família',
            'period' => 'fixed',
            'amount_key' => 'remuneration.family.amount',
        ],
        'additional' => [
            'code' => 'additional_allowance',
            'name' => 'Abono Adicional',
            'period' => 'fixed',
            'amount_key' => 'remuneration.additional.amount',
        ],
        'bonus' => [
            'code' => 'bonus',
            'name' => 'Bónus',
            'period' => 'fixed',
            'amount_key' => 'remuneration.bonus.amount',
        ],
    ];

    /**
     * @return array{
     *   allowances: array<string, array{code: string, name: string, amount: float, period: string}>,
     *   overtime_hourly_rate: float
     * }
     */
    public static function forTenant(int $tenantId): array
    {
        $settings = Setting::query()
            ->where('tenant_id', $tenantId)
            ->where('group', 'payroll')
            ->where(function ($query): void {
                $query->where('key', 'like', 'remuneration.%')
                    ->orWhereIn('key', ['subsidies.meal.daily', 'subsidies.transport.monthly']);
            })
            ->pluck('value', 'key');

        $allowances = [];
        foreach (self::ALLOWANCES as $key => $definition) {
            $rawAmount = $settings->get($definition['amount_key']);
            if ($rawAmount === null && isset($definition['legacy_amount_key'])) {
                $rawAmount = $settings->get($definition['legacy_amount_key']);
            }

            $period = isset($definition['period_key'])
                ? (string) ($settings->get($definition['period_key']) ?: $definition['period'])
                : $definition['period'];
            if (! in_array($period, ['daily', 'weekly', 'fixed'], true)) {
                $period = $definition['period'];
            }

            $allowances[$key] = [
                'code' => $definition['code'],
                'name' => $definition['name'],
                'amount' => max(0, (float) ($rawAmount ?? 0)),
                'period' => $period,
            ];
        }

        return [
            'allowances' => $allowances,
            'overtime_hourly_rate' => max(0, (float) ($settings->get('remuneration.overtime_hourly_rate') ?? 0)),
        ];
    }
}
