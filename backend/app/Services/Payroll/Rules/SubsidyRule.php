<?php

namespace App\Services\Payroll\Rules;

use App\Services\Payroll\PayrollContext;

class SubsidyRule extends AbstractPayrollRule
{
    public function getCode(): string
    {
        return 'meal_subsidy';
    }

    public function getName(): string
    {
        return 'Subsídio de Alimentação';
    }

    public function getType(): string
    {
        return 'earning';
    }

    public function getPriority(): int
    {
        return 10;
    }

    public function isMandatory(): bool
    {
        return false;
    }

    public function calculate(PayrollContext $context): float
    {
        $daily = (float) $this->setting($context, 'payroll.subsidies.meal.daily', 0);
        $workedDays = $context->workDays;

        return $daily * $workedDays;
    }
}
