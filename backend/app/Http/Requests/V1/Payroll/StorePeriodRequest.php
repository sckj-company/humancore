<?php

namespace App\Http\Requests\V1\Payroll;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePeriodRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('create_payroll');
    }

    public function rules(): array
    {
        return [
            'name' => ['nullable', 'string', 'max:255'],
            'period_type' => ['required', Rule::in(['monthly', 'biweekly', 'weekly'])],
            'period_start' => ['required', 'date'],
            'period_end' => ['required', 'date', 'after_or_equal:period_start'],
            'payment_date' => ['nullable', 'date'],
        ];
    }
}
