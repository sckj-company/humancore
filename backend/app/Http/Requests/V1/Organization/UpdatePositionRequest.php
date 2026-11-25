<?php

namespace App\Http\Requests\V1\Organization;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePositionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:50'],
            'department_id' => ['nullable', 'integer', Rule::exists('departments', 'id')->where('tenant_id', tenant_id())],
            'parent_id' => ['nullable', 'integer', Rule::exists('positions', 'id')->where('tenant_id', tenant_id())],
            'level' => ['nullable', 'integer', 'min:1', 'max:20'],
            'description' => ['nullable', 'string'],
            'requirements' => ['nullable', 'string'],
            'salary_min' => ['nullable', 'numeric', 'min:0'],
            'salary_max' => ['nullable', 'numeric', 'min:0', 'gte:salary_min'],
            'is_management' => ['nullable', 'boolean'],
            'cascade_levels' => ['sometimes', 'boolean'],
        ];
    }
}
