<?php

namespace App\Http\Requests\V1\Employee;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreContractRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('create_contract');
    }

    public function rules(): array
    {
        return [
            'contract_type' => ['required', Rule::in(['permanent', 'fixed_term', 'temporary', 'probation', 'internship', 'outsourced'])],
            'base_salary' => ['required', 'numeric', 'min:0'],
            'salary_frequency' => ['required', Rule::in(['monthly', 'biweekly', 'weekly', 'hourly'])],
            'work_hours_per_week' => ['nullable', 'numeric', 'min:1', 'max:168'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'position_id' => ['nullable', 'integer', Rule::exists('positions', 'id')->where('tenant_id', tenant_id())],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')->where('tenant_id', tenant_id())],
            'manager_id' => ['nullable', 'integer', Rule::exists('employees', 'id')->where('tenant_id', tenant_id())],
            'signed_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'document' => ['nullable', 'file', 'mimes:pdf,doc,docx', 'max:10240'],
        ];
    }
}
