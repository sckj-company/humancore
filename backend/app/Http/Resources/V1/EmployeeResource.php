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
            'photo_url' => $this->photo_path ? (str_starts_with($this->photo_path, 'http') ? $this->photo_path : url($this->photo_path)) : null,
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
            'active_contract' => ($this->relationLoaded('activeContract') || $this->relationLoaded('latestContract')) ? (($contract = $this->activeContract ?? $this->latestContract) ? [
                'id' => $contract->id,
                'employee_id' => $contract->employee_id,
                'contract_type' => $contract->contract_type,
                'base_salary' => (float) $contract->base_salary,
                'salary_frequency' => $contract->salary_frequency,
                'work_hours_per_week' => $contract->work_hours_per_week,
                'start_date' => $contract->start_date?->format('Y-m-d'),
                'end_date' => $contract->end_date?->format('Y-m-d'),
                'is_active' => (bool) $contract->is_active,
                'signed_at' => $contract->signed_at?->format('Y-m-d'),
                'document_path' => $contract->document_path,
                'document_url' => $contract->document_path ? (str_starts_with($contract->document_path, 'http') ? $contract->document_path : url($contract->document_path)) : null,
                'notes' => $contract->notes,
            ] : null) : null,
            'active_schedule' => $this->whenLoaded('activeSchedule', fn () => $this->activeSchedule ? [
                'id' => $this->activeSchedule->id,
                'shift_id' => $this->activeSchedule->shift_id,
                'effective_from' => $this->activeSchedule->effective_from?->format('Y-m-d'),
                'is_active' => $this->activeSchedule->is_active,
                'shift' => $this->activeSchedule->shift ? [
                    'id' => $this->activeSchedule->shift->id,
                    'name' => $this->activeSchedule->shift->name,
                    'code' => $this->activeSchedule->shift->code,
                    'start_time' => $this->activeSchedule->shift->start_time,
                    'end_time' => $this->activeSchedule->shift->end_time,
                    'work_hours' => $this->activeSchedule->shift->work_hours,
                    'color' => $this->activeSchedule->shift->color,
                    'is_night_shift' => $this->activeSchedule->shift->is_night_shift,
                ] : null,
            ] : null),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
