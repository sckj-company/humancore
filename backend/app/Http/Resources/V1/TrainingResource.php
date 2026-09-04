<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TrainingResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'description' => $this->description,
            'category' => $this->category,
            'category_label' => $this->category_label,
            'duration_hours' => (int) $this->duration_hours,
            'provider' => $this->provider,
            'location' => $this->location,
            'cost' => (float) $this->cost,
            'currency' => $this->currency,
            'max_participants' => $this->max_participants ? (int) $this->max_participants : null,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'status' => $this->status,
            'status_label' => $this->status_label,
            'status_variant' => $this->status_variant,
            'notes' => $this->notes,
            'enrolled_count' => (int) ($this->enrolled_count ?? 0),
            'creator' => $this->whenLoaded('creator', fn () => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
            ] : null),
            'assignments' => TrainingAssignmentResource::collection($this->whenLoaded('assignments')),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
