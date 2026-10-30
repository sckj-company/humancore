<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContractResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'tenant_id' => $this->tenant_id,
            'contract_type' => $this->contract_type,
            'base_salary' => (float) $this->base_salary,
            'salary_frequency' => $this->salary_frequency,
            'work_hours_per_week' => $this->work_hours_per_week,
            'start_date' => $this->start_date?->format('Y-m-d'),
            'end_date' => $this->end_date?->format('Y-m-d'),
            'is_active' => $this->is_active,
            'signed_at' => $this->signed_at?->format('Y-m-d'),
            'document_path' => $this->document_path,
            'document_url' => $this->document_path ? (str_starts_with($this->document_path, 'http') ? $this->document_path : url($this->document_path)) : null,
            'notes' => $this->notes,
            'position_id' => $this->position_id,
            'department_id' => $this->department_id,
            'manager_id' => $this->manager_id,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ]),
            'position' => $this->whenLoaded('position', fn () => [
                'id' => $this->position->id,
                'title' => $this->position->title,
            ]),
            'department' => $this->whenLoaded('department', fn () => [
                'id' => $this->department->id,
                'name' => $this->department->name,
            ]),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
