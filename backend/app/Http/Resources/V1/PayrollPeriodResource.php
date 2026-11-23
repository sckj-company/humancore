<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayrollPeriodResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canGross = ! $user || $user->hasFieldPermission('payroll', 'gross_salary', 'view');
        $canNet = ! $user || $user->hasFieldPermission('payroll', 'net_salary', 'view');

        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'name' => $this->displayName(),
            'period_type' => $this->period_type,
            'period_start' => $this->period_start?->format('Y-m-d'),
            'period_end' => $this->period_end?->format('Y-m-d'),
            'payment_date' => $this->payment_date?->format('Y-m-d'),
            'status' => $this->status,
            'processed_at' => $this->processed_at,
            'processed_by' => $this->processed_by,
            'processed_by_user' => $this->whenLoaded('processedBy', fn () => $this->processedBy ? [
                'id' => $this->processedBy->id,
                'name' => $this->processedBy->name,
            ] : null),
            'approved_at' => $this->approved_at,
            'approved_by' => $this->approved_by,
            'approved_by_user' => $this->whenLoaded('approvedBy', fn () => $this->approvedBy ? [
                'id' => $this->approvedBy->id,
                'name' => $this->approvedBy->name,
            ] : null),
            'closed_at' => $this->closed_at,
            'rejection_reason' => $this->rejection_reason,
            'totals_snapshot' => ($canGross || $canNet) ? $this->totals_snapshot : null,
            'progress_total' => $this->progress_total,
            'progress_done' => $this->progress_done,
            'progress_message' => $this->progress_message,
            'employee_count' => $this->whenCounted('records'),
            'total_gross' => $canGross ? ($this->records_sum_gross_salary !== null
                ? (float) $this->records_sum_gross_salary
                : ($this->relationLoaded('records') ? (float) $this->records->sum('gross_salary') : null)) : null,
            'total_net' => $canNet ? ($this->records_sum_net_salary !== null
                ? (float) $this->records_sum_net_salary
                : ($this->relationLoaded('records') ? (float) $this->records->sum('net_salary') : null)) : null,
            'records' => PayrollRecordResource::collection($this->whenLoaded('records')),
            'events' => $this->whenLoaded('events'),
            'is_reportable' => $this->isReportable(),
            'report' => $this->whenLoaded('report', fn () => $this->report ? new PayrollPeriodReportResource($this->report) : null),
            'created_at' => $this->created_at,
        ];
    }
}
