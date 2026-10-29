<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BenefitResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'name' => $this->name,
            'benefit_type' => $this->benefit_type,
            'type_label' => $this->type_label,
            'amount_type' => $this->amount_type,
            'amount_type_label' => $this->amount_type_label,
            'amount' => (float) $this->amount,
            'percentage' => $this->percentage ? (float) $this->percentage : null,
            'amount_label' => $this->amount_label,
            'is_taxable' => (bool) $this->is_taxable,
            'provider' => $this->provider,
            'start_date' => $this->start_date?->toDateString(),
            'end_date' => $this->end_date?->toDateString(),
            'status' => $this->status,
            'status_label' => $this->status_label,
            'status_variant' => $this->status_variant,
            'is_current' => $this->is_current,
            'notes' => $this->notes,
            'employee' => $this->whenLoaded('employee', fn () => $this->employee ? [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
