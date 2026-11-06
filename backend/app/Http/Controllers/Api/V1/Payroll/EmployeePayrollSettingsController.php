<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Employee;
use App\Models\EmployeeSalaryComponent;
use App\Models\SalaryComponent;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EmployeePayrollSettingsController extends BaseController
{
    private const ALLOWANCES = [
        'meal' => [
            'code' => 'meal_allowance',
            'name' => 'Subsídio de Alimentação',
        ],
        'transport' => [
            'code' => 'transport_allowance',
            'name' => 'Subsídio de Transporte',
        ],
    ];

    public function show(Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        return $this->success($this->settingsFor($employee));
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
        ]);

        $contract = $employee->activeContract()->first();
        if (! $contract) {
            return $this->error('O funcionário não possui contrato ativo para configurar remunerações.', 422);
        }

        DB::transaction(function () use ($employee, $contract, $validated): void {
            foreach (self::ALLOWANCES as $key => $definition) {
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
                        'calculation_period' => $validated['allowances'][$key]['period'],
                        'start_date' => $contract->start_date,
                        'end_date' => $contract->end_date,
                        'is_active' => true,
                    ],
                );
            }
        });

        return $this->success($this->settingsFor($employee), 'Subsídios do funcionário atualizados.');
    }

    private function settingsFor(Employee $employee): array
    {
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
                    ? ($assignment->calculation_period ?? 'fixed')
                    : 'daily',
                'configured' => $assignment !== null,
            ];
        }

        return [
            'has_active_contract' => $contract !== null,
            'allowances' => $allowances,
        ];
    }
}
