<?php

namespace App\Services\Payroll\Rules;

use App\Services\Payroll\PayrollContext;
use App\Services\Payroll\PayrollRuleInterface;

class BaseSalaryRule implements PayrollRuleInterface
{
    public function getCode(): string
    {
        return 'base_salary';
    }

    public function getName(): string
    {
        return 'Salário Base';
    }

    public function getType(): string
    {
        return 'earning';
    }

    public function getPriority(): int
    {
        return 1;
    }

    public function isMandatory(): bool
    {
        return true;
    }

    public function applies(PayrollContext $context): bool
    {
        return true;
    }

    public function calculate(PayrollContext $context): float
    {
        return (float) $context->contract->base_salary;
    }
}
