<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ContractResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $isSelf = $user && (int) $user->employee_id === (int) $this->employee_id;
        $canBaseSalary = ! $user || $isSelf || $user->hasFieldPermission('contract', 'base_salary', 'view') || $user->hasFieldPermission('employee', 'salary', 'view');
        $canTerms = ! $user || $isSelf || $user->hasFieldPermission('contract', 'compensation_terms', 'view');
        $canDates = ! $user || $isSelf || $user->hasFieldPermission('contract', 'dates_notes', 'view');

        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'tenant_id' => $this->tenant_id,
            'contract_type' => $this->contract_type,
            'base_salary' => $canBaseSalary ? (float) $this->base_salary : null,
            'salary_frequency' => $canTerms ? $this->salary_frequency : null,
            'work_hours_per_week' => $canTerms ? $this->work_hours_per_week : null,
            'start_date' => $canDates ? $this->start_date?->format('Y-m-d') : null,
            'end_date' => $canDates ? $this->end_date?->format('Y-m-d') : null,
            'is_active' => $this->is_active,
            'signed_at' => $canDates ? $this->signed_at?->format('Y-m-d') : null,
            'document_path' => $canDates ? $this->document_path : null,
            'document_url' => $canDates && $this->document_path ? (str_starts_with($this->document_path, 'http') ? $this->document_path : url($this->document_path)) : null,
            'notes' => $canDates ? $this->notes : null,
            'termination_type' => $this->termination_type,
            'termination_reason' => $this->termination_reason,
            'termination_date' => $this->termination_date?->format('Y-m-d'),
            'notice_days_required' => $this->notice_days_required,
            'notice_days_served' => $this->notice_days_served,
            'unused_vacation_days' => $this->unused_vacation_days !== null ? (float) $this->unused_vacation_days : null,
            'settlement_breakdown' => $canBaseSalary ? $this->settlement_breakdown : null,
            'gross_settlement' => $canBaseSalary && $this->gross_settlement !== null ? (float) $this->gross_settlement : null,
            'total_deductions_settlement' => $canBaseSalary && $this->total_deductions_settlement !== null ? (float) $this->total_deductions_settlement : null,
            'net_settlement' => $canBaseSalary && $this->net_settlement !== null ? (float) $this->net_settlement : null,
            'terminated_at' => $this->terminated_at?->toIso8601String(),
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
