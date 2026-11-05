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
        $lateRecords = $context->attendance
            ->filter(fn ($record) => (int) ($record->late_minutes ?? 0) > 0)
            ->values();

        if ($lateRecords->isEmpty()) {
            return 0.0;
        }

        $minuteRate = (float) $context->setting(
            'payroll.discounts.lateness_minute_amount',
            ((float) $context->setting('payroll.discounts.lateness_hourly_amount', (float) $context->contract->base_salary / 220)) / 60,
        );

        $freeOccurrencesPerWeek = (int) $context->setting('payroll.discounts.lateness_free_occurrences_per_week', 0);
        $weeklyAccumulationMinutes = (int) $context->setting('payroll.discounts.lateness_weekly_accumulation_minutes', 0);

        $chargeableMinutes = 0;
        $weeklyGroups = $lateRecords->groupBy(fn ($record) => \Carbon\Carbon::parse($record->date)->startOfWeek()->format('Y-m-d'));

        foreach ($weeklyGroups as $records) {
            $chronological = $records->sortBy(fn ($record) => \Carbon\Carbon::parse($record->date)->toDateString())->values();
            $remainingMinutes = $chronological->slice($freeOccurrencesPerWeek)->sum(fn ($record) => (int) ($record->late_minutes ?? 0));

            if ($weeklyAccumulationMinutes > 0) {
                $chargeableMinutes += max(0, $remainingMinutes - $weeklyAccumulationMinutes);
            } else {
                $chargeableMinutes += $remainingMinutes;
            }
        }

        if ($chargeableMinutes <= 0) {
            return 0.0;
        }

        return -1 * round($chargeableMinutes * $minuteRate, 2);
    }
}
