<?php

namespace App\Services\Payroll\Rules;

use App\Services\Payroll\PayrollContext;

class OvertimeRule extends AbstractPayrollRule
{
    public function getCode(): string
    {
        return 'overtime';
    }

    public function getName(): string
    {
        return 'Horas Extras';
    }

    public function getType(): string
    {
        return 'earning';
    }

    public function getPriority(): int
    {
        return 15;
    }

    public function isMandatory(): bool
    {
        return false;
    }

    public function calculate(PayrollContext $context): float
    {
        if ($context->overtimeHours <= 0) {
            return 0.0;
        }

        $hourlyRate = (float) $context->contract->base_salary / 220;
        $rate = (float) $this->setting($context, 'payroll.overtime.rate', 1.5);

        return round($hourlyRate * $context->overtimeHours * $rate, 2);
    }
}
