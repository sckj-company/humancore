<?php

namespace App\Http\Requests\V1\Performance;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePerformanceEvaluationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('update', $this->route('evaluation'));
    }

    public function rules(): array
    {
        return [
            'period' => ['sometimes', 'string', 'max:50'],
            'cycle' => ['sometimes', 'in:monthly,quarterly,semi_annual,annual,probation'],
            'period_start' => ['nullable', 'date'],
            'period_end' => ['nullable', 'date', 'after_or_equal:period_start'],
            'score' => ['nullable', 'numeric', 'min:0', 'max:5'],
            'criteria' => ['nullable', 'array'],
            'criteria.*' => ['numeric', 'min:0', 'max:5'],
            'strengths' => ['nullable', 'string', 'max:5000'],
            'improvements' => ['nullable', 'string', 'max:5000'],
            'goals' => ['nullable', 'string', 'max:5000'],
            'comments' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', 'in:draft,submitted'],
        ];
    }
}
