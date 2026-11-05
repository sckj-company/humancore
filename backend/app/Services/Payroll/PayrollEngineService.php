<?php

namespace App\Services\Payroll;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSchedule;
use App\Models\LeaveRequest;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\PayrollRecordItem;
use App\Services\Payroll\Rules\AbsenceRule;
use App\Services\Payroll\Rules\BaseSalaryRule;
use App\Services\Payroll\Rules\INSSRule;
use App\Services\Payroll\Rules\IRTRule;
use App\Services\Payroll\Rules\LatenessRule;
use App\Services\Payroll\Rules\OvertimeRule;
use App\Services\Payroll\Rules\SubsidyRule;
use App\Services\Payroll\SalaryComponentFormulaEvaluator;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;

class PayrollEngineService
{
    /**
     * @var PayrollRuleInterface[]
     */
    protected array $rules = [];

    public function __construct()
    {
        $this->registerDefaultRules();
    }

    protected function registerDefaultRules(): void
    {
        $this->rules = [
            new BaseSalaryRule,
            new SubsidyRule,
            new OvertimeRule,
            new AbsenceRule,
            new LatenessRule,
            new INSSRule,
            new IRTRule,
        ];
    }

    public function registerRule(PayrollRuleInterface $rule): void
    {
        $this->rules[] = $rule;
        usort($this->rules, fn ($a, $b) => $a->getPriority() <=> $b->getPriority());
    }

    public function getRules(): array
    {
        return $this->rules;
    }

    /**
     * Calculate a single employee's payroll for a period.
     * Returns the PayrollRecord (created in DB if it doesn't exist).
     */
    public function calculateForEmployee(PayrollPeriod $period, Employee $employee): PayrollRecord
    {
        $contract = $this->resolveContract($period, $employee);

        if (! $contract) {
            $hasExpired = EmployeeContract::query()
                ->where('employee_id', $employee->id)
                ->expired()
                ->exists();

            if ($hasExpired) {
                throw new \RuntimeException("Funcionário {$employee->full_name} tem contrato expirado e foi excluído do processamento.");
            }

            throw new \RuntimeException("Funcionário {$employee->full_name} sem contrato ativo.");
        }

        $context = $this->buildContext($employee, $contract, $period);
        $componentBreakdown = $this->calculateSalaryComponents($context);

        $breakdown = [];

        foreach ($this->rules as $rule) {
            if (! $rule->applies($context)) {
                continue;
            }

            $amount = $rule->calculate($context);
            $amount = round((float) $amount, 2);

            $breakdown[] = [
                'code' => $rule->getCode(),
                'name' => $rule->getName(),
                'type' => $rule->getType(),
                'priority' => $rule->getPriority(),
                'amount' => $amount,
            ];

            if ($rule->getCode() === 'inss') {
                $context->inssAmount = abs($amount);
            }
        }

        $breakdown = array_merge($breakdown, $componentBreakdown);

        $totalEarnings = collect($breakdown)
            ->whereIn('type', ['earning', 'benefit'])
            ->sum(fn ($item) => max(0, $item['amount']));
        $totalDeductions = collect($breakdown)
            ->where('type', 'deduction')
            ->sum(fn ($item) => abs(min(0, $item['amount'])));
        $totalTaxes = collect($breakdown)
            ->where('type', 'tax')
            ->sum(fn ($item) => abs($item['amount']));
        $employerComponentCosts = collect($breakdown)
            ->where('type', 'contribution')
            ->sum(fn ($item) => max(0, $item['amount']));

        $gross = $totalEarnings;
        $net = $gross - $totalDeductions - $totalTaxes;

        $inssEmployeeAmount = $context->inssAmount;
        $inssBase = $context->inssBase ?: (float) $contract->base_salary;
        $employerInssBase = $context->employerInssBase ?: (float) $contract->base_salary;
        $employerInssRate = (float) ($context->inssRule?->employer_rate ?? (float) ($context->setting('payroll.inss.employer_rate', 8.0)));
        $employerInss = round($employerInssBase * ($employerInssRate / 100), 2);
        $irtTaxableBase = max(0, $context->irtBase - $inssEmployeeAmount);
        $employerCost = round($gross + $employerInss + $employerComponentCosts, 2);

        return DB::transaction(function () use (
            $period,
            $employee,
            $contract,
            $context,
            $breakdown,
            $gross,
            $net,
            $totalDeductions,
            $totalTaxes,
            $inssBase,
            $employerInssBase,
            $employerInssRate,
            $employerInss,
            $irtTaxableBase,
            $employerCost
        ) {
            $record = PayrollRecord::updateOrCreate(
                [
                    'payroll_period_id' => $period->id,
                    'employee_id' => $employee->id,
                ],
                [
                    'tenant_id' => $period->tenant_id,
                    'contract_id' => $contract->id,
                    'base_salary' => $contract->base_salary,
                    'gross_salary' => $gross,
                    'total_earnings' => $gross,
                    'total_deductions' => $totalDeductions,
                    'total_taxes' => $totalTaxes,
                    'net_salary' => $net,
                    'inss_base' => $inssBase,
                    'employer_inss_base' => $inssBase,
                    'employer_inss' => $employerInss,
                    'irt_taxable_base' => $irtTaxableBase,
                    'employer_cost' => $employerCost,
                    'work_days' => $context->workDays,
                    'absent_days' => $context->absentDays,
                    'overtime_hours' => $context->overtimeHours,
                    'overtime_amount' => collect($breakdown)->firstWhere('code', 'overtime')['amount'] ?? 0,
                    'currency' => $period->tenant?->currency ?? 'AOA',
                    'details' => [
                        'breakdown' => $breakdown,
                        'work_days' => $context->workDays,
                        'absent_days' => $context->absentDays,
                        'late_minutes' => $context->lateMinutes,
                        'overtime_hours' => $context->overtimeHours,
                    ],
                    'snapshot' => [
                        'contract_id' => $contract->id,
                        'inss_rule_id' => $context->inssRule?->id,
                        'inss_employee_rate' => $context->inssRule?->employee_rate ?? 3.0,
                        'inss_employer_rate' => $employerInssRate,
                        'irt_table_id' => $context->irtTable?->id,
                        'irt_brackets_count' => count($context->irtTable?->brackets ?? []),
                        'engine_version' => '2.0.0',
                        'calculated_at' => now()->toIso8601String(),
                    ],
                    'engine_version' => '2.0.0',
                    'validation_errors' => null,
                    'status' => 'calculated',
                ],
            );

            // Itemização em payroll_record_items
            $record->items()->delete();

            $itemsToCreate = [];
            foreach ($breakdown as $item) {
                $category = match ($item['type']) {
                    'earning', 'benefit' => 'earning',
                    'deduction' => 'deduction',
                    'tax' => 'tax',
                    'contribution' => 'employer_contribution',
                    default => 'earning',
                };

                $itemsToCreate[] = [
                    'tenant_id' => $period->tenant_id,
                    'payroll_record_id' => $record->id,
                    'category' => $category,
                    'code' => $item['code'],
                    'name' => $item['name'],
                    'salary_component_id' => $item['salary_component_id'] ?? null,
                    'regulation_id' => $item['regulation_id'] ?? null,
                    'base_amount' => $item['base_amount'] ?? match ($item['code']) {
                        'base_salary' => $contract->base_salary,
                        'inss' => $inssBase,
                        'irt' => $irtTaxableBase,
                        default => null,
                    },
                    'quantity' => $item['quantity'] ?? null,
                    'rate' => $item['rate'] ?? match ($item['code']) {
                        'inss' => $context->inssRule?->employee_rate ?? (float) $context->setting('payroll.inss.employee_rate', 3.0),
                        default => null,
                    },
                    'amount' => $item['amount'],
                    'inss_rule_id' => $item['code'] === 'inss' ? $context->inssRule?->id : null,
                    'irt_table_id' => $item['code'] === 'irt' ? $context->irtTable?->id : null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            if ($employerInss > 0) {
                $itemsToCreate[] = [
                    'tenant_id' => $period->tenant_id,
                    'payroll_record_id' => $record->id,
                    'category' => 'employer_contribution',
                    'code' => 'employer_inss',
                    'name' => 'INSS Patronal',
                    'salary_component_id' => null,
                    'regulation_id' => null,
                    'base_amount' => $inssBase,
                    'quantity' => null,
                    'rate' => $employerInssRate,
                    'amount' => $employerInss,
                    'inss_rule_id' => $context->inssRule?->id,
                    'irt_table_id' => null,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }

            PayrollRecordItem::query()->insert($itemsToCreate);

            return $record;
        });
    }

    /**
     * @param  array<int>|null  $employeeIds  IDs seleccionados; null = todos os activos
     * @return array{processed: int, total: int}
     */
    public function processPeriod(PayrollPeriod $period, ?array $employeeIds = null): array
    {
        if ($period->isClosed()) {
            throw new \RuntimeException('Não é possível processar um período fechado.');
        }

        $period->update([
            'status' => 'processing',
            'processed_at' => now(),
            'processed_by' => auth()->id(),
        ]);

        // Desativa contratos expirados antes do processamento (não altera o estado do funcionário)
        EmployeeContract::deactivateExpired();

        $baseQuery = Employee::query()->where('status', 'active');
        if ($employeeIds !== null) {
            $baseQuery->whereIn('id', array_values(array_unique(array_map('intval', $employeeIds))));
        }

        $total = (clone $baseQuery)->count();
        $period->update([
            'progress_total' => $total,
            'progress_done' => 0,
            'progress_message' => 'A preparar processamento…',
        ]);

        $count = 0;
        $done = 0;
        $hasBlockingErrors = false;
        $hasWarnings = false;

        $baseQuery->chunkById(50, function ($employees) use (
            $period,
            &$count,
            &$done,
            &$hasBlockingErrors,
            &$hasWarnings
        ) {
            foreach ($employees as $employee) {
                $period->update([
                    'progress_done' => $done,
                    'progress_message' => "A processar {$employee->full_name}…",
                ]);

                $contract = $this->resolveContract($period, $employee);

                if (! $contract) {
                    $hasExpired = EmployeeContract::query()
                        ->where('employee_id', $employee->id)
                        ->expired()
                        ->exists();

                    if ($hasExpired) {
                        // Contrato expirado: alerta (não bloqueia) e exclui do processamento
                        $hasWarnings = true;
                        logger()->info('Payroll: employee skipped due to expired contract', [
                            'employee_id' => $employee->id,
                            'period_id' => $period->id,
                        ]);
                        $done++;

                        continue;
                    }

                    $hasBlockingErrors = true;
                    PayrollRecord::updateOrCreate(
                        [
                            'payroll_period_id' => $period->id,
                            'employee_id' => $employee->id,
                        ],
                        [
                            'tenant_id' => $period->tenant_id,
                            'contract_id' => null,
                            'base_salary' => 0,
                            'gross_salary' => 0,
                            'total_earnings' => 0,
                            'total_deductions' => 0,
                            'total_taxes' => 0,
                            'net_salary' => 0,
                            'currency' => $period->tenant?->currency ?? 'AOA',
                            'status' => 'draft',
                            'validation_errors' => [[
                                'employee_id' => $employee->id,
                                'code' => 'MISSING_CONTRACT',
                                'message' => "Funcionário {$employee->full_name} sem contrato ativo.",
                                'is_blocking' => true,
                                'severity' => 'error',
                            ]],
                        ]
                    );
                    $done++;

                    continue;
                }

                try {
                    $record = $this->calculateForEmployee($period, $employee);
                    if (! empty($record->validation_errors)) {
                        foreach ($record->validation_errors as $err) {
                            if (! empty($err['is_blocking'])) {
                                $hasBlockingErrors = true;
                            } else {
                                $hasWarnings = true;
                            }
                        }
                    }
                    $count++;
                } catch (\Throwable $e) {
                    logger()->error('Payroll calc error', [
                        'employee_id' => $employee->id,
                        'period_id' => $period->id,
                        'error' => $e->getMessage(),
                    ]);

                    $blockingError = [
                        'employee_id' => $employee->id,
                        'code' => 'CALC_ERROR',
                        'message' => $e->getMessage(),
                        'is_blocking' => true,
                        'severity' => 'error',
                    ];

                    $hasBlockingErrors = true;

                    PayrollRecord::updateOrCreate(
                        [
                            'payroll_period_id' => $period->id,
                            'employee_id' => $employee->id,
                        ],
                        [
                            'tenant_id' => $period->tenant_id,
                            'contract_id' => $contract->id,
                            'base_salary' => 0,
                            'gross_salary' => 0,
                            'total_earnings' => 0,
                            'total_deductions' => 0,
                            'total_taxes' => 0,
                            'net_salary' => 0,
                            'currency' => $period->tenant?->currency ?? 'AOA',
                            'status' => 'draft',
                            'validation_errors' => [$blockingError],
                        ]
                    );
                }

                $done++;
                $period->update([
                    'progress_done' => $done,
                    'progress_message' => "Concluído {$employee->full_name} ({$done}/{$period->progress_total})",
                ]);
            }
        });

        if ($hasBlockingErrors) {
            $period->update(['status' => 'failed', 'progress_message' => 'Processamento concluído com erros.']);
        } elseif ($hasWarnings) {
            $period->update(['status' => 'pending_validation', 'progress_message' => 'Processamento concluído com avisos.']);
        } else {
            $period->update(['status' => 'completed', 'progress_message' => 'Processamento concluído com sucesso.']);
        }

        return ['processed' => $count, 'total' => $total];
    }

    protected function resolveContract(PayrollPeriod $period, Employee $employee): ?EmployeeContract
    {
        $covering = EmployeeContract::query()
            ->where('employee_id', $employee->id)
            ->where('start_date', '<=', $period->period_start)
            ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', $period->period_end))
            // Contrato ativo, ou desativado por expiração mas que ainda cobre o período (reprocessamento histórico)
            ->where(fn ($q) => $q->where('is_active', true)->orWhereNotNull('end_date'))
            ->orderByDesc('start_date')
            ->first();

        if ($covering) {
            return $covering;
        }

        // Fallback: contrato ativo não expirado (contratos que iniciaram a meio do período)
        $active = $employee->activeContract()->first();

        if ($active && ($active->end_date === null || ! $active->end_date->lt(today()))) {
            return $active;
        }

        return null;
    }

    protected function buildContext(Employee $employee, EmployeeContract $contract, PayrollPeriod $period): PayrollContext
    {
        $context = new PayrollContext($employee, $contract, $period);

        $periodStart = new DateTimeImmutable($period->period_start->toDateString());
        $periodEnd = new DateTimeImmutable($period->period_end->toDateString());
        $context->inssRule = PayrollInssRule::query()
            ->effectiveForPeriod($periodStart, $periodEnd, 'AO', 'standard')
            ->first();

        $context->irtTable = PayrollIrtTable::query()
            ->effectiveForPeriod($periodStart, $periodEnd, 'AO', 'standard')
            ->first();

        $attendance = AttendanceRecord::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('date', [$period->period_start, $period->period_end])
            ->whereIn('status', ['present', 'late', 'absent', 'justified', 'vacation', 'holiday', 'half_day', 'sick'])
            ->get();

        $leaves = LeaveRequest::query()
            ->where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->where('start_date', '<=', $period->period_end)
            ->where('end_date', '>=', $period->period_start)
            ->with('leaveType')
            ->get();

        $scheduledDates = $this->scheduledWorkDates($employee, $period);
        $scheduledDateSet = array_fill_keys($scheduledDates, true);
        $nonWorkedDates = [];
        $halfDays = [];
        $deductibleAbsences = [];

        foreach ($attendance as $record) {
            $date = \Carbon\Carbon::parse($record->date)->toDateString();
            if (! isset($scheduledDateSet[$date])) {
                continue;
            }

            if (in_array($record->status, ['absent', 'justified', 'vacation', 'holiday', 'sick'], true)) {
                $nonWorkedDates[$date] = true;
            } elseif ($record->status === 'half_day') {
                $halfDays[$date] = true;
            }

            if ($record->status === 'absent' && $record->deduct_from_salary) {
                $deductibleAbsences[$date] = 1.0;
            } elseif ($record->status === 'half_day' && $record->deduct_from_salary) {
                $deductibleAbsences[$date] = max($deductibleAbsences[$date] ?? 0, 0.5);
            }
        }

        foreach ($leaves as $leave) {
            $date = $leave->start_date->copy()->startOfDay();
            $end = $leave->end_date->copy()->startOfDay();
            while ($date->lessThanOrEqualTo($end)) {
                $dateKey = $date->toDateString();
                if (isset($scheduledDateSet[$dateKey])) {
                    $nonWorkedDates[$dateKey] = true;
                    if ($leave->deduct_from_salary || $leave->leaveType?->is_paid === false) {
                        $deductibleAbsences[$dateKey] = 1.0;
                    }
                }
                $date->addDay();
            }
        }

        $halfDays = array_diff_key($halfDays, $nonWorkedDates);
        $context->workDays = max(0, count($scheduledDates) - count($nonWorkedDates) - (count($halfDays) * 0.5));
        $context->absentDays = array_sum($deductibleAbsences);
        $context->lateMinutes = $attendance->sum('late_minutes');
        $context->overtimeHours = $attendance->sum('overtime_minutes') / 60;

        $context->attendance = $attendance;
        $context->leaves = $leaves;
        $context->salaryComponents = $employee->salaryComponents()
            ->where('contract_id', $contract->id)
            ->where('is_active', true)
            ->where(fn ($query) => $query->whereNull('start_date')->orWhereDate('start_date', '<=', $period->period_end))
            ->where(fn ($query) => $query->whereNull('end_date')->orWhereDate('end_date', '>=', $period->period_start))
            ->whereHas('component', fn ($query) => $query->where('is_active', true))
            ->with(['component.regulations' => function ($query) use ($period): void {
                $query->where('status', 'active')
                    ->where('country_code', 'AO')
                    ->where('regime_code', 'standard')
                    ->whereDate('effective_from', '<=', $period->period_start)
                    ->where(fn ($regulations) => $regulations->whereNull('effective_to')->orWhereDate('effective_to', '>=', $period->period_end))
                    ->whereNotNull('validated_at')
                    ->whereNotNull('validated_by')
                    ->orderByDesc('version');
            }])
            ->get();

        return $context;
    }

    protected function calculateSalaryComponents(PayrollContext $context): array
    {
        $baseSalary = (float) $context->contract->base_salary;
        $componentAmounts = [
            'base_salary' => $baseSalary,
            'gross_salary' => $baseSalary,
            'work_days' => $context->workDays,
            'absent_days' => $context->absentDays,
            'overtime_hours' => $context->overtimeHours,
            'late_minutes' => $context->lateMinutes,
        ];
        $breakdown = [];
        $inssBase = $baseSalary;
        $employerInssBase = $baseSalary;
        $irtBase = $baseSalary;

        foreach ($context->salaryComponents->sortBy(fn ($assignment) => $assignment->component?->priority ?? 0) as $assignment) {
            $component = $assignment->component;
            if (! $component || in_array($component->code, ['base_salary', 'overtime'], true)) {
                continue;
            }

            $percentageOf = strtolower((string) ($component->percentage_of ?: 'base_salary'));
            $baseAmount = (float) ($componentAmounts[$percentageOf] ?? $baseSalary);
            $percentage = (float) ($assignment->custom_percentage ?? $component->default_value);
            $unitRate = (float) ($assignment->custom_value ?? $component->default_value);
            $quantity = null;
            $rate = null;

            $amount = match ($component->calculation_type) {
                'percentage' => ($rate = $percentage) > 0 ? $baseAmount * ($percentage / 100) : 0,
                'hours' => ($quantity = $context->overtimeHours) > 0 ? (($rate = $unitRate) * $quantity) : 0,
                'formula' => app(SalaryComponentFormulaEvaluator::class)->evaluate((string) $component->formula, $componentAmounts) ?? 0,
                default => $unitRate,
            };

            $amount = match ($component->type) {
                'deduction', 'tax' => -abs($amount),
                default => abs($amount),
            };

            $regulation = $component->regulations->first();
            $employeeInssApplicable = (bool) ($regulation?->employee_inss_applicable ?? false);
            $employerInssApplicable = (bool) ($regulation?->employer_inss_applicable ?? false);
            $irtApplicable = (bool) ($regulation?->irt_applicable ?? $component->is_taxable);

            if ($amount > 0 && $employeeInssApplicable) {
                $inssBase += $amount;
            }
            if ($amount > 0 && $employerInssApplicable) {
                $employerInssBase += $amount;
            }
            if ($amount > 0 && $irtApplicable && in_array($component->type, ['earning', 'benefit'], true)) {
                $irtBase += $amount;
            }

            $breakdown[] = [
                'code' => $component->code,
                'name' => $component->name,
                'type' => $component->type,
                'priority' => (int) $component->priority,
                'amount' => round($amount, 2),
                'salary_component_id' => $component->id,
                'regulation_id' => $regulation?->id,
                'base_amount' => $component->calculation_type === 'percentage' ? $baseAmount : null,
                'quantity' => $quantity,
                'rate' => $rate,
            ];

            $componentAmounts[$component->code] = max(0, $amount);
            if (in_array($component->type, ['earning', 'benefit'], true)) {
                $componentAmounts['gross_salary'] += max(0, $amount);
            }
        }

        $context->inssBase = $inssBase;
        $context->employerInssBase = $employerInssBase;
        $context->irtBase = $irtBase;

        return $breakdown;
    }

    protected function scheduledWorkDates(Employee $employee, PayrollPeriod $period): array
    {
        $schedules = EmployeeSchedule::query()
            ->where('employee_id', $employee->id)
            ->where('is_active', true)
            ->whereDate('effective_from', '<=', $period->period_end)
            ->where(fn ($query) => $query->whereNull('effective_to')->orWhereDate('effective_to', '>=', $period->period_start))
            ->with('shift')
            ->orderByDesc('effective_from')
            ->get();
        $scheduledDates = [];
        $date = $period->period_start->copy()->startOfDay();
        $periodEnd = $period->period_end->copy()->startOfDay();

        while ($date->lessThanOrEqualTo($periodEnd)) {
            $schedule = $schedules->first(fn ($item) =>
                $item->effective_from->lessThanOrEqualTo($date)
                && (! $item->effective_to || $item->effective_to->greaterThanOrEqualTo($date))
            );

            if (! $schedule) {
                $workingDays = [1, 2, 3, 4, 5];
            } elseif (is_array($schedule->custom_days) && count($schedule->custom_days) > 0) {
                $workingDays = $schedule->custom_days;
            } elseif (is_array($schedule->shift?->working_days) && count($schedule->shift->working_days) > 0) {
                $workingDays = $schedule->shift->working_days;
            } else {
                $workingDays = $schedule->shift ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
            }

            if (in_array((int) $date->dayOfWeek, array_map('intval', $workingDays), true)) {
                $scheduledDates[] = $date->toDateString();
            }
            $date->addDay();
        }

        return $scheduledDates;
    }
}
