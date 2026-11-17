<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Deduction;
use App\Models\Employee;
use App\Models\EmployeeSalaryComponent;
use App\Models\PayrollRecordItem;
use App\Models\SalaryComponent;
use App\Models\Setting;
use App\Services\Payroll\RemunerationDefaultsService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EmployeePayrollSettingsController extends BaseController
{
    public function show(Request $request, Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);
        $user = $request->user();
        if ((int) $user->employee_id !== (int) $employee->id && ! $user->hasFieldPermission('employee', 'salary', 'view')) {
            return $this->error('Sem permissão para consultar dados salariais deste funcionário.', 403);
        }

        $validated = $request->validate([
            'period' => ['sometimes', 'date_format:Y-m'],
        ]);

        return $this->success($this->settingsFor($employee, $validated['period'] ?? null));
    }

    public function update(Request $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);
        if (! $request->user()->hasFieldPermission('employee', 'salary', 'edit')) {
            return $this->error('Sem permissão para alterar dados salariais deste funcionário.', 403);
        }

        $validated = $request->validate([
            'allowances' => ['required', 'array'],
            'allowances.meal.amount' => ['nullable', 'numeric', 'min:0'],
            'allowances.meal.period' => ['required', 'in:daily,weekly,fixed'],
            'allowances.meal.use_global' => ['sometimes', 'boolean'],
            'allowances.transport.amount' => ['nullable', 'numeric', 'min:0'],
            'allowances.transport.period' => ['required', 'in:daily,weekly,fixed'],
            'allowances.transport.use_global' => ['sometimes', 'boolean'],
            'allowances.vacation.amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'allowances.vacation.use_global' => ['sometimes', 'boolean'],
            'allowances.christmas.amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'allowances.christmas.use_global' => ['sometimes', 'boolean'],
            'allowances.family.amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'allowances.family.use_global' => ['sometimes', 'boolean'],
            'allowances.additional.amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'allowances.additional.use_global' => ['sometimes', 'boolean'],
            'allowances.bonus.amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'allowances.bonus.use_global' => ['sometimes', 'boolean'],
        ]);

        $contract = $employee->activeContract()->first();
        if (! $contract) {
            return $this->error('O funcionário não possui contrato ativo para configurar remunerações.', 422);
        }

        DB::transaction(function () use ($employee, $contract, $validated): void {
            foreach (RemunerationDefaultsService::ALLOWANCES as $key => $definition) {
                if (! array_key_exists($key, $validated['allowances'])) {
                    continue;
                }

                $entry = $validated['allowances'][$key];
                $useGlobal = (bool) ($entry['use_global'] ?? false) || ($entry['amount'] ?? null) === null;

                $component = SalaryComponent::query()
                    ->where('tenant_id', $employee->tenant_id)
                    ->where('code', $definition['code'])
                    ->first();

                if ($useGlobal) {
                    if ($component) {
                        EmployeeSalaryComponent::query()
                            ->where('employee_id', $employee->id)
                            ->where('contract_id', $contract->id)
                            ->where('salary_component_id', $component->id)
                            ->delete();
                    }

                    continue;
                }

                $component ??= SalaryComponent::query()->create([
                    'tenant_id' => $employee->tenant_id,
                    'code' => $definition['code'],
                    'name' => $definition['name'],
                    'type' => 'benefit',
                    'calculation_type' => 'fixed',
                    'default_value' => 0,
                    'is_taxable' => false,
                    'is_mandatory' => false,
                    'is_active' => true,
                ]);

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
                        'custom_value' => $entry['amount'],
                        'calculation_period' => $entry['period'] ?? $definition['period'],
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
        $advanceMonthlyReserved = Deduction::query()
            ->where('employee_id', $employee->id)
            ->where('deduction_type', 'advance')
            ->where('amount_type', 'fixed')
            ->where('status', 'active')
            ->where(fn ($query) => $query->whereNull('starts_at')->orWhereDate('starts_at', '<=', $monthEnd))
            ->get()
            ->sum(function (Deduction $deduction) use ($employee, $monthStart, $monthEnd): float {
                $alreadyInPayroll = PayrollRecordItem::query()
                    ->where('deduction_id', $deduction->id)
                    ->whereHas('payrollRecord', fn ($query) => $query
                        ->where('employee_id', $employee->id)
                        ->whereIn('status', ['calculated', 'approved', 'paid'])
                        ->whereHas('period', fn ($periodQuery) => $periodQuery
                            ->whereBetween('period_start', [$monthStart->toDateString(), $monthEnd->toDateString()])))
                    ->exists();
                if ($alreadyInPayroll) {
                    return 0.0;
                }

                if (! $deduction->is_recurring && $deduction->total_amount === null && (float) $deduction->paid_amount > 0) {
                    return 0.0;
                }

                $installment = (float) ($deduction->installment_amount ?? $deduction->amount);
                $balance = $deduction->total_amount !== null
                    ? max(0, (float) $deduction->total_amount - (float) $deduction->paid_amount)
                    : $installment;

                return min($installment, $balance);
            });

        $contract = $employee->activeContract()->first();
        $assignments = $contract
            ? $employee->salaryComponents()
                ->where('contract_id', $contract->id)
                ->where('is_active', true)
                ->with('component:id,code,default_value')
                ->get()
                ->keyBy(fn (EmployeeSalaryComponent $assignment) => $assignment->component?->code)
            : collect();

        $globalDefaults = RemunerationDefaultsService::forTenant($employee->tenant_id);

        $allowances = [];
        foreach (RemunerationDefaultsService::ALLOWANCES as $key => $definition) {
            $assignment = $assignments->get($definition['code']);
            $global = $globalDefaults['allowances'][$key] ?? ['amount' => 0.0, 'period' => $definition['period']];
            $allowances[$key] = [
                'amount' => $assignment
                    ? (float) ($assignment->custom_value ?? $assignment->component?->default_value ?? 0)
                    : (float) $global['amount'],
                'period' => $assignment
                    ? ($assignment->calculation_period ?? $definition['period'])
                    : $global['period'],
                'configured' => $assignment !== null,
                'global_amount' => (float) $global['amount'],
                'global_period' => $global['period'],
            ];
        }

        return [
            'has_active_contract' => $contract !== null,
            'allowances' => $allowances,
            'global_overtime_hourly_rate' => $globalDefaults['overtime_hourly_rate'],
            'advance_month' => $monthStart->format('Y-m'),
            'advance_monthly_limit' => $advanceMonthlyLimit,
            'advance_monthly_used' => $advanceMonthlyUsed,
            'advance_monthly_reserved' => $advanceMonthlyReserved,
            'advance_monthly_remaining' => max(0, $advanceMonthlyLimit - $advanceMonthlyUsed - $advanceMonthlyReserved),
        ];
    }
}
