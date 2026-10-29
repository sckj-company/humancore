<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CandidateResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'job_opening_id' => $this->job_opening_id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'location' => $this->location,
            'source' => $this->source,
            'resume_path' => $this->resume_path,
            'resume_url' => $this->resume_path ? asset('storage/'.$this->resume_path) : null,
            'cover_letter' => $this->cover_letter,
            'linkedin_url' => $this->linkedin_url,
            'years_experience' => $this->years_experience,
            'status' => $this->status,
            'status_label' => $this->status_label,
            'expected_salary' => (float) $this->expected_salary,
            'rating' => $this->rating,
            'notes' => $this->notes,
            'applied_at' => $this->applied_at?->toIso8601String(),
            'last_status_at' => $this->last_status_at?->toIso8601String(),
            'job_opening' => $this->whenLoaded('jobOpening', fn () => $this->jobOpening ? [
                'id' => $this->jobOpening->id,
                'title' => $this->jobOpening->title,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
