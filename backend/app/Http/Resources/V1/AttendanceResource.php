<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'shift_id' => $this->shift_id,
            'date' => $this->date?->format('Y-m-d'),
            'clock_in' => $this->clock_in?->format('H:i'),
            'clock_out' => $this->clock_out?->format('H:i'),
            'break_start' => $this->break_start?->format('H:i'),
            'break_end' => $this->break_end?->format('H:i'),
            'total_worked' => $this->total_worked,
            'status' => $this->status,
            'deduct_from_salary' => (bool) $this->deduct_from_salary,
            'late_minutes' => $this->late_minutes,
            'overtime_minutes' => $this->overtime_minutes,
            'overtime_amount' => $this->overtime_amount === null ? null : (float) $this->overtime_amount,
            'notes' => $this->notes,
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
            ] : null),
        ];
    }
}
