<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $isSelf = $user && (int) $user->employee_id === (int) $this->employee_id;
        $canClock = ! $user || $isSelf || $user->hasFieldPermission('attendance', 'clock_times', 'view');
        $canOvertime = ! $user || $isSelf || $user->hasFieldPermission('attendance', 'overtime_lateness', 'view');
        $canDeduction = ! $user || $isSelf || $user->hasFieldPermission('attendance', 'salary_deduction', 'view');

        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'shift_id' => $this->shift_id,
            'date' => $this->date?->format('Y-m-d'),
            'clock_in' => $canClock ? $this->clock_in?->format('H:i') : null,
            'clock_out' => $canClock ? $this->clock_out?->format('H:i') : null,
            'break_start' => $canClock ? $this->break_start?->format('H:i') : null,
            'break_end' => $canClock ? $this->break_end?->format('H:i') : null,
            'total_worked' => $canClock ? $this->total_worked : null,
            'status' => $this->status,
            'deduct_from_salary' => $canDeduction ? (bool) $this->deduct_from_salary : null,
            'late_minutes' => $canOvertime ? $this->late_minutes : null,
            'overtime_minutes' => $canOvertime ? $this->overtime_minutes : null,
            'overtime_amount' => $canOvertime ? ($this->overtime_amount === null ? null : (float) $this->overtime_amount) : null,
            'normal_hours' => $canClock ? ($this->shift && $this->shift->work_hours !== null
                ? (float) $this->shift->work_hours
                : 8.0) : null,
            'notes' => $canDeduction ? $this->notes : null,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ]),
            'shift' => $this->whenLoaded('shift', fn () => $this->shift ? [
                'id' => $this->shift->id,
                'name' => $this->shift->name,
                'start_time' => $this->shift->start_time,
                'end_time' => $this->shift->end_time,
                'work_hours' => $this->shift->work_hours !== null ? (float) $this->shift->work_hours : 8.0,
            ] : null),
        ];
    }
}
