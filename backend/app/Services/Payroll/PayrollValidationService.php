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

        $periodDate = new DateTimeImmutable($period->period_end->toDateString());

        // 1. Verificar regra INSS ativa para a vigência do período
        $hasInss = PayrollInssRule::query()
            ->where('tenant_id', $period->tenant_id)
            ->effectiveFor($periodDate, 'AO', 'standard')
            ->exists();

        if (! $hasInss) {
            $errors[] = [
                'code' => 'MISSING_INSS_RULE',
                'message' => 'Não existe regra de Segurança Social (INSS) ativa para o período de vigência.',
            ];
        }

        // 2. Verificar tabela IRT ativa para a vigência do período
        $hasIrt = PayrollIrtTable::query()
            ->where('tenant_id', $period->tenant_id)
            ->effectiveFor($periodDate, 'AO', 'standard')
            ->exists();

        if (! $hasIrt) {
            $errors[] = [
                'code' => 'MISSING_IRT_TABLE',
                'message' => 'Não existe tabela de IRT ativa para o período de vigência.',
            ];
        }

        // 3. Verificar existência de registos salariais processados
        $records = $period->records()->with('employee')->get();
        if ($records->isEmpty()) {
            $errors[] = [
                'code' => 'NO_RECORDS',
                'message' => 'O período ainda não foi processado. Processe a folha antes de submeter.',
            ];
        }

        // 4. Validar contratos vigentes para funcionários ativos
        $activeEmployees = Employee::query()
            ->where('tenant_id', $period->tenant_id)
            ->where('status', 'active')
            ->get();

        foreach ($activeEmployees as $emp) {
            $hasContract = EmployeeContract::query()
                ->where('employee_id', $emp->id)
                ->where('start_date', '<=', $period->period_start)
                ->where(function ($q) use ($period): void {
                    $q->whereNull('end_date')
                        ->orWhere('end_date', '>=', $period->period_end);
                })
                ->where('is_active', true)
                ->exists();

            if (! $hasContract) {
                $errors[] = [
                    'employee_id' => $emp->id,
                    'employee_name' => $emp->full_name,
                    'code' => 'MISSING_CONTRACT',
                    'message' => "Funcionário {$emp->full_name} ({$emp->employee_code}) está ativo mas sem contrato vigente no período.",
                ];
            }
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
            ->whereDoesntHave('regulations', function ($q) use ($periodDate): void {
                $q->whereIn('status', ['validated', 'active'])
                    ->whereDate('effective_from', '<=', $periodDate)
                    ->where(function ($sq) use ($periodDate): void {
                        $sq->whereNull('effective_to')
                            ->orWhereDate('effective_to', '>=', $periodDate);
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
}
