<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $isSelf = $user && (int) $user->employee_id === (int) $this->id;

        $canIdentity = ! $user || $isSelf || $user->hasFieldPermission('employee', 'personal_identity', 'view');
        $canFiscal = ! $user || $isSelf || $user->hasFieldPermission('employee', 'fiscal_ids', 'view');
        $canContact = ! $user || $isSelf || $user->hasFieldPermission('employee', 'contact_address', 'view');
        $canOrg = ! $user || $isSelf || $user->hasFieldPermission('employee', 'organization', 'view');
        $canSalary = ! $user || $isSelf || $user->hasFieldPermission('employee', 'salary', 'view') || $user->hasFieldPermission('contract', 'base_salary', 'view');
        $canContractTerms = ! $user || $isSelf || $user->hasFieldPermission('contract', 'compensation_terms', 'view');
        $canContractDates = ! $user || $isSelf || $user->hasFieldPermission('contract', 'dates_notes', 'view');

        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'employee_code' => $this->employee_code,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'full_name' => $this->full_name,
            'email' => $canContact ? $this->email : null,
            'phone' => $canContact ? $this->phone : null,
            'alternative_phone' => $canContact ? $this->alternative_phone : null,
            'birth_date' => $canIdentity ? $this->birth_date?->format('Y-m-d') : null,
            'gender' => $canIdentity ? $this->gender : null,
            'marital_status' => $canIdentity ? $this->marital_status : null,
            'nationality' => $canIdentity ? $this->nationality : null,
            'address' => $canContact ? $this->address : null,
            'city' => $canContact ? $this->city : null,
            'state' => $canContact ? $this->state : null,
            'country' => $canContact ? $this->country : null,
            'postal_code' => $canContact ? $this->postal_code : null,
            'id_document_type' => $canIdentity ? $this->id_document_type : null,
            'id_document_number' => $canIdentity ? $this->id_document_number : null,
            'id_document_expiry' => $canIdentity ? $this->id_document_expiry?->format('Y-m-d') : null,
            'tax_id' => $canFiscal ? $this->tax_id : null,
            'social_security_id' => $canFiscal ? $this->social_security_id : null,
            'overtime_hourly_rate' => $canSalary ? ($this->overtime_hourly_rate === null ? null : (float) $this->overtime_hourly_rate) : null,
            'photo_path' => $this->photo_path,
            'photo_url' => $this->photo_path ? (str_starts_with($this->photo_path, 'http') ? $this->photo_path : url($this->photo_path)) : null,
            'status' => $this->status,
            'hired_at' => $canOrg ? $this->hired_at?->format('Y-m-d') : null,
            'probation_end' => $canOrg ? $this->probation_end?->format('Y-m-d') : null,
            'termination_at' => $canOrg ? $this->termination_at?->format('Y-m-d') : null,
            'termination_reason' => $canOrg ? $this->termination_reason : null,
            'department_id' => $canOrg ? $this->department_id : null,
            'position_id' => $canOrg ? $this->position_id : null,
            'manager_id' => $canOrg ? $this->manager_id : null,
            'department' => $canOrg ? $this->whenLoaded('department', fn () => [
                'id' => $this->department->id,
                'name' => $this->department->name,
            ]) : null,
            'position' => $canOrg ? $this->whenLoaded('position', fn () => [
                'id' => $this->position->id,
                'title' => $this->position->title,
            ]) : null,
            'manager' => $canOrg ? $this->whenLoaded('manager', fn () => [
                'id' => $this->manager->id,
                'full_name' => $this->manager->full_name,
            ]) : null,
            'active_contract' => ($this->relationLoaded('activeContract') || $this->relationLoaded('latestContract')) ? (($contract = $this->activeContract ?? $this->latestContract) ? [
                'id' => $contract->id,
                'employee_id' => $contract->employee_id,
                'contract_type' => $contract->contract_type,
                'base_salary' => $canSalary ? (float) $contract->base_salary : null,
                'salary_frequency' => $canContractTerms ? $contract->salary_frequency : null,
                'work_hours_per_week' => $canContractTerms ? $contract->work_hours_per_week : null,
                'position_id' => $contract->position_id,
                'department_id' => $contract->department_id,
                'manager_id' => $contract->manager_id,
                'start_date' => $canContractDates ? $contract->start_date?->format('Y-m-d') : null,
                'end_date' => $canContractDates ? $contract->end_date?->format('Y-m-d') : null,
                'is_active' => (bool) $contract->is_active,
                'signed_at' => $canContractDates ? $contract->signed_at?->format('Y-m-d') : null,
                'document_path' => $canContractDates ? $contract->document_path : null,
                'document_url' => $canContractDates && $contract->document_path ? (str_starts_with($contract->document_path, 'http') ? $contract->document_path : url($contract->document_path)) : null,
                'notes' => $canContractDates ? $contract->notes : null,
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
