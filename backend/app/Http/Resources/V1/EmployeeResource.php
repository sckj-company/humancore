<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'employee_code' => $this->employee_code,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'email' => $this->email,
            'phone' => $this->phone,
            'alternative_phone' => $this->alternative_phone,
            'birth_date' => $this->birth_date?->format('Y-m-d'),
            'gender' => $this->gender,
            'marital_status' => $this->marital_status,
            'nationality' => $this->nationality,
            'address' => $this->address,
            'city' => $this->city,
            'state' => $this->state,
            'country' => $this->country,
            'postal_code' => $this->postal_code,
            'id_document_type' => $this->id_document_type,
            'id_document_number' => $this->id_document_number,
            'id_document_expiry' => $this->id_document_expiry?->format('Y-m-d'),
            'tax_id' => $this->tax_id,
            'social_security_id' => $this->social_security_id,
            'photo_path' => $this->photo_path,
            'status' => $this->status,
            'hired_at' => $this->hired_at?->format('Y-m-d'),
            'probation_end' => $this->probation_end?->format('Y-m-d'),
            'termination_at' => $this->termination_at?->format('Y-m-d'),
            'termination_reason' => $this->termination_reason,
            'department_id' => $this->department_id,
            'position_id' => $this->position_id,
            'manager_id' => $this->manager_id,
            'department' => $this->whenLoaded('department', fn () => [
                'id' => $this->department->id,
                'name' => $this->department->name,
            ]),
            'position' => $this->whenLoaded('position', fn () => [
                'id' => $this->position->id,
                'title' => $this->position->title,
            ]),
            'manager' => $this->whenLoaded('manager', fn () => [
                'id' => $this->manager->id,
                'full_name' => $this->manager->full_name,
            ]),
            'active_contract' => $this->whenLoaded('activeContract', fn () => $this->activeContract ? [
                'id' => $this->activeContract->id,
                'base_salary' => $this->activeContract->base_salary,
                'contract_type' => $this->activeContract->contract_type,
                'start_date' => $this->activeContract->start_date?->format('Y-m-d'),
            ] : null),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
