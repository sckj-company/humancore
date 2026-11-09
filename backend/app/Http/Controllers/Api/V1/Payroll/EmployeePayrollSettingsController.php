<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Employee;
use App\Models\EmployeeSalaryComponent;
use App\Models\PayrollRecordItem;
use App\Models\SalaryComponent;
use App\Models\Setting;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EmployeePayrollSettingsController extends BaseController
{
    private const ALLOWANCES = [
        'meal' => [
            'code' => 'meal_allowance',
            'name' => 'Subsídio de Alimentação',
            'period' => 'daily',
        ],
        'transport' => [
            'code' => 'transport_allowance',
            'name' => 'Subsídio de Transporte',
            'period' => 'daily',
        ],
        'vacation' => [
            'code' => 'vacation_subsidy',
            'name' => 'Subsídio de Férias',
            'period' => 'fixed',
        ],
        'christmas' => [
            'code' => 'christmas_subsidy',
            'name' => 'Subsídio de Natal',
            'period' => 'fixed',
        ],
        'family' => [
            'code' => 'family_allowance',
            'name' => 'Abono de Família',
            'period' => 'fixed',
        ],
        'additional' => [
            'code' => 'additional_allowance',
            'name' => 'Abono Adicional',
            'period' => 'fixed',
        ],
    ];

    public function show(Request $request, Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        $validated = $request->validate([
            'period' => ['sometimes', 'date_format:Y-m'],
        ]);

        return $this->success($this->settingsFor($employee, $validated['period'] ?? null));
    }

    public function update(Request $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $validated = $request->validate([
            'allowances' => ['required', 'array'],
            'allowances.meal.amount' => ['required', 'numeric', 'min:0'],
            'allowances.meal.period' => ['required', 'in:daily,weekly,fixed'],
            'allowances.transport.amount' => ['required', 'numeric', 'min:0'],
            'allowances.transport.period' => ['required', 'in:daily,weekly,fixed'],
            'allowances.vacation.amount' => ['sometimes', 'required', 'numeric', 'min:0'],
            'allowances.christmas.amount' => ['sometimes', 'required', 'numeric', 'min:0'],
            'allowances.family.amount' => ['sometimes', 'required', 'numeric', 'min:0'],
            'allowances.additional.amount' => ['sometimes', 'required', 'numeric', 'min:0'],
        ]);

        $contract = $employee->activeContract()->first();
        if (! $contract) {
            return $this->error('O funcionário não possui contrato ativo para configurar remunerações.', 422);
        }

        DB::transaction(function () use ($employee, $contract, $validated): void {
            foreach (self::ALLOWANCES as $key => $definition) {
                if (! array_key_exists($key, $validated['allowances'])) {
                    continue;
                }

                $component = SalaryComponent::query()->firstOrCreate(
                    [
                        'tenant_id' => $employee->tenant_id,
                        'code' => $definition['code'],
                    ],
                    [
                        'name' => $definition['name'],
                        'type' => 'benefit',
                        'calculation_type' => 'fixed',
                        'default_value' => 0,
                        'is_taxable' => false,
                        'is_mandatory' => false,
                        'is_active' => true,
                    ],
                );
                if (! $component->is_active) {
                    $component->update(['is_active' => true]);
                }

                EmployeeSalaryComponent::query()->updateOrCreate(
                    [
                        'employee_id' => $employee->id,
                        'contract_id' => $contract->id,
                        'salary_component_id' => $component->id,
                    ],
                    [
                        'tenant_id' => $employee->tenant_id,
                        'custom_value' => $validated['allowances'][$key]['amount'],
                        'calculation_period' => $validated['allowances'][$key]['period'] ?? $definition['period'],
                        'start_date' => $contract->start_date,
                        'end_date' => $contract->end_date,
                        'is_active' => true,
                    ],
                );
            }
        });

        return $this->success($this->settingsFor($employee), 'Subsídios do funcionário atualizados.');
    }

    private function settingsFor(Employee $employee, ?string $month = null): array
    {
        $monthStart = Carbon::createFromFormat('Y-m', $month ?? now()->format('Y-m'))->startOfMonth();
        $monthEnd = $monthStart->copy()->endOfMonth();
        $advanceMonthlyLimit = max(0, (float) (Setting::query()
            ->where('tenant_id', $employee->tenant_id)
            ->where('group', 'payroll')
            ->where('key', 'advance.monthly_limit')
            ->value('value') ?? 0));
        $advanceMonthlyUsed = (float) PayrollRecordItem::query()
            ->whereHas('deduction', fn ($query) => $query
                ->where('employee_id', $employee->id)
                ->where('deduction_type', 'advance'))
            ->whereHas('payrollRecord', fn ($query) => $query
                ->where('employee_id', $employee->id)
                ->whereIn('status', ['calculated', 'approved', 'paid'])
                ->whereHas('period', fn ($periodQuery) => $periodQuery
                    ->whereBetween('period_start', [$monthStart->toDateString(), $monthEnd->toDateString()])))
            ->get(['amount'])
            ->sum(fn (PayrollRecordItem $item) => abs((float) $item->amount));

        $contract = $employee->activeContract()->first();
        $assignments = $contract
            ? $employee->salaryComponents()
                ->where('contract_id', $contract->id)
                ->where('is_active', true)
                ->with('component:id,code,default_value')
                ->get()
                ->keyBy(fn (EmployeeSalaryComponent $assignment) => $assignment->component?->code)
            : collect();

        $mealDefault = Setting::query()
            ->where('tenant_id', $employee->tenant_id)
            ->where('group', 'payroll')
            ->where('key', 'subsidies.meal.daily')
            ->value('value');

        $allowances = [];
        foreach (self::ALLOWANCES as $key => $definition) {
            $assignment = $assignments->get($definition['code']);
            $allowances[$key] = [
                'amount' => $assignment
                    ? (float) ($assignment->custom_value ?? $assignment->component?->default_value ?? 0)
                    : ($key === 'meal' ? (float) ($mealDefault ?? 0) : 0),
                'period' => $assignment
                    ? ($assignment->calculation_period ?? $definition['period'])
                    : ($key === 'meal' ? 'daily' : $definition['period']),
                'configured' => $assignment !== null,
            ];
        }

        return [
            'has_active_contract' => $contract !== null,
            'allowances' => $allowances,
            'advance_month' => $monthStart->format('Y-m'),
            'advance_monthly_limit' => $advanceMonthlyLimit,
            'advance_monthly_used' => $advanceMonthlyUsed,
            'advance_monthly_remaining' => max(0, $advanceMonthlyLimit - $advanceMonthlyUsed),
        ];
    }
}
