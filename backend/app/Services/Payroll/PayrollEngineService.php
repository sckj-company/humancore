<?php

namespace App\Services\Payroll;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Services\Payroll\Rules\AbsenceRule;
use App\Services\Payroll\Rules\BaseSalaryRule;
use App\Services\Payroll\Rules\INSSRule;
use App\Services\Payroll\Rules\IRTRule;
use App\Services\Payroll\Rules\LatenessRule;
use App\Services\Payroll\Rules\OvertimeRule;
use App\Services\Payroll\Rules\SubsidyRule;
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
        $contract = $employee->activeContract()->first();
        if (! $contract) {
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

        return DB::transaction(function () use ($period, $employee, $contract, $context, $breakdown, $gross, $net, $totalDeductions, $totalTaxes) {
            return PayrollRecord::updateOrCreate(
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
                    'work_days' => $context->workDays,
                    'absent_days' => $context->absentDays,
                    'overtime_hours' => $context->overtimeHours,
                    'overtime_amount' => collect($breakdown)->firstWhere('code', 'overtime')['amount'] ?? 0,
                    'details' => [
                        'breakdown' => $breakdown,
                        'work_days' => $context->workDays,
                        'absent_days' => $context->absentDays,
                        'late_minutes' => $context->lateMinutes,
                        'overtime_hours' => $context->overtimeHours,
                    ],
                    'status' => 'calculated',
                ],
            );
        });
    }

    public function processPeriod(PayrollPeriod $period): int
    {
        if ($period->isClosed()) {
            throw new \RuntimeException('Não é possível processar um período fechado.');
        }

        $period->update(['status' => 'processing', 'processed_at' => now(), 'processed_by' => auth()->id()]);

        $count = 0;
        Employee::query()
            ->where('status', 'active')
            ->chunkById(50, function ($employees) use ($period, &$count) {
                foreach ($employees as $employee) {
                    try {
                        $this->calculateForEmployee($period, $employee);
                        $count++;
                    } catch (\Throwable $e) {
                        logger()->error('Payroll calc error', [
                            'employee_id' => $employee->id,
                            'period_id' => $period->id,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            });

        $period->update(['status' => 'completed']);

        return $count;
    }

    protected function buildContext(Employee $employee, EmployeeContract $contract, PayrollPeriod $period): PayrollContext
    {
        $context = new PayrollContext($employee, $contract, $period);

        $attendance = AttendanceRecord::query()
            ->where('employee_id', $employee->id)
            ->whereBetween('date', [$period->period_start, $period->period_end])
            ->get();

        $context->workDays = $this->expectedWorkDays($period);
        $context->absentDays = $attendance->whereIn('status', ['absent'])->count();
        $context->lateMinutes = $attendance->sum('late_minutes');
        $context->overtimeHours = $attendance->sum('overtime_minutes') / 60;

        $context->attendance = $attendance;
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
