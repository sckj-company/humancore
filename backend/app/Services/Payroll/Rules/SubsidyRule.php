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

    public function applies(PayrollContext $context): bool
    {
        if (array_key_exists('meal_allowance', $context->manualAdjustments['components'] ?? [])
            && $context->manualAdjustments['components']['meal_allowance'] !== null) {
            return false;
        }

        return ! $context->salaryComponents->contains(
            fn ($assignment) => in_array($assignment->component?->code, ['meal_allowance', 'meal_subsidy'], true),
        );
    }

    public function calculate(PayrollContext $context): float
    {
        $amount = $this->setting($context, 'payroll.remuneration.meal.amount');
        if ($amount === null) {
            $amount = $this->setting($context, 'payroll.subsidies.meal.daily', 0);
        }

        $unitRate = max(0, (float) $amount);
        if ($unitRate <= 0) {
            return 0.0;
        }

        $period = (string) ($this->setting($context, 'payroll.remuneration.meal.period', 'daily') ?: 'daily');

        return match ($period) {
            'weekly' => $unitRate * $context->workDays / 5,
            'fixed' => $unitRate,
            default => $unitRate * $context->workDays,
        };
    }
}
