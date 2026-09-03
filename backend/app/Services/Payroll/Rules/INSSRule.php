<?php

namespace App\Services\Payroll\Rules;

use App\Services\Payroll\PayrollContext;

/**
 * INSS - Instituto Nacional de Segurança Social (Angola).
 * Default rate 3% employee, 8% employer (configurable per tenant).
 */
class INSSRule extends AbstractPayrollRule
{
    public function getCode(): string
    {
        return 'inss';
    }

    public function getName(): string
    {
        return 'INSS (Segurança Social)';
    }

    public function getType(): string
    {
        return 'deduction';
    }

    public function getPriority(): int
    {
        return 100;
    }

    public function isMandatory(): bool
    {
        return true;
    }

    public function calculate(PayrollContext $context): float
    {
        $base = $this->calculateTaxableBase($context);
        $rate = (float) $this->setting($context, 'payroll.inss.employee_rate', 3.0);

        return -1 * round($base * ($rate / 100), 2);
    }

    protected function calculateTaxableBase(PayrollContext $context): float
    {
        return (float) $context->contract->base_salary;
    }
}
