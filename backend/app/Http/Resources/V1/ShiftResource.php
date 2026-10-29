<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ShiftResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'code' => $this->code,
            'start_time' => $this->start_time,
            'end_time' => $this->end_time,
            'break_minutes' => $this->break_minutes,
            'work_hours' => (float) $this->work_hours,
            'late_tolerance_minutes' => $this->late_tolerance_minutes,
            'working_days' => $this->working_days ?? [],
            'color' => $this->color,
            'is_night_shift' => $this->is_night_shift,
            'is_active' => $this->is_active,
            'notes' => $this->notes,
            'created_at' => $this->created_at?->toDateTimeString(),
            'updated_at' => $this->updated_at?->toDateTimeString(),
        ];
    }
}
