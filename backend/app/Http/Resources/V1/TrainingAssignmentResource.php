<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TrainingAssignmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'training_id' => $this->training_id,
            'employee_id' => $this->employee_id,
            'status' => $this->status,
            'status_label' => $this->status_label,
            'status_variant' => $this->status_variant,
            'enrolled_at' => $this->enrolled_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'score' => (float) $this->score,
            'notes' => $this->notes,
            'employee' => $this->whenLoaded('employee', fn () => $this->employee ? [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ] : null),
            'training' => $this->whenLoaded('training', fn () => $this->training ? [
                'id' => $this->training->id,
                'title' => $this->training->title,
            ] : null),
            'completer' => $this->whenLoaded('completer', fn () => $this->completer ? [
                'id' => $this->completer->id,
                'name' => $this->completer->name,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
