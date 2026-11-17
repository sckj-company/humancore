<?php

namespace App\Services\Attendance;

use App\Models\Shift;
use Carbon\Carbon;

class WorkedHoursCalculator
{
    public function workedMinutes(
        Carbon $clockIn,
        Carbon $clockOut,
        ?Shift $shift = null,
        ?Carbon $breakStart = null,
        ?Carbon $breakEnd = null,
    ): int {
        $end = $clockOut->copy();
        if ($end->lessThanOrEqualTo($clockIn) && ($shift?->is_night_shift || ($shift?->start_time && $shift->end_time <= $shift->start_time))) {
            $end->addDay();
        }

        $grossMinutes = max(0, (int) $clockIn->diffInMinutes($end));
        if ($grossMinutes === 0) {
            return 0;
        }

        if ($breakStart !== null && $breakEnd !== null && $breakEnd->greaterThan($breakStart)) {
            $breakMinutes = (int) $breakStart->diffInMinutes($breakEnd);
        } else {
            $breakMinutes = max(0, (int) ($shift?->break_minutes ?? 0));
        }

        return max(0, $grossMinutes - $breakMinutes);
    }
}
