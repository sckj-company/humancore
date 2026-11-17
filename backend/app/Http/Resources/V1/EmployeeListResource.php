<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeListResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $isSelf = $user && (int) $user->employee_id === (int) $this->id;
        $canSalary = ! $user || $isSelf || $user->hasFieldPermission('employee', 'salary', 'view') || $user->hasFieldPermission('contract', 'base_salary', 'view');
        $canContact = ! $user || $isSelf || $user->hasFieldPermission('employee', 'contact_address', 'view');
        $canOrg = ! $user || $isSelf || $user->hasFieldPermission('employee', 'organization', 'view');

        return [
            'id' => $this->id,
            'employee_code' => $this->employee_code,
            'full_name' => $this->full_name,
            'email' => $canContact ? $this->email : null,
            'phone' => $canContact ? $this->phone : null,
            'photo_path' => $this->photo_path,
            'status' => $this->status,
            'approval_status' => $this->approval_status ?? 'approved',
            'approved_at' => $this->approved_at?->toIso8601String(),
            'hired_at' => $canOrg ? $this->hired_at?->format('Y-m-d') : null,
            'department' => $canOrg ? $this->whenLoaded('department', fn () => $this->department?->name) : null,
            'position' => $canOrg ? $this->whenLoaded('position', fn () => $this->position?->title) : null,
            'active_contract' => $this->whenLoaded('activeContract', fn () => $this->activeContract ? [
                'base_salary' => $canSalary ? $this->activeContract->base_salary : null,
                'contract_type' => $this->activeContract->contract_type,
                'end_date' => $this->activeContract->end_date?->format('Y-m-d'),
                'is_active' => $this->activeContract->is_active,
            ] : null),
            'is_contract_expired' => $this->when(
                $this->relationLoaded('activeContract') || $this->relationLoaded('latestContract'),
                fn () => $this->isContractExpired(),
            ),
        ];
    }

    protected function isContractExpired(): bool
    {
        if ($this->status !== 'active') {
            return false;
        }

        $contract = $this->activeContract ?? $this->latestContract;

        return $contract !== null
            && $contract->end_date !== null
            && $contract->end_date->lt(today());
    }
}
