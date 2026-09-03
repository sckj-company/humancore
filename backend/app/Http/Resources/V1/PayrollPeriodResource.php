<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayrollPeriodResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'name' => $this->name,
            'period_type' => $this->period_type,
            'period_start' => $this->period_start?->format('Y-m-d'),
            'period_end' => $this->period_end?->format('Y-m-d'),
            'payment_date' => $this->payment_date?->format('Y-m-d'),
            'status' => $this->status,
            'processed_at' => $this->processed_at,
            'closed_at' => $this->closed_at,
            'employee_count' => $this->whenCounted('records'),
            'total_gross' => (float) $this->records->sum('gross_salary') ?? null,
            'total_net' => (float) $this->records->sum('net_salary') ?? null,
            'created_at' => $this->created_at,
        ];
    }
}
