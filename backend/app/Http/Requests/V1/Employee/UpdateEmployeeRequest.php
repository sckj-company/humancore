<?php

namespace App\Http\Requests\V1\Employee;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateEmployeeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update_employee');
    }

    public function rules(): array
    {
        return [
            'first_name' => ['sometimes', 'string', 'max:150'],
            'last_name' => ['sometimes', 'string', 'max:150'],
            'employee_code' => ['sometimes', 'string', 'max:50'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('employees', 'email')->ignore($this->employee)->whereNull('deleted_at')],
            'phone' => ['nullable', 'string', 'max:50'],
            'alternative_phone' => ['nullable', 'string', 'max:50'],
            'birth_date' => ['nullable', 'date', 'before:today'],
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'marital_status' => ['nullable', Rule::in(['single', 'married', 'divorced', 'widowed'])],
            'nationality' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:150'],
            'state' => ['nullable', 'string', 'max:100'],
            'country' => ['nullable', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:20'],
            'id_document_type' => ['nullable', 'string', 'max:50'],
            'id_document_number' => ['nullable', 'string', 'max:100'],
            'id_document_expiry' => ['nullable', 'date'],
            'tax_id' => ['nullable', 'string', 'max:100'],
            'social_security_id' => ['nullable', 'string', 'max:100'],
            'photo' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'],
            'status' => ['sometimes', Rule::in(['active', 'inactive', 'suspended', 'terminated'])],
            'hired_at' => ['nullable', 'date'],
            'probation_end' => ['nullable', 'date', 'after_or_equal:hired_at'],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')],
            'position_id' => ['nullable', 'integer', Rule::exists('positions', 'id')],
            'manager_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
        ];
    }
}
