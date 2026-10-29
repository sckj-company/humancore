<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DeductionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'name' => $this->name,
            'deduction_type' => $this->deduction_type,
            'type_label' => $this->type_label,
            'amount_type' => $this->amount_type,
            'amount_type_label' => $this->amount_type_label,
            'amount' => (float) $this->amount,
            'percentage' => $this->percentage ? (float) $this->percentage : null,
            'amount_label' => $this->amount_label,
            'total_amount' => $this->total_amount ? (float) $this->total_amount : null,
            'paid_amount' => (float) $this->paid_amount,
            'installment_count' => $this->installment_count ? (int) $this->installment_count : null,
            'installment_amount' => $this->installment_amount ? (float) $this->installment_amount : null,
            'is_recurring' => (bool) $this->is_recurring,
            'status' => $this->status,
            'status_label' => $this->status_label,
            'status_variant' => $this->status_variant,
            'progress_label' => $this->progress_label,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at?->toIso8601String(),
            'notes' => $this->notes,
            'employee' => $this->whenLoaded('employee', fn () => $this->employee ? [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ] : null),
            'approver' => $this->whenLoaded('approver', fn () => $this->approver ? [
                'id' => $this->approver->id,
                'name' => $this->approver->name,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
