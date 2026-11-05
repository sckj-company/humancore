<?php

namespace App\Services\Payroll\Rules;

use App\Services\Payroll\PayrollContext;

/**
 * IRT - Imposto sobre Rendimento do Trabalho (Angola).
 * Simplified progressive tax. Configurable brackets.
 */
class IRTRule extends AbstractPayrollRule
{
    public function getCode(): string
    {
        return 'irt';
    }

    public function getName(): string
    {
        return 'IRT (Imposto de Renda)';
    }

    public function getType(): string
    {
        return 'tax';
    }

    public function getPriority(): int
    {
        return 110;
    }

    public function isMandatory(): bool
    {
        return true;
    }

    public function calculate(PayrollContext $context): float
    {
        $taxable = $this->taxableBase($context);
        if ($taxable <= 0) {
            return 0.0;
        }

        $brackets = $context->irtTable?->brackets ?? $this->setting($context, 'payroll.irt.brackets', $this->defaultBrackets());

        $tax = 0.0;
        foreach ($brackets as $bracket) {
            $min = (float) ($bracket['lower_bound'] ?? $bracket['min'] ?? 0);
            $max = array_key_exists('upper_bound', $bracket)
                ? ($bracket['upper_bound'] !== null ? (float) $bracket['upper_bound'] : null)
                : (array_key_exists('max', $bracket) && $bracket['max'] !== null ? (float) $bracket['max'] : null);
            $rate = (float) ($bracket['rate'] ?? 0);
            $fixed = (float) ($bracket['fixed_amount'] ?? $bracket['fixed'] ?? 0);

            if ($max !== null) {
                if ($taxable >= $min && $taxable <= $max) {
                    $tax = $fixed + (($taxable - $min) * ($rate / 100));
                    return -1 * round($tax, 2);
                }
            } else {
                if ($taxable >= $min) {
                    $tax = $fixed + (($taxable - $min) * ($rate / 100));
                    return -1 * round($tax, 2);
                }
            }
        }

        return -1 * round($tax, 2);
    }

    protected function taxableBase(PayrollContext $context): float
    {
        $gross = $context->irtBase > 0 ? $context->irtBase : (float) $context->contract->base_salary;

        return max(0, $gross - $context->inssAmount);
    }

    protected function defaultBrackets(): array
    {
        return [
            ['lower_bound' => 0, 'upper_bound' => 100000, 'rate' => 0, 'fixed_amount' => 0],
            ['lower_bound' => 100000, 'upper_bound' => 200000, 'rate' => 7, 'fixed_amount' => 0],
            ['lower_bound' => 200000, 'upper_bound' => 500000, 'rate' => 11, 'fixed_amount' => 7000],
            ['lower_bound' => 500000, 'upper_bound' => 1000000, 'rate' => 15, 'fixed_amount' => 40000],
            ['lower_bound' => 1000000, 'upper_bound' => null, 'rate' => 19, 'fixed_amount' => 115000],
        ];
    }
}
