<?php

namespace App\Services\Payroll\Rules;

use App\Models\AttendanceRecord;
use App\Services\Payroll\PayrollContext;
use Carbon\Carbon;

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
        $freeOccurrencesPerWeek = (int) $context->setting('payroll.discounts.lateness_free_occurrences_per_week', 0);
        $weeklyAccumulationMinutes = (int) $context->setting('payroll.discounts.lateness_weekly_accumulation_minutes', 0);
        $amountPerThreshold = (float) $context->setting('payroll.discounts.lateness_accumulation_amount', 0);

        $periodStart = Carbon::parse($context->period->period_start)->startOfDay();
        $periodEnd = Carbon::parse($context->period->period_end)->startOfDay();
        $historyStart = $periodStart->copy()->subMonthNoOverflow()->startOfMonth();
        $lateRecords = AttendanceRecord::query()
            ->where('employee_id', $context->employee->id)
            ->whereBetween('date', [$historyStart->toDateString(), $periodEnd->toDateString()])
            ->where('late_minutes', '>', 0)
            ->orderBy('date')
            ->orderBy('id')
            ->get();

        if ($lateRecords->isEmpty()) {
            return 0.0;
        }

        $dailyMinutes = $lateRecords
            ->groupBy(fn ($record) => Carbon::parse($record->date)->toDateString())
            ->map(fn ($dayRecords) => $dayRecords->sum(fn ($record) => (int) $record->late_minutes));
        $accumulatedMinutes = 0;
        $freeOccurrences = 0;
        $previousWeekStart = null;
        $previousMonth = null;
        $discount = 0.0;
        $events = [];
        $eventSequences = [];

        foreach ($dailyMinutes as $date => $minutes) {
            $day = Carbon::parse($date);
            $weekStart = $day->copy()->startOfWeek()->toDateString();
            $month = $day->format('Y-m');

            if ($previousMonth !== null && $month !== $previousMonth) {
                if ($accumulatedMinutes > 0) {
                    $events[] = $this->event(
                        'month_reset',
                        $date,
                        $weekStart,
                        $accumulatedMinutes,
                        0,
                        ['month_ended' => $previousMonth, 'month_started' => $month],
                    );
                }

                $accumulatedMinutes = 0;
            } elseif ($previousWeekStart !== null && $weekStart !== $previousWeekStart && $accumulatedMinutes > 0) {
                $events[] = $this->event(
                    'week_carry',
                    $date,
                    $weekStart,
                    $accumulatedMinutes,
                    0,
                    ['from_week' => $previousWeekStart, 'to_week' => $weekStart],
                );
            }

            if ($previousWeekStart !== $weekStart) {
                $freeOccurrences = $freeOccurrencesPerWeek;
            }

            if ($freeOccurrences > 0) {
                $freeOccurrences--;
            } elseif ($weeklyAccumulationMinutes > 0) {
                $totalAccumulatedMinutes = $accumulatedMinutes + (int) $minutes;
                $thresholdsReached = intdiv($totalAccumulatedMinutes, $weeklyAccumulationMinutes);

                if ($thresholdsReached > 0) {
                    for ($threshold = 1; $threshold <= $thresholdsReached; $threshold++) {
                        $amount = round($amountPerThreshold, 2);
                        $eventSequences[$date] = ($eventSequences[$date] ?? 0) + 1;
                        $events[] = $this->event(
                            'discount',
                            $date,
                            $weekStart,
                            $weeklyAccumulationMinutes,
                            $amount,
                            [
                                'threshold_minutes' => $weeklyAccumulationMinutes,
                                'thresholds_reached' => 1,
                                'remaining_minutes' => $totalAccumulatedMinutes - ($weeklyAccumulationMinutes * $threshold),
                                'sequence' => $eventSequences[$date],
                            ],
                        );
                    }

                    if ($date >= $periodStart->toDateString() && $date <= $periodEnd->toDateString()) {
                        $discount += $thresholdsReached * $amountPerThreshold;
                    }
                }

                $accumulatedMinutes = $totalAccumulatedMinutes % $weeklyAccumulationMinutes;
            } else {
                $hourlyRate = (float) $context->setting('payroll.discounts.lateness_hourly_amount', 0);
                $amount = round(((int) $minutes / 60) * $hourlyRate, 2);
                $eventSequences[$date] = ($eventSequences[$date] ?? 0) + 1;
                $events[] = $this->event(
                    'discount',
                    $date,
                    $weekStart,
                    (int) $minutes,
                    $amount,
                    ['sequence' => $eventSequences[$date]],
                );

                if ($date >= $periodStart->toDateString() && $date <= $periodEnd->toDateString()) {
                    $discount += $amount;
                }
            }

            $previousWeekStart = $weekStart;
            $previousMonth = $month;
        }

        $context->latenessEvents = $events;

        return $discount > 0 ? -1 * round($discount, 2) : 0.0;
    }

    private function event(
        string $type,
        string $date,
        string $weekStart,
        int $minutes,
        float $amount,
        array $details,
    ): array {
        return [
            'event_type' => $type,
            'occurred_on' => $date,
            'week_start' => $weekStart,
            'minutes' => $minutes,
            'amount' => $amount,
            'details' => $details,
        ];
    }
}
