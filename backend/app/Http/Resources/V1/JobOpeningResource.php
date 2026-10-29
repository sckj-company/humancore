<?php

namespace App\Http\Resources\V1;

use App\Models\JobOpening;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class JobOpeningResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'description' => $this->description,
            'requirements' => $this->requirements,
            'location' => $this->location,
            'employment_type' => $this->employment_type,
            'employment_type_label' => JobOpening::EMPLOYMENT_TYPES[$this->employment_type] ?? $this->employment_type,
            'experience_level' => $this->experience_level,
            'experience_level_label' => JobOpening::EXPERIENCE_LEVELS[$this->experience_level] ?? $this->experience_level,
            'salary_min' => (float) $this->salary_min,
            'salary_max' => (float) $this->salary_max,
            'salary_range' => $this->salary_range,
            'currency' => $this->currency,
            'openings_count' => (int) $this->openings_count,
            'status' => $this->status,
            'status_label' => $this->status_label,
            'status_variant' => $this->status_variant,
            'published_at' => $this->published_at?->toDateString(),
            'closes_at' => $this->closes_at?->toDateString(),
            'closed_at' => $this->closed_at?->toDateString(),
            'notes' => $this->notes,
            'candidates_count' => $this->whenCounted('candidates'),
            'department' => $this->whenLoaded('department', fn () => $this->department ? [
                'id' => $this->department->id,
                'name' => $this->department->name,
            ] : null),
            'position' => $this->whenLoaded('position', fn () => $this->position ? [
                'id' => $this->position->id,
                'title' => $this->position->title,
            ] : null),
            'created_by' => $this->whenLoaded('createdBy', fn () => $this->createdBy ? [
                'id' => $this->createdBy->id,
                'name' => $this->createdBy->name,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
