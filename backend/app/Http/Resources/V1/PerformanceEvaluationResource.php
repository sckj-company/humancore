<?php

namespace App\Http\Resources\V1;

use App\Models\PerformanceEvaluation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PerformanceEvaluationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'period' => $this->period,
            'cycle' => $this->cycle,
            'cycle_label' => PerformanceEvaluation::CYCLES[$this->cycle] ?? $this->cycle,
            'period_start' => $this->period_start?->toDateString(),
            'period_end' => $this->period_end?->toDateString(),
            'score' => (float) $this->score,
            'criteria' => $this->criteria ?? new \stdClass,
            'strengths' => $this->strengths,
            'improvements' => $this->improvements,
            'goals' => $this->goals,
            'comments' => $this->comments,
            'status' => $this->status,
            'status_label' => $this->status_label,
            'status_variant' => $this->status_variant,
            'submitted_at' => $this->submitted_at?->toIso8601String(),
            'approved_at' => $this->approved_at?->toIso8601String(),
            'employee' => $this->whenLoaded('employee', fn () => $this->employee ? [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ] : null),
            'evaluator' => $this->whenLoaded('evaluator', fn () => $this->evaluator ? [
                'id' => $this->evaluator->id,
                'name' => $this->evaluator->name,
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
