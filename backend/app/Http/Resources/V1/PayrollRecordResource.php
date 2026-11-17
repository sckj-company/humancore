<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayrollRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canView = fn (string $field): bool => ! $user || $user->hasFieldPermission('payroll', $field, 'view');

        $canBaseSalary = $canView('base_salary');
        $canGross = $canView('gross_salary');
        $canAllowances = $canView('allowances');
        $canInss = $canView('inss');
        $canIrt = $canView('irt');
        $canDeductions = $canView('deductions');
        $canNet = $canView('net_salary');
        $canEmployerCost = $canView('employer_cost');
        $canAttendance = $canView('attendance_metrics');

        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'payroll_period_id' => $this->payroll_period_id,
            'period_name' => $this->whenLoaded('period', fn () => $this->period?->displayName()),
            'base_salary' => $canBaseSalary ? (float) $this->base_salary : null,
            'gross_salary' => $canGross ? (float) $this->gross_salary : null,
            'total_earnings' => $canAllowances ? (float) $this->total_earnings : null,
            'total_deductions' => $canDeductions ? (float) $this->total_deductions : null,
            'total_taxes' => $canIrt ? (float) $this->total_taxes : null,
            'net_salary' => $canNet ? (float) $this->net_salary : null,
            'inss_base' => $canInss ? (float) ($this->inss_base ?? 0) : null,
            'employer_inss_base' => $canInss ? (float) ($this->employer_inss_base ?? 0) : null,
            'employer_inss' => $canInss ? (float) ($this->employer_inss ?? 0) : null,
            'irt_taxable_base' => $canIrt ? (float) ($this->irt_taxable_base ?? 0) : null,
            'employer_cost' => $canEmployerCost ? (float) ($this->employer_cost ?? 0) : null,
            'currency' => $this->currency ?? 'AOA',
            'work_days' => $canAttendance ? $this->work_days : null,
            'absent_days' => $canAttendance ? $this->absent_days : null,
            'overtime_hours' => $canAttendance ? (float) $this->overtime_hours : null,
            'overtime_amount' => $canAttendance ? (float) $this->overtime_amount : null,
            'status' => $this->status,
            'is_outdated' => (bool) $this->is_outdated,
            'outdated_reason' => $this->outdated_reason,
            'approved_at' => $this->approved_at,
            'paid_at' => $this->paid_at,
            'details' => $this->filterDetails(
                $this->details,
                $canBaseSalary,
                $canAllowances,
                $canInss,
                $canIrt,
                $canDeductions,
                $canAttendance,
            ),
            'manual_adjustments' => $this->manual_adjustments,
            'validation_errors' => $this->validation_errors,
            'snapshot' => $this->snapshot,
            'items' => $this->whenLoaded('items', function () use (
                $canBaseSalary,
                $canAllowances,
                $canInss,
                $canIrt,
                $canDeductions,
                $canEmployerCost,
            ) {
                return $this->items->filter(function ($item) use (
                    $canBaseSalary,
                    $canAllowances,
                    $canInss,
                    $canIrt,
                    $canDeductions,
                    $canEmployerCost,
                ) {
                    $code = (string) ($item->code ?? '');
                    $type = (string) ($item->type ?? '');

                    if ($code === 'base_salary') {
                        return $canBaseSalary;
                    }
                    if ($code === 'inss') {
                        return $canInss;
                    }
                    if ($code === 'employer_inss') {
                        return $canInss || $canEmployerCost;
                    }
                    if ($code === 'irt') {
                        return $canIrt;
                    }
                    if ($type === 'earning' || $type === 'benefit') {
                        return $canAllowances;
                    }
                    if ($type === 'deduction') {
                        return $canDeductions;
                    }
                    if ($type === 'tax') {
                        return $canIrt;
                    }
                    if (in_array($type, ['employer_contribution', 'employer_cost'], true)) {
                        return $canEmployerCost;
                    }

                    return true;
                })->values();
            }),
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ]),
        ];
    }

    private function filterDetails(
        mixed $details,
        bool $canBaseSalary,
        bool $canAllowances,
        bool $canInss,
        bool $canIrt,
        bool $canDeductions,
        bool $canAttendance,
    ): mixed {
        if (! is_array($details)) {
            return $details;
        }

        if (! $canAttendance) {
            unset($details['late_minutes'], $details['overtime_hours'], $details['work_days'], $details['absent_days']);
        }

        if (isset($details['breakdown']) && is_array($details['breakdown'])) {
            $details['breakdown'] = array_values(array_filter($details['breakdown'], function ($entry) use (
                $canBaseSalary,
                $canAllowances,
                $canInss,
                $canIrt,
                $canDeductions,
            ) {
                $code = (string) ($entry['code'] ?? '');
                $type = (string) ($entry['type'] ?? '');

                if ($code === 'base_salary') {
                    return $canBaseSalary;
                }
                if ($code === 'inss') {
                    return $canInss;
                }
                if ($code === 'irt') {
                    return $canIrt;
                }
                if ($type === 'earning' || $type === 'benefit') {
                    return $canAllowances;
                }
                if ($type === 'deduction') {
                    return $canDeductions;
                }

                return true;
            }));
        }

        return $details;
    }
}
