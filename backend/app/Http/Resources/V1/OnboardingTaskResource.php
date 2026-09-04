<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class OnboardingTaskResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'template_id' => $this->template_id,
            'employee_id' => $this->employee_id,
            'assignee_id' => $this->assignee_id,
            'title' => $this->title,
            'description' => $this->description,
            'due_days' => (int) $this->due_days,
            'due_date' => $this->due_date?->toDateString(),
            'sort_order' => (int) $this->sort_order,
            'status' => $this->status,
            'status_label' => $this->status_label,
            'status_variant' => $this->status_variant,
            'completed_at' => $this->completed_at?->toIso8601String(),
            'notes' => $this->notes,
            'employee' => $this->whenLoaded('employee', fn () => $this->employee ? [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ] : null),
            'assignee' => $this->whenLoaded('assignee', fn () => $this->assignee ? [
                'id' => $this->assignee->id,
                'name' => $this->assignee->name,
            ] : null),
            'completer' => $this->whenLoaded('completer', fn () => $this->completer ? [
                'id' => $this->completer->id,
                'name' => $this->completer->name,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
