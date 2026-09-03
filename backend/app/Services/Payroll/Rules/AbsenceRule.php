<?php

namespace App\Services\Payroll\Rules;

use App\Services\Payroll\PayrollContext;

class AbsenceRule extends AbstractPayrollRule
{
    public function getCode(): string
    {
        return 'absence';
    }

    public function getName(): string
    {
        return 'Faltas';
    }

    public function getType(): string
    {
        return 'deduction';
    }

    public function getPriority(): int
    {
        return 50;
    }

    public function isMandatory(): bool
    {
        return false;
    }

    public function calculate(PayrollContext $context): float
    {
        $absentDays = $context->absentDays;
        if ($absentDays <= 0) {
            return 0.0;
        }

        $dailyRate = (float) $context->contract->base_salary / 30;

        return -1 * round($dailyRate * $absentDays, 2);
    }
}
