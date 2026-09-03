<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_code' => $this->employee_code,
            'full_name' => $this->full_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'photo_path' => $this->photo_path,
            'status' => $this->status,
            'hired_at' => $this->hired_at?->format('Y-m-d'),
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'position' => $this->whenLoaded('position', fn () => $this->position?->title),
            'active_contract' => $this->whenLoaded('activeContract', fn () => $this->activeContract ? [
                'base_salary' => $this->activeContract->base_salary,
                'contract_type' => $this->activeContract->contract_type,
            ] : null),
        ];
    }
}
