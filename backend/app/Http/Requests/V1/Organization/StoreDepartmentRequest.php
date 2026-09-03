<?php

namespace App\Http\Requests\V1\Organization;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreDepartmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'branch_id' => ['nullable', 'integer', Rule::exists('branches', 'id')],
            'parent_id' => ['nullable', 'integer', Rule::exists('departments', 'id')],
            'manager_id' => ['nullable', 'integer', Rule::exists('employees', 'id')],
            'cost_center' => ['nullable', 'string', 'max:50'],
            'description' => ['nullable', 'string'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'O nome é obrigatório.',
        ];
    }
}
