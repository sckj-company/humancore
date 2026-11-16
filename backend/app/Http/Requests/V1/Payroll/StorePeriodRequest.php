<?php

namespace App\Http\Requests\V1\Payroll;

use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

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

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $start = $this->input('period_start');
            $end = $this->input('period_end');
            $type = $this->input('period_type');

            if (! $start || ! $end || ! $type) {
                return;
            }

            try {
                $days = Carbon::parse($start)->diffInDays(Carbon::parse($end)) + 1;
            } catch (\Throwable) {
                return;
            }

            $maxDays = match ($type) {
                'weekly' => 7,
                'biweekly' => 16,
                default => 31,
            };

            if ($days > $maxDays) {
                $validator->errors()->add(
                    'period_end',
                    "O intervalo selecionado ({$days} dias) excede o máximo permitido de {$maxDays} dias para este tipo de período."
                );
            }
        });
    }
}
