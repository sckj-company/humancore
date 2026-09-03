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
            'work_days' => $this->work_days,
            'absent_days' => $this->absent_days,
            'overtime_hours' => (float) $this->overtime_hours,
            'overtime_amount' => (float) $this->overtime_amount,
            'status' => $this->status,
            'approved_at' => $this->approved_at,
            'paid_at' => $this->paid_at,
            'details' => $this->details,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ]),
        ];
    }
}
