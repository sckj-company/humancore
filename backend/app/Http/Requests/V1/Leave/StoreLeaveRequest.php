<?php

namespace App\Http\Requests\V1\Leave;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreLeaveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'leave_type_id' => ['required', 'integer', Rule::exists('leave_types', 'id')->where('tenant_id', tenant_id())],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date', 'after_or_equal:start_date'],
            'reason' => ['nullable', 'string', 'max:1000'],
            'for_another' => ['sometimes', 'boolean'],
            'employee_id' => ['sometimes', 'nullable', 'integer', Rule::exists('employees', 'id')->where('tenant_id', tenant_id())],
            'status' => ['sometimes', 'in:pending,approved,rejected'],
        ];
    }
}
