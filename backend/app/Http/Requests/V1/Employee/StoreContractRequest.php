<?php

namespace App\Http\Requests\V1\Employee;

use App\Models\Employee;
use App\Models\EmployeeContract;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreContractRequest extends FormRequest
{
    public function authorize(): bool
    {
        $contract = $this->route('contract');
        if ($contract instanceof EmployeeContract) {
            return (bool) $this->user()?->can('update', $contract);
        }

        return (bool) $this->user()?->can('create', EmployeeContract::class);
    }

    public function rules(): array
    {
        $contract = $this->route('contract');
        $contract = $contract instanceof EmployeeContract ? $contract : null;
        $employee = $this->route('employee');
        $employee = $employee instanceof Employee ? $employee : null;
        $tenantId = $contract?->tenant_id ?? $employee?->tenant_id ?? tenant_id();

        $isUpdate = $contract !== null || ! $this->isMethod('POST');
        $required = $isUpdate ? ['sometimes', 'required'] : ['required'];

        $positionExists = Rule::exists('positions', 'id');
        $departmentExists = Rule::exists('departments', 'id');
        $managerExists = Rule::exists('employees', 'id');
        if ($tenantId !== null) {
            $positionExists = $positionExists->where('tenant_id', $tenantId);
            $departmentExists = $departmentExists->where('tenant_id', $tenantId);
            $managerExists = $managerExists->where('tenant_id', $tenantId);
        }

        $endDateRules = ['nullable', 'date'];
        if ($this->filled('start_date')) {
            $endDateRules[] = 'after_or_equal:start_date';
        } elseif ($contract?->start_date) {
            $endDateRules[] = 'after_or_equal:'.$contract->start_date->toDateString();
        }

        return [
            'contract_type' => [...$required, Rule::in(['permanent', 'fixed_term', 'temporary', 'probation', 'internship', 'outsourced'])],
            'base_salary' => [...$required, 'numeric', 'min:0'],
            'salary_frequency' => [...$required, Rule::in(['monthly', 'biweekly', 'weekly', 'hourly'])],
            'work_hours_per_week' => ['nullable', 'numeric', 'min:1', 'max:168'],
            'start_date' => [...$required, 'date'],
            'end_date' => $endDateRules,
            'position_id' => ['nullable', 'integer', $positionExists],
            'department_id' => ['nullable', 'integer', $departmentExists],
            'manager_id' => ['nullable', 'integer', $managerExists],
            'signed_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'is_active' => ['sometimes', 'boolean'],
            'document' => ['nullable', 'file', 'mimes:pdf,doc,docx,jpg,jpeg,png,webp', 'max:10240'],
        ];
    }
}
