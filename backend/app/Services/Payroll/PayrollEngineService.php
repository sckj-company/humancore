<?php

namespace App\Services\Payroll;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeContract;
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

        $breakdown = [];
        $totalEarnings = 0;
        $totalDeductions = 0;
        $totalTaxes = 0;

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

            if ($amount > 0 && in_array($rule->getType(), ['earning', 'benefit'], true)) {
                $totalEarnings += $amount;
            } elseif ($amount < 0 && in_array($rule->getType(), ['deduction'], true)) {
                $totalDeductions += abs($amount);
            } elseif ($rule->getType() === 'tax') {
                $totalTaxes += abs($amount);
            }
        }

        $gross = $totalEarnings;
        $net = $gross - $totalDeductions - $totalTaxes;

        $inssEmployeeAmount = abs(collect($breakdown)->firstWhere('code', 'inss')['amount'] ?? 0);
        $inssBase = (float) $contract->base_salary;
        $employerInssRate = (float) ($context->inssRule?->employer_rate ?? (float) ($context->setting('payroll.inss.employer_rate', 8.0)));
        $employerInss = round($inssBase * ($employerInssRate / 100), 2);
        $irtTaxableBase = max(0, $gross - $inssEmployeeAmount);
        $employerCost = round($gross + $employerInss, 2);

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
                    default => 'earning',
                };

                $itemsToCreate[] = [
                    'tenant_id' => $period->tenant_id,
                    'payroll_record_id' => $record->id,
                    'category' => $category,
                    'code' => $item['code'],
                    'name' => $item['name'],
                    'base_amount' => $item['code'] === 'base_salary' ? $contract->base_salary : null,
                    'quantity' => null,
                    'rate' => null,
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
            ->get();

        $context->workDays = $this->expectedWorkDays($period);
        $context->absentDays = $attendance
            ->where('status', 'absent')
            ->where('deduct_from_salary', true)
            ->count();
        $context->lateMinutes = $attendance->sum('late_minutes');
        $context->overtimeHours = $attendance->sum('overtime_minutes') / 60;

        $context->attendance = $attendance;
        $context->leaves = $leaves;
        $context->salaryComponents = $employee->salaryComponents()->where('is_active', true)->with('component')->get();

        return $context;
    }

    protected function expectedWorkDays(PayrollPeriod $period): float
    {
        $days = (int) $period->period_start->diffInDays($period->period_end) + 1;
        $weeks = (int) floor($days / 7);
        $remainder = $days % 7;

        return $weeks * 5 + $remainder;
    }
}
