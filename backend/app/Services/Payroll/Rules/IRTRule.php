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
        $brackets = $this->setting($context, 'payroll.irt.brackets', $this->defaultBrackets());

        $tax = 0.0;
        $remaining = $taxable;
        $previousMax = 0;

        foreach ($brackets as $bracket) {
            $min = (float) ($bracket['min'] ?? 0);
            $rate = (float) ($bracket['rate'] ?? 0);

            $span = $bracket['max'] ?? null;

            if ($span === null) {
                $tax += max(0, $remaining - $min) * ($rate / 100);
                $remaining = 0;
                break;
            }

            if ($taxable > $min) {
                $portion = min($taxable, $span) - $min;
                $tax += $portion * ($rate / 100);
                $remaining = $taxable - $span;
            }
            $previousMax = $span;
        }

        return -1 * round($tax, 2);
    }

    protected function taxableBase(PayrollContext $context): float
    {
        $gross = (float) $context->contract->base_salary;
        $inss = (float) $this->setting($context, 'payroll.inss.employee_rate', 3.0);

        return max(0, $gross - ($gross * ($inss / 100)));
    }

    protected function defaultBrackets(): array
    {
        return [
            ['min' => 0, 'max' => 100000, 'rate' => 0],
            ['min' => 100000, 'max' => 200000, 'rate' => 7],
            ['min' => 200000, 'max' => 500000, 'rate' => 11],
            ['min' => 500000, 'max' => 1000000, 'rate' => 15],
            ['min' => 1000000, 'rate' => 19],
        ];
    }
}
