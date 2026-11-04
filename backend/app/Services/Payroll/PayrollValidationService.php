<?php

namespace App\Services\Payroll;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\LeaveRequest;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\PayrollPeriod;
use App\Models\SalaryComponent;
use DateTimeImmutable;

class PayrollValidationService
{
    /**
     * Valida um período de folha antes de submissão para aprovação.
     *
     * @return array{
     *     is_valid: bool,
     *     blocking_count: int,
     *     warning_count: int,
     *     errors: array<int, array{employee_id?: int, employee_name?: string, code: string, message: string}>,
     *     warnings: array<int, array{employee_id?: int, employee_name?: string, code: string, message: string}>
     * }
     */
    public function validate(PayrollPeriod $period): array
    {
        $errors = [];
        $warnings = [];

        $periodStart = new DateTimeImmutable($period->period_start->toDateString());
        $periodEnd = new DateTimeImmutable($period->period_end->toDateString());

        // 1. Regra INSS deve cobrir todo o período (regras anuais valem para todos os períodos do ano)
        $hasInss = PayrollInssRule::query()
            ->where('tenant_id', $period->tenant_id)
            ->effectiveForPeriod($periodStart, $periodEnd, 'AO', 'standard')
            ->exists();

        if (! $hasInss) {
            $errors[] = [
                'code' => 'MISSING_INSS_RULE',
                'message' => 'Não existe regra de Segurança Social (INSS) ativa que cubra todo o período. Defina a regra uma única vez para o ano (ou para a vigência que abrange o período).',
            ];
        }

        // 2. Tabela IRT deve cobrir todo o período (tabelas anuais valem para todos os períodos do ano)
        $hasIrt = PayrollIrtTable::query()
            ->where('tenant_id', $period->tenant_id)
            ->effectiveForPeriod($periodStart, $periodEnd, 'AO', 'standard')
            ->exists();

        if (! $hasIrt) {
            $errors[] = [
                'code' => 'MISSING_IRT_TABLE',
                'message' => 'Não existe tabela de IRT ativa que cubra todo o período. Defina a tabela uma única vez para o ano (ou para a vigência que abrange o período).',
            ];
        }

        // 3. Verificar existência de registos salariais processados (aviso, não bloqueia)
        $records = $period->records()->with('employee')->get();
        if ($records->isEmpty()) {
            $warnings[] = [
                'code' => 'NO_RECORDS',
                'message' => 'O período ainda não foi processado. Processe a folha antes de submeter.',
            ];
        }

        // 4. Contratos: contrato expirado → aviso (não bloqueia); sem contrato → erro bloqueante
        $activeEmployees = Employee::query()
            ->where('tenant_id', $period->tenant_id)
            ->where('status', 'active')
            ->get();

        foreach ($activeEmployees as $emp) {
            $hasContract = $this->hasContractCoveringPeriod($emp, $period);

            if ($hasContract) {
                continue;
            }

            $hasExpiredContract = EmployeeContract::query()
                ->where('employee_id', $emp->id)
                ->expired()
                ->exists();

            if ($hasExpiredContract) {
                $warnings[] = [
                    'employee_id' => $emp->id,
                    'employee_name' => $emp->full_name,
                    'code' => 'EXPIRED_CONTRACT',
                    'message' => "Funcionário {$emp->full_name} ({$emp->employee_code}) tem contrato expirado (data de fim anterior a hoje) e foi excluído do processamento.",
                ];

                continue;
            }

            $errors[] = [
                'employee_id' => $emp->id,
                'employee_name' => $emp->full_name,
                'code' => 'MISSING_CONTRACT',
                'message' => "Funcionário {$emp->full_name} ({$emp->employee_code}) está ativo mas sem contrato vigente no período.",
            ];
        }

        // 5. Validar integridade matemática e erros bloqueantes por registo
        foreach ($records as $record) {
            // Invariante matemático: bruto - descontos - impostos = líquido
            $expectedNet = round($record->gross_salary - $record->total_deductions - $record->total_taxes, 2);
            $actualNet = round($record->net_salary, 2);

            if (abs($expectedNet - $actualNet) > 0.05) {
                $errors[] = [
                    'employee_id' => $record->employee_id,
                    'employee_name' => $record->employee?->full_name,
                    'code' => 'MATH_INTEGRITY_VIOLATION',
                    'message' => "Divergência matemática no funcionário {$record->employee?->full_name}: Bruto ({$record->gross_salary}) − Deduções ({$record->total_deductions}) − Impostos ({$record->total_taxes}) ≠ Líquido ({$record->net_salary}).",
                ];
            }

            // Erros bloqueantes do próprio motor (suporta is_blocking e severity)
            if (! empty($record->validation_errors)) {
                foreach ($record->validation_errors as $err) {
                    $isError = ! empty($err['is_blocking'])
                        || (($err['severity'] ?? 'error') === 'error');
                    $entry = [
                        'employee_id' => $record->employee_id,
                        'employee_name' => $record->employee?->full_name,
                        'code' => $err['code'] ?? 'ENGINE_ERROR',
                        'message' => $err['message'] ?? 'Erro no processamento salarial',
                    ];

                    if ($isError) {
                        $errors[] = $entry;
                    } else {
                        $warnings[] = $entry;
                    }
                }
            }
        }

        // 5.1 Pedidos de licença pendentes de aprovação que intersectam o período
        $pendingLeaves = LeaveRequest::query()
            ->where('tenant_id', $period->tenant_id)
            ->where('status', 'pending')
            ->where('start_date', '<=', $period->period_end)
            ->where('end_date', '>=', $period->period_start)
            ->count();

        if ($pendingLeaves > 0) {
            $warnings[] = [
                'code' => 'PENDING_LEAVES',
                'message' => "Existem {$pendingLeaves} pedidos de licença pendentes de aprovação que intersectam o período.",
            ];
        }

        // 5.2 Ocorrências de assiduidade não definitivas no período (half_day/sick sem justificação)
        // Nota: o enum de AttendanceRecord não possui estado 'pending'; licenças cobrem o caso principal.

        // 6. Verificar componentes sem regulação validada (aviso informativo)
        $unregulatedComponents = SalaryComponent::query()
            ->where('tenant_id', $period->tenant_id)
            ->where('is_active', true)
            ->whereDoesntHave('regulations', function ($q) use ($periodStart, $periodEnd): void {
                $q->whereIn('status', ['validated', 'active'])
                    ->whereDate('effective_from', '<=', $periodStart)
                    ->where(function ($sq) use ($periodEnd): void {
                        $sq->whereNull('effective_to')
                            ->orWhereDate('effective_to', '>=', $periodEnd);
                    });
            })
            ->get();

        foreach ($unregulatedComponents as $comp) {
            $warnings[] = [
                'code' => 'UNREGULATED_COMPONENT',
                'message' => "O componente salarial '{$comp->name}' ({$comp->code}) está ativo mas não possui regulação legal validada para este período.",
            ];
        }

        return [
            'is_valid' => count($errors) === 0,
            'blocking_count' => count($errors),
            'warning_count' => count($warnings),
            'errors' => $errors,
            'warnings' => $warnings,
        ];
    }

    protected function hasContractCoveringPeriod(Employee $employee, PayrollPeriod $period): bool
    {
        $covering = EmployeeContract::query()
            ->where('employee_id', $employee->id)
            ->where('start_date', '<=', $period->period_start)
            ->where(function ($q) use ($period): void {
                $q->whereNull('end_date')
                    ->orWhere('end_date', '>=', $period->period_end);
            })
            // Contratos ativos, ou desativados automaticamente por expiração mas que cobrem o período (histórico)
            ->where(function ($q): void {
                $q->where('is_active', true)
                    ->orWhereNotNull('end_date');
            })
            ->exists();

        if ($covering) {
            return true;
        }

        // Fallback alinhado com o motor: contrato ativo não expirado
        $active = $employee->activeContract()->first();

        return $active !== null
            && ($active->end_date === null || ! $active->end_date->lt(today()));
    }
}
