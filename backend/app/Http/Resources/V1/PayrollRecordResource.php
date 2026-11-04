<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayrollRecordResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'payroll_period_id' => $this->payroll_period_id,
            'base_salary' => (float) $this->base_salary,
            'gross_salary' => (float) $this->gross_salary,
            'total_earnings' => (float) $this->total_earnings,
            'total_deductions' => (float) $this->total_deductions,
            'total_taxes' => (float) $this->total_taxes,
            'net_salary' => (float) $this->net_salary,
            'inss_base' => (float) ($this->inss_base ?? 0),
            'employer_inss_base' => (float) ($this->employer_inss_base ?? 0),
            'employer_inss' => (float) ($this->employer_inss ?? 0),
            'irt_taxable_base' => (float) ($this->irt_taxable_base ?? 0),
            'employer_cost' => (float) ($this->employer_cost ?? 0),
            'currency' => $this->currency ?? 'AOA',
            'work_days' => $this->work_days,
            'absent_days' => $this->absent_days,
            'overtime_hours' => (float) $this->overtime_hours,
            'overtime_amount' => (float) $this->overtime_amount,
            'status' => $this->status,
            'approved_at' => $this->approved_at,
            'paid_at' => $this->paid_at,
            'details' => $this->details,
            'validation_errors' => $this->validation_errors,
            'snapshot' => $this->snapshot,
            'items' => $this->whenLoaded('items'),
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ]),
        ];
    }
}
