<?php

namespace App\Services\Attendance;

use App\Models\Employee;

class OvertimePayCalculator
{
    public function amount(Employee $employee, int $overtimeMinutes): ?float
    {
        if ($employee->overtime_hourly_rate === null) {
            return null;
        }

        return round((float) $employee->overtime_hourly_rate * max(0, $overtimeMinutes) / 60, 2);
    }
}
