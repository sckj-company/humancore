<?php

namespace App\Services\Payroll\Rules;

use App\Services\Payroll\PayrollContext;

class LatenessRule extends AbstractPayrollRule
{
    public function getCode(): string
    {
        return 'lateness';
    }

    public function getName(): string
    {
        return 'Atrasos';
    }

    public function getType(): string
    {
        return 'deduction';
    }

    public function getPriority(): int
    {
        return 51;
    }

    public function isMandatory(): bool
    {
        return false;
    }

    public function calculate(PayrollContext $context): float
    {
        $minutes = $context->lateMinutes;
        if ($minutes <= 0) {
            return 0.0;
        }

        $hourlyRate = (float) $context->contract->base_salary / 220;
        $hours = $minutes / 60;

        return -1 * round($hourlyRate * $hours, 2);
    }
}
