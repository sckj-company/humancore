<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DeductionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canAmounts = ! $user || $user->hasFieldPermission('deduction', 'amounts', 'view');

        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'name' => $this->name,
            'deduction_type' => $this->deduction_type,
            'type_label' => $this->type_label,
            'amount_type' => $this->amount_type,
            'amount_type_label' => $this->amount_type_label,
            'amount' => $canAmounts ? (float) $this->amount : null,
            'percentage' => $canAmounts ? ($this->percentage ? (float) $this->percentage : null) : null,
            'amount_label' => $canAmounts ? $this->amount_label : null,
            'total_amount' => $canAmounts ? ($this->total_amount ? (float) $this->total_amount : null) : null,
            'paid_amount' => $canAmounts ? (float) $this->paid_amount : null,
            'installment_count' => $canAmounts ? ($this->installment_count ? (int) $this->installment_count : null) : null,
            'installment_amount' => $canAmounts ? ($this->installment_amount ? (float) $this->installment_amount : null) : null,
            'start_period' => $this->starts_at?->format('Y-m'),
            'requested_at' => ($this->requested_at ?? $this->created_at)?->toIso8601String(),
            'is_recurring' => (bool) $this->is_recurring,
            'is_mandatory' => (bool) $this->is_mandatory,
            'legal_basis' => $this->legal_basis,
            'has_signed_document' => filled($this->signed_document_path),
            'signed_document_url' => $this->signed_document_path && str_starts_with($this->signed_document_path, 'http')
                ? $this->signed_document_path
                : null,
            'signed_document_uploaded_at' => $this->signed_document_uploaded_at?->toIso8601String(),
            'status' => $this->status,
            'status_label' => $this->status_label,
            'status_variant' => $this->status_variant,
            'progress_label' => $canAmounts ? $this->progress_label : null,
            'approved_by' => $this->approved_by,
            'approved_at' => $this->approved_at?->toIso8601String(),
            'notes' => $this->notes,
            'cancellation_reason' => $this->cancellation_reason,
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'cancelled_by' => $this->cancelled_by,
            'deletion_reason' => $this->deletion_reason,
            'employee' => $this->whenLoaded('employee', fn () => $this->employee ? [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ] : null),
            'approver' => $this->whenLoaded('approver', fn () => $this->approver ? [
                'id' => $this->approver->id,
                'name' => $this->approver->name,
            ] : null),
            'installments' => $this->whenLoaded('installments', function () use ($canAmounts) {
                return $this->installments->map(fn ($item) => [
                    'id' => $item->id,
                    'installment_number' => (int) $item->installment_number,
                    'reference_month' => $item->reference_month,
                    'percentage' => $canAmounts ? (float) $item->percentage : null,
                    'amount' => $canAmounts ? (float) $item->amount : null,
                    'status' => $item->status,
                    'status_label' => \App\Models\DeductionInstallment::STATUSES[$item->status] ?? $item->status,
                    'payroll_period_id' => $item->payroll_period_id,
                    'payroll_period_name' => $item->relationLoaded('payrollPeriod') ? $item->payrollPeriod?->name : null,
                    'paid_at' => $item->paid_at?->toIso8601String(),
                ])->values();
            }),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
