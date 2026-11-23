<?php

namespace App\Services\Contract;

use App\Models\AttendanceRecord;
use App\Models\Deduction;
use App\Models\EmployeeAsset;
use App\Models\EmployeeContract;
use App\Models\LeaveRequest;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
use App\Models\User;
use Carbon\Carbon;
use DateTimeImmutable;
use Illuminate\Support\Facades\DB;

class ContractTerminationService
{
    public const TERMINATION_TYPES = [
        'mutual_agreement' => [
            'label' => 'Acordo Mútuo entre as Partes',
            'legal_basis' => 'Lei Geral do Trabalho (LGT Angola) — Cessação por Mútuo Acordo',
            'default_notice_days' => 0,
            'grants_severance' => true,
            'severance_rate_first_5y' => 0.50,
            'severance_rate_after_5y' => 0.40,
            'employer_pays_unserved_notice' => false,
            'employee_pays_unserved_notice' => false,
        ],
        'employer_economic_redundancy' => [
            'label' => 'Extinção do Posto / Causas Objetivas ou Económicas (Empregador)',
            'legal_basis' => 'LGT Angola — Despedimento Individual por Causas Objetivas / Económicas',
            'default_notice_days' => 30,
            'grants_severance' => true,
            'severance_rate_first_5y' => 0.50,
            'severance_rate_after_5y' => 0.40,
            'employer_pays_unserved_notice' => true,
            'employee_pays_unserved_notice' => false,
        ],
        'employer_just_cause_disciplinary' => [
            'label' => 'Despedimento Disciplinar por Justa Causa (Imputável ao Trabalhador)',
            'legal_basis' => 'LGT Angola — Despedimento Disciplinar com Justa Causa',
            'default_notice_days' => 0,
            'grants_severance' => false,
            'severance_rate_first_5y' => 0.0,
            'severance_rate_after_5y' => 0.0,
            'employer_pays_unserved_notice' => false,
            'employee_pays_unserved_notice' => false,
        ],
        'employee_just_cause' => [
            'label' => 'Rescisão pelo Trabalhador com Justa Causa (Imputável ao Empregador)',
            'legal_basis' => 'LGT Angola — Rescisão por Iniciativa do Trabalhador com Justa Causa',
            'default_notice_days' => 0,
            'grants_severance' => true,
            'severance_rate_first_5y' => 1.00,
            'severance_rate_after_5y' => 0.50,
            'employer_pays_unserved_notice' => false,
            'employee_pays_unserved_notice' => false,
        ],
        'employee_resignation' => [
            'label' => 'Demissão / Rescisão por Iniciativa do Trabalhador (Sem Justa Causa)',
            'legal_basis' => 'LGT Angola — Rescisão por Iniciativa do Trabalhador mediante Aviso Prévio',
            'default_notice_days' => 30,
            'grants_severance' => false,
            'severance_rate_first_5y' => 0.0,
            'severance_rate_after_5y' => 0.0,
            'employer_pays_unserved_notice' => false,
            'employee_pays_unserved_notice' => true,
        ],
        'contract_expiry' => [
            'label' => 'Caducidade / Termo do Contrato por Tempo Determinado',
            'legal_basis' => 'LGT Angola — Caducidade do Contrato a Termo Certo / Incerto',
            'default_notice_days' => 15,
            'grants_severance' => true,
            'severance_rate_first_5y' => 0.50,
            'severance_rate_after_5y' => 0.40,
            'employer_pays_unserved_notice' => true,
            'employee_pays_unserved_notice' => false,
        ],
        'probation_termination' => [
            'label' => 'Rescisão durante o Período Experimental',
            'legal_basis' => 'LGT Angola — Cessação durante o Período Experimental',
            'default_notice_days' => 0,
            'grants_severance' => false,
            'severance_rate_first_5y' => 0.0,
            'severance_rate_after_5y' => 0.0,
            'employer_pays_unserved_notice' => false,
            'employee_pays_unserved_notice' => false,
        ],
    ];

    /**
     * Calcula a simulação / pré-visualização completa da rescisão contratual.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function calculatePreview(EmployeeContract $contract, array $input = []): array
    {
        $contract->loadMissing(['employee.department', 'employee.position', 'position', 'department', 'tenant']);
        $employee = $contract->employee;

        $terminationType = (string) ($input['termination_type'] ?? $contract->termination_type ?? 'mutual_agreement');
        if (! isset(self::TERMINATION_TYPES[$terminationType])) {
            $terminationType = 'mutual_agreement';
        }
        $typeMeta = self::TERMINATION_TYPES[$terminationType];

        $terminationDate = Carbon::parse($input['termination_date'] ?? $contract->termination_date ?? today())->startOfDay();
        $hireDate = Carbon::parse($contract->start_date ?? $employee?->hired_at ?? $terminationDate)->startOfDay();
        if ($hireDate->greaterThan($terminationDate)) {
            $hireDate = $terminationDate->copy();
        }

        $baseSalary = max(0, (float) $contract->base_salary);
        $calendarDailyRate = round($baseSalary / 30, 2);
        $workDailyRate = round($baseSalary / 22, 2);

        $tenureDays = (int) $hireDate->diffInDays($terminationDate);
        $tenureMonths = round($tenureDays / 30.4375, 2);
        $tenureYears = round($tenureDays / 365.25, 2);
        $completedYears = (int) floor($tenureDays / 365);

        $workedDaysInMonth = array_key_exists('worked_days_in_month', $input) && $input['worked_days_in_month'] !== null
            ? max(0, min(31, (float) $input['worked_days_in_month']))
            : min(30, (int) $terminationDate->day);

        $yearStart = $terminationDate->copy()->startOfYear();
        $effectiveYearStart = $hireDate->greaterThan($yearStart) ? $hireDate : $yearStart;
        $defaultMonthsInYear = max(0, round($effectiveYearStart->diffInDays($terminationDate) / 30.4375, 2));
        $monthsWorkedInYear = array_key_exists('months_worked_in_year', $input) && $input['months_worked_in_year'] !== null
            ? max(0, min(12, (float) $input['months_worked_in_year']))
            : min(12, $defaultMonthsInYear);

        $defaultUnusedVacation = $this->estimateUnusedVacationDays($employee?->id, $hireDate, $terminationDate);
        $unusedVacationDays = array_key_exists('unused_vacation_days', $input) && $input['unused_vacation_days'] !== null
            ? max(0, (float) $input['unused_vacation_days'])
            : $defaultUnusedVacation;

        $proportionalVacationDays = round(($monthsWorkedInYear / 12) * 22, 2);

        $noticeDaysRequired = array_key_exists('notice_days_required', $input) && $input['notice_days_required'] !== null
            ? max(0, (int) $input['notice_days_required'])
            : (int) $typeMeta['default_notice_days'];
        $noticeDaysServed = array_key_exists('notice_days_served', $input) && $input['notice_days_served'] !== null
            ? max(0, (int) $input['notice_days_served'])
            : $noticeDaysRequired;
        $unservedNoticeDays = max(0, $noticeDaysRequired - $noticeDaysServed);

        $includeVacationSubsidy = array_key_exists('include_vacation_subsidy', $input)
            ? (bool) $input['include_vacation_subsidy']
            : true;
        $includeChristmasSubsidy = array_key_exists('include_christmas_subsidy', $input)
            ? (bool) $input['include_christmas_subsidy']
            : true;
        $includeSeverance = array_key_exists('include_severance', $input)
            ? (bool) $input['include_severance']
            : (bool) $typeMeta['grants_severance'];
        $applyTaxes = array_key_exists('apply_taxes', $input)
            ? (bool) $input['apply_taxes']
            : true;
        $discountPendingDeductions = array_key_exists('discount_pending_deductions', $input)
            ? (bool) $input['discount_pending_deductions']
            : true;
        $discountUnreturnedAssets = array_key_exists('discount_unreturned_assets', $input)
            ? (bool) $input['discount_unreturned_assets']
            : true;
        $discountAttendancePendencies = array_key_exists('discount_attendance_pendencies', $input)
            ? (bool) $input['discount_attendance_pendencies']
            : true;

        // 1. Proveitos (Créditos)
        $workedDaysSalary = round($calendarDailyRate * $workedDaysInMonth, 2);
        $unusedVacationPay = round($workDailyRate * $unusedVacationDays, 2);
        $proportionalVacationPay = round($workDailyRate * $proportionalVacationDays, 2);

        // Subsídio de férias (50% sobre férias proporcionais + vencidas segundo LGT)
        $vacationSubsidy = $includeVacationSubsidy
            ? round(($unusedVacationPay + $proportionalVacationPay) * 0.50, 2)
            : 0.0;

        // Subsídio de Natal proporcional (50% do salário base proporcional aos meses trabalhados no ano)
        $christmasSubsidy = $includeChristmasSubsidy
            ? round(($baseSalary * 0.50) * ($monthsWorkedInYear / 12), 2)
            : 0.0;

        // Indemnização / Compensação por Antiguidade (LGT Angola)
        $severanceCompensation = 0.0;
        if ($includeSeverance) {
            if (array_key_exists('custom_severance_amount', $input) && $input['custom_severance_amount'] !== null && $input['custom_severance_amount'] !== '') {
                $severanceCompensation = round(max(0, (float) $input['custom_severance_amount']), 2);
            } else {
                $effectiveYears = max($tenureMonths >= 3 ? 1.0 : 0.0, $tenureYears);
                $first5Years = min(5.0, $effectiveYears);
                $after5Years = max(0.0, $effectiveYears - 5.0);
                $severanceCompensation = round(
                    ($first5Years * $baseSalary * (float) $typeMeta['severance_rate_first_5y'])
                    + ($after5Years * $baseSalary * (float) $typeMeta['severance_rate_after_5y']),
                    2
                );
            }
        }

        // Aviso prévio indenizado pelo empregador
        $noticeEarning = ($typeMeta['employer_pays_unserved_notice'] && $unservedNoticeDays > 0)
            ? round($unservedNoticeDays * $calendarDailyRate, 2)
            : 0.0;

        $extraEarnings = [];
        $extraEarningsTotal = 0.0;
        if (! empty($input['extra_earnings']) && is_array($input['extra_earnings'])) {
            foreach ($input['extra_earnings'] as $item) {
                $amount = round(max(0, (float) ($item['amount'] ?? 0)), 2);
                $name = trim((string) ($item['name'] ?? ''));
                if ($name !== '' && $amount > 0) {
                    $extraEarnings[] = ['name' => $name, 'amount' => $amount];
                    $extraEarningsTotal += $amount;
                }
            }
        }

        $earningsBreakdown = [
            [
                'code' => 'worked_days_salary',
                'name' => "Salário proporcional dos dias trabalhados ({$workedDaysInMonth} dias)",
                'quantity' => $workedDaysInMonth,
                'unit_rate' => $calendarDailyRate,
                'amount' => $workedDaysSalary,
            ],
            [
                'code' => 'unused_vacation_pay',
                'name' => "Férias vencidas e não gozadas ({$unusedVacationDays} dias úteis)",
                'quantity' => $unusedVacationDays,
                'unit_rate' => $workDailyRate,
                'amount' => $unusedVacationPay,
            ],
            [
                'code' => 'proportional_vacation_pay',
                'name' => "Férias proporcionais do ano em curso ({$proportionalVacationDays} dias úteis)",
                'quantity' => $proportionalVacationDays,
                'unit_rate' => $workDailyRate,
                'amount' => $proportionalVacationPay,
            ],
            [
                'code' => 'vacation_subsidy',
                'name' => 'Subsídio de Férias proporcional (50%)',
                'quantity' => $monthsWorkedInYear,
                'unit_rate' => null,
                'amount' => $vacationSubsidy,
            ],
            [
                'code' => 'christmas_subsidy',
                'name' => "Subsídio de Natal proporcional ({$monthsWorkedInYear}/12 meses)",
                'quantity' => $monthsWorkedInYear,
                'unit_rate' => null,
                'amount' => $christmasSubsidy,
            ],
            [
                'code' => 'severance_compensation',
                'name' => "Compensação / Indemnização por Antiguidade ({$tenureYears} anos)",
                'quantity' => $tenureYears,
                'unit_rate' => $baseSalary,
                'amount' => $severanceCompensation,
            ],
        ];

        if ($noticeEarning > 0) {
            $earningsBreakdown[] = [
                'code' => 'notice_earning',
                'name' => "Indemnização por aviso prévio não cumprido pela empresa ({$unservedNoticeDays} dias)",
                'quantity' => $unservedNoticeDays,
                'unit_rate' => $calendarDailyRate,
                'amount' => $noticeEarning,
            ];
        }

        foreach ($extraEarnings as $idx => $extra) {
            $earningsBreakdown[] = [
                'code' => 'extra_earning_'.$idx,
                'name' => $extra['name'],
                'quantity' => null,
                'unit_rate' => null,
                'amount' => $extra['amount'],
            ];
        }

        $grossSettlement = round(collect($earningsBreakdown)->sum('amount'), 2);

        // 2. Descontos, Adiantamentos, Activos e Pendências
        $deductionsBreakdown = [];

        // 2.1 INSS e IRT sobre base contributiva do mês da rescisão
        $inssAmount = 0.0;
        $irtAmount = 0.0;
        if ($applyTaxes) {
            $dateImm = new DateTimeImmutable($terminationDate->toDateString());
            $inssRule = PayrollInssRule::query()
                ->where('tenant_id', $contract->tenant_id)
                ->effectiveForPeriod($dateImm, $dateImm, 'AO', 'standard')
                ->first();
            $inssRate = (float) ($inssRule?->employee_rate ?? 3.0);
            $contributoryBase = max(0, $workedDaysSalary + $christmasSubsidy);
            $inssAmount = round($contributoryBase * ($inssRate / 100), 2);

            $irtTable = PayrollIrtTable::query()
                ->where('tenant_id', $contract->tenant_id)
                ->effectiveForPeriod($dateImm, $dateImm, 'AO', 'standard')
                ->first();
            $taxableBase = max(0, $contributoryBase - $inssAmount);
            $irtAmount = $this->calculateIrtForBase($taxableBase, $irtTable);

            if ($inssAmount > 0) {
                $deductionsBreakdown[] = [
                    'code' => 'inss',
                    'category' => 'tax',
                    'name' => "Segurança Social — INSS Trabalhador ({$inssRate}%)",
                    'amount' => $inssAmount,
                ];
            }
            if ($irtAmount > 0) {
                $deductionsBreakdown[] = [
                    'code' => 'irt',
                    'category' => 'tax',
                    'name' => 'Imposto sobre o Rendimento do Trabalho (IRT)',
                    'amount' => $irtAmount,
                ];
            }
        }

        // 2.2 Adiantamentos, Empréstimos e Parcelas Pendentes do Funcionário
        $pendingAdvances = $this->collectPendingAdvancesAndDeductions($employee?->id);
        $pendingAdvancesTotal = round((float) collect($pendingAdvances)->sum('remaining_balance'), 2);

        if ($discountPendingDeductions) {
            foreach ($pendingAdvances as $adv) {
                if ($adv['remaining_balance'] > 0) {
                    $installmentSuffix = $adv['total_installments'] > 0
                        ? " ({$adv['pending_installments']} de {$adv['total_installments']} parcelas pendentes)"
                        : '';
                    $deductionsBreakdown[] = [
                        'code' => 'deduction_'.$adv['id'],
                        'category' => 'advance_or_loan',
                        'deduction_id' => $adv['id'],
                        'name' => "{$adv['type_label']}: {$adv['name']}{$installmentSuffix}",
                        'amount' => $adv['remaining_balance'],
                    ];
                }
            }
        }

        // 2.3 Activos Não Devolvidos ou Danificados Imputáveis
        $pendingAssets = $this->collectPendingAssets($employee?->id);
        $pendingAssetsTotal = round((float) collect($pendingAssets)->sum('liability_amount'), 2);

        if ($discountUnreturnedAssets) {
            foreach ($pendingAssets as $assetItem) {
                if ($assetItem['liability_amount'] > 0) {
                    $deductionsBreakdown[] = [
                        'code' => 'asset_'.$assetItem['id'],
                        'category' => 'asset_liability',
                        'asset_id' => $assetItem['id'],
                        'name' => "Activo pendente ({$assetItem['status_label']}): {$assetItem['name']}".($assetItem['serial_number'] ? " [S/N: {$assetItem['serial_number']}]" : ''),
                        'amount' => $assetItem['liability_amount'],
                    ];
                }
            }
        }

        // 2.4 Faltas injustificadas e atrasos no mês da rescisão
        $attendancePendency = $this->collectMonthAttendancePendencies($employee?->id, $terminationDate, $workDailyRate);
        $unjustifiedAbsenceDays = array_key_exists('unjustified_absence_days', $input) && $input['unjustified_absence_days'] !== null
            ? max(0, (float) $input['unjustified_absence_days'])
            : $attendancePendency['unjustified_absence_days'];
        $attendanceDeductionAmount = round($unjustifiedAbsenceDays * $workDailyRate, 2);

        if ($discountAttendancePendencies && $attendanceDeductionAmount > 0) {
            $deductionsBreakdown[] = [
                'code' => 'unjustified_absences',
                'category' => 'attendance',
                'name' => "Faltas injustificadas / dedutíveis no mês ({$unjustifiedAbsenceDays} dias)",
                'amount' => $attendanceDeductionAmount,
            ];
        }

        // 2.5 Aviso prévio não cumprido pelo trabalhador (em pedido de demissão)
        $noticeDeduction = ($typeMeta['employee_pays_unserved_notice'] && $unservedNoticeDays > 0)
            ? round($unservedNoticeDays * $calendarDailyRate, 2)
            : 0.0;
        if ($noticeDeduction > 0) {
            $deductionsBreakdown[] = [
                'code' => 'unserved_notice_deduction',
                'category' => 'notice',
                'name' => "Desconto por aviso prévio não cumprido pelo trabalhador ({$unservedNoticeDays} dias)",
                'amount' => $noticeDeduction,
            ];
        }

        // 2.6 Outros descontos manuais
        $extraDeductions = [];
        if (! empty($input['extra_deductions']) && is_array($input['extra_deductions'])) {
            foreach ($input['extra_deductions'] as $idx => $item) {
                $amount = round(max(0, (float) ($item['amount'] ?? 0)), 2);
                $name = trim((string) ($item['name'] ?? ''));
                if ($name !== '' && $amount > 0) {
                    $extraDeductions[] = ['name' => $name, 'amount' => $amount];
                    $deductionsBreakdown[] = [
                        'code' => 'extra_deduction_'.$idx,
                        'category' => 'manual',
                        'name' => $name,
                        'amount' => $amount,
                    ];
                }
            }
        }

        $totalDeductions = round(collect($deductionsBreakdown)->sum('amount'), 2);
        $netSettlement = round(max(0, $grossSettlement - $totalDeductions), 2);
        $remainingEmployeeDebt = round(max(0, $totalDeductions - $grossSettlement), 2);

        // 3. Notas e Nuances Legais do Contexto
        $legalNotes = $this->buildLegalNuancesNotes(
            $terminationType,
            $typeMeta,
            $tenureYears,
            $unservedNoticeDays,
            $pendingAdvancesTotal,
            $pendingAssetsTotal,
            $remainingEmployeeDebt
        );

        return [
            'contract_id' => $contract->id,
            'employee_id' => $contract->employee_id,
            'employee_name' => $employee?->full_name,
            'employee_code' => $employee?->employee_code,
            'department' => $contract->department?->name ?? $employee?->department?->name,
            'position' => $contract->position?->title ?? $employee?->position?->title,
            'termination_type' => $terminationType,
            'termination_type_label' => $typeMeta['label'],
            'legal_basis' => $typeMeta['legal_basis'],
            'termination_reason' => (string) ($input['termination_reason'] ?? $contract->termination_reason ?? ''),
            'hire_date' => $hireDate->format('Y-m-d'),
            'termination_date' => $terminationDate->format('Y-m-d'),
            'base_salary' => $baseSalary,
            'calendar_daily_rate' => $calendarDailyRate,
            'work_daily_rate' => $workDailyRate,
            'tenure' => [
                'days' => $tenureDays,
                'months' => $tenureMonths,
                'years' => $tenureYears,
                'completed_years' => $completedYears,
            ],
            'parameters' => [
                'worked_days_in_month' => $workedDaysInMonth,
                'months_worked_in_year' => $monthsWorkedInYear,
                'unused_vacation_days' => $unusedVacationDays,
                'proportional_vacation_days' => $proportionalVacationDays,
                'notice_days_required' => $noticeDaysRequired,
                'notice_days_served' => $noticeDaysServed,
                'unserved_notice_days' => $unservedNoticeDays,
                'unjustified_absence_days' => $unjustifiedAbsenceDays,
                'include_vacation_subsidy' => $includeVacationSubsidy,
                'include_christmas_subsidy' => $includeChristmasSubsidy,
                'include_severance' => $includeSeverance,
                'apply_taxes' => $applyTaxes,
                'discount_pending_deductions' => $discountPendingDeductions,
                'discount_unreturned_assets' => $discountUnreturnedAssets,
                'discount_attendance_pendencies' => $discountAttendancePendencies,
            ],
            'earnings_breakdown' => $earningsBreakdown,
            'deductions_breakdown' => $deductionsBreakdown,
            'pending_advances_and_deductions' => $pendingAdvances,
            'pending_assets' => $pendingAssets,
            'attendance_pendencies' => $attendancePendency,
            'totals' => [
                'gross_settlement' => $grossSettlement,
                'total_deductions' => $totalDeductions,
                'pending_advances_total' => $pendingAdvancesTotal,
                'pending_assets_total' => $pendingAssetsTotal,
                'taxes_total' => round($inssAmount + $irtAmount, 2),
                'net_settlement' => $netSettlement,
                'remaining_employee_debt' => $remainingEmployeeDebt,
            ],
            'legal_notes' => $legalNotes,
            'termination_types_catalog' => collect(self::TERMINATION_TYPES)->map(fn ($meta, $code) => [
                'code' => $code,
                'label' => $meta['label'],
                'legal_basis' => $meta['legal_basis'],
                'default_notice_days' => $meta['default_notice_days'],
                'grants_severance' => $meta['grants_severance'],
            ])->values()->all(),
        ];
    }

    /**
     * Executa a rescisão definitiva do contrato, liquidando adiantamentos e pendências.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function executeTermination(EmployeeContract $contract, array $input, ?User $actor = null): array
    {
        return DB::transaction(function () use ($contract, $input, $actor): array {
            $preview = $this->calculatePreview($contract, $input);
            $terminationDate = $preview['termination_date'];
            $terminationType = $preview['termination_type'];
            $terminationReason = trim((string) ($input['termination_reason'] ?? ''));

            $noteLine = sprintf(
                '[Rescindido em %s — %s]: %s (Líquido a pagar: %s AOA)',
                $terminationDate,
                $preview['termination_type_label'],
                $terminationReason,
                number_format((float) $preview['totals']['net_settlement'], 2, ',', '.')
            );
            $updatedNotes = trim(($contract->notes ? $contract->notes."\n" : '').$noteLine);

            $contract->update([
                'is_active' => false,
                'end_date' => $terminationDate,
                'termination_type' => $terminationType,
                'termination_reason' => $terminationReason,
                'termination_date' => $terminationDate,
                'notice_days_required' => $preview['parameters']['notice_days_required'],
                'notice_days_served' => $preview['parameters']['notice_days_served'],
                'unused_vacation_days' => $preview['parameters']['unused_vacation_days'],
                'settlement_breakdown' => $preview,
                'gross_settlement' => $preview['totals']['gross_settlement'],
                'total_deductions_settlement' => $preview['totals']['total_deductions'],
                'net_settlement' => $preview['totals']['net_settlement'],
                'terminated_by' => $actor?->id,
                'terminated_at' => now(),
                'notes' => $updatedNotes,
            ]);

            if ($contract->employee) {
                $contract->employee->update([
                    'status' => 'terminated',
                    'termination_at' => $terminationDate,
                    'termination_reason' => $preview['termination_type_label'].': '.$terminationReason,
                ]);
            }

            // Liquidar adiantamentos e parcelas pendentes descontados na rescisão
            if ($preview['parameters']['discount_pending_deductions'] && $contract->employee_id) {
                $activeDeductions = Deduction::query()
                    ->where('employee_id', $contract->employee_id)
                    ->where('status', 'active')
                    ->with('installments')
                    ->get();

                foreach ($activeDeductions as $deduction) {
                    $pendingInstallments = $deduction->installments->where('status', 'pending');
                    $pendingSum = (float) $pendingInstallments->sum('amount');

                    if ($pendingInstallments->isNotEmpty()) {
                        $deduction->installments()
                            ->where('status', 'pending')
                            ->update([
                                'status' => 'paid',
                                'paid_at' => now(),
                            ]);
                    }

                    $newPaidAmount = $deduction->total_amount !== null
                        ? (float) $deduction->total_amount
                        : round((float) $deduction->paid_amount + max($pendingSum, (float) $deduction->amount), 2);

                    $deduction->update([
                        'paid_amount' => $newPaidAmount,
                        'status' => 'completed',
                        'notes' => trim(($deduction->notes ? $deduction->notes."\n" : '')."[Liquidado na rescisão contratual em {$terminationDate}]"),
                    ]);
                }
            }

            // Marcar activos não devolvidos / danificados como liquidados financeiramente na rescisão
            if ($preview['parameters']['discount_unreturned_assets'] && $contract->employee_id) {
                $assets = EmployeeAsset::query()
                    ->where('employee_id', $contract->employee_id)
                    ->where('is_settled', false)
                    ->get();

                foreach ($assets as $asset) {
                    if ($asset->pendingLiabilityAmount() > 0) {
                        $asset->update([
                            'is_settled' => true,
                            'return_notes' => trim(($asset->return_notes ? $asset->return_notes."\n" : '')."[Valor de {$asset->pendingLiabilityAmount()} descontado na rescisão contratual em {$terminationDate}]"),
                        ]);
                    }
                }
            }

            return $preview;
        });
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function collectPendingAdvancesAndDeductions(?int $employeeId): array
    {
        if (! $employeeId) {
            return [];
        }

        $deductions = Deduction::query()
            ->where('employee_id', $employeeId)
            ->where('status', 'active')
            ->with('installments')
            ->orderBy('id')
            ->get();

        $result = [];
        foreach ($deductions as $deduction) {
            $installments = $deduction->installments;
            $totalInstallments = $installments->count() ?: (int) ($deduction->installment_count ?? 0);
            $paidInstallments = $installments->where('status', 'paid')->count();
            $pendingInstallmentsColl = $installments->where('status', 'pending')->sortBy('installment_number')->values();
            $pendingInstallmentsCount = $pendingInstallmentsColl->count();

            if ($installments->isNotEmpty()) {
                $remainingBalance = round((float) $pendingInstallmentsColl->sum('amount'), 2);
            } elseif ($deduction->total_amount !== null) {
                $remainingBalance = round(max(0, (float) $deduction->total_amount - (float) $deduction->paid_amount), 2);
                if ($totalInstallments > 0 && (float) $deduction->installment_amount > 0) {
                    $paidInstallments = (int) round((float) $deduction->paid_amount / (float) $deduction->installment_amount);
                    $pendingInstallmentsCount = max(0, $totalInstallments - $paidInstallments);
                }
            } else {
                $remainingBalance = round((float) ($deduction->installment_amount ?? $deduction->amount ?? 0), 2);
            }

            if ($remainingBalance <= 0) {
                continue;
            }

            $result[] = [
                'id' => $deduction->id,
                'name' => $deduction->name,
                'deduction_type' => $deduction->deduction_type,
                'type_label' => Deduction::TYPES[$deduction->deduction_type] ?? $deduction->deduction_type,
                'total_amount' => (float) ($deduction->total_amount ?? $remainingBalance),
                'paid_amount' => (float) $deduction->paid_amount,
                'remaining_balance' => $remainingBalance,
                'total_installments' => $totalInstallments,
                'paid_installments' => $paidInstallments,
                'pending_installments' => $pendingInstallmentsCount,
                'next_installment' => $pendingInstallmentsColl->first() ? [
                    'installment_number' => $pendingInstallmentsColl->first()->installment_number,
                    'reference_month' => $pendingInstallmentsColl->first()->reference_month,
                    'amount' => (float) $pendingInstallmentsColl->first()->amount,
                ] : null,
            ];
        }

        return $result;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function collectPendingAssets(?int $employeeId): array
    {
        if (! $employeeId) {
            return [];
        }

        return EmployeeAsset::query()
            ->where('employee_id', $employeeId)
            ->where('is_settled', false)
            ->orderBy('id')
            ->get()
            ->filter(fn (EmployeeAsset $asset) => $asset->status !== 'returned' || $asset->pendingLiabilityAmount() > 0)
            ->map(fn (EmployeeAsset $asset) => [
                'id' => $asset->id,
                'name' => $asset->name,
                'category' => $asset->category,
                'category_label' => EmployeeAsset::CATEGORIES[$asset->category] ?? $asset->category,
                'asset_code' => $asset->asset_code,
                'serial_number' => $asset->serial_number,
                'condition' => $asset->condition,
                'condition_label' => EmployeeAsset::CONDITIONS[$asset->condition] ?? $asset->condition,
                'status' => $asset->status,
                'status_label' => EmployeeAsset::STATUSES[$asset->status] ?? $asset->status,
                'estimated_value' => (float) $asset->estimated_value,
                'chargeable_amount' => (float) $asset->chargeable_amount,
                'deduct_on_termination' => (bool) $asset->deduct_on_termination,
                'liability_amount' => $asset->pendingLiabilityAmount(),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array{unjustified_absence_days: float, late_minutes: int, estimated_deduction: float}
     */
    protected function collectMonthAttendancePendencies(?int $employeeId, Carbon $terminationDate, float $workDailyRate): array
    {
        if (! $employeeId) {
            return [
                'unjustified_absence_days' => 0.0,
                'late_minutes' => 0,
                'estimated_deduction' => 0.0,
            ];
        }

        $monthStart = $terminationDate->copy()->startOfMonth()->toDateString();
        $monthEnd = $terminationDate->toDateString();

        $attendance = AttendanceRecord::query()
            ->where('employee_id', $employeeId)
            ->whereBetween('date', [$monthStart, $monthEnd])
            ->get();

        $absentDays = 0.0;
        foreach ($attendance as $record) {
            if ($record->status === 'absent' && $record->deduct_from_salary) {
                $absentDays += 1.0;
            } elseif ($record->status === 'half_day' && $record->deduct_from_salary) {
                $absentDays += 0.5;
            }
        }

        $lateMinutes = (int) $attendance->sum('late_minutes');

        return [
            'unjustified_absence_days' => $absentDays,
            'late_minutes' => $lateMinutes,
            'estimated_deduction' => round($absentDays * $workDailyRate, 2),
        ];
    }

    protected function estimateUnusedVacationDays(?int $employeeId, Carbon $hireDate, Carbon $terminationDate): float
    {
        if (! $employeeId) {
            return 0.0;
        }

        $completedYears = (int) floor($hireDate->diffInDays($terminationDate) / 365);
        if ($completedYears < 1) {
            return 0.0;
        }

        $yearStart = $terminationDate->copy()->startOfYear()->toDateString();
        $takenDays = (float) LeaveRequest::query()
            ->where('employee_id', $employeeId)
            ->where('status', 'approved')
            ->where('occurrence_type', 'vacation')
            ->whereDate('start_date', '>=', $yearStart)
            ->sum('days_count');

        return max(0.0, round(22.0 - $takenDays, 2));
    }

    protected function calculateIrtForBase(float $taxableBase, ?PayrollIrtTable $irtTable): float
    {
        if ($taxableBase <= 100000) {
            return 0.0;
        }

        $brackets = $irtTable?->brackets ?? [];
        if (is_array($brackets) && count($brackets) > 0) {
            foreach ($brackets as $bracket) {
                $min = (float) ($bracket['min'] ?? $bracket['min_amount'] ?? 0);
                $max = isset($bracket['max']) && $bracket['max'] !== null
                    ? (float) $bracket['max']
                    : (isset($bracket['max_amount']) && $bracket['max_amount'] !== null ? (float) $bracket['max_amount'] : null);

                if ($taxableBase >= $min && ($max === null || $taxableBase <= $max)) {
                    $fixed = (float) ($bracket['fixed_amount'] ?? $bracket['fixed'] ?? 0);
                    $rate = (float) ($bracket['rate'] ?? 0);
                    $excessOver = (float) ($bracket['excess_over'] ?? $min);

                    return round(max(0, $fixed + max(0, $taxableBase - $excessOver) * ($rate / 100)), 2);
                }
            }
        }

        // Fallback tabela progressiva padrão Angola
        return match (true) {
            $taxableBase <= 150000 => round(($taxableBase - 100000) * 0.13, 2),
            $taxableBase <= 200000 => round(6500 + ($taxableBase - 150000) * 0.16, 2),
            $taxableBase <= 300000 => round(14500 + ($taxableBase - 200000) * 0.18, 2),
            $taxableBase <= 500000 => round(32500 + ($taxableBase - 300000) * 0.19, 2),
            $taxableBase <= 1000000 => round(70500 + ($taxableBase - 500000) * 0.20, 2),
            default => round(170500 + ($taxableBase - 1000000) * 0.21, 2),
        };
    }

    /**
     * @param  array<string, mixed>  $typeMeta
     * @return array<int, string>
     */
    protected function buildLegalNuancesNotes(
        string $terminationType,
        array $typeMeta,
        float $tenureYears,
        int $unservedNoticeDays,
        float $pendingAdvancesTotal,
        float $pendingAssetsTotal,
        float $remainingEmployeeDebt
    ): array {
        $notes = [
            "Enquadramento Legal: {$typeMeta['legal_basis']}.",
            'Direitos adquiridos garantidos independentemente da modalidade: salário dos dias trabalhados no mês, férias vencidas não gozadas, férias proporcionais, subsídio de férias proporcional (50%) e subsídio de Natal proporcional (50%).',
        ];

        if ($terminationType === 'employer_just_cause_disciplinary') {
            $notes[] = 'Despedimento disciplinar com justa causa: nos termos da LGT, o trabalhador perde o direito à compensação/indemnização por antiguidade e a aviso prévio, mantendo os créditos salariais vencidos e proporcionais.';
        } elseif ($terminationType === 'employee_resignation') {
            $notes[] = 'Pedido de demissão pelo trabalhador sem justa causa: não há lugar a indemnização por antiguidade. Caso o aviso prévio legal não seja cumprido na totalidade, os dias em falta são descontados no acerto final.';
        } elseif ($terminationType === 'employee_just_cause') {
            $notes[] = 'Rescisão com justa causa pelo trabalhador: confere direito a indemnização integral calculada à razão de 100% do salário base por cada ano até 5 anos e 50% pelos anos subsequentes.';
        } elseif (in_array($terminationType, ['employer_economic_redundancy', 'contract_expiry', 'mutual_agreement'], true)) {
            $notes[] = 'Compensação por antiguidade calculada nos termos da LGT (50% do salário base por cada ano completo até 5 anos + 40% por cada ano adicional).';
        }

        if ($unservedNoticeDays > 0) {
            if ($typeMeta['employer_pays_unserved_notice']) {
                $notes[] = "Aviso prévio: foram acrescidos {$unservedNoticeDays} dias de indemnização por aviso prévio não cumprido pela entidade empregadora.";
            } elseif ($typeMeta['employee_pays_unserved_notice']) {
                $notes[] = "Aviso prévio: foram descontados {$unservedNoticeDays} dias correspondentes ao aviso prévio não cumprido pelo trabalhador.";
            }
        }

        if ($pendingAdvancesTotal > 0) {
            $notes[] = 'Compensação de Adiantamentos e Empréstimos: todas as parcelas pendentes de adiantamentos salariais e empréstimos ativos foram abatidas automaticamente ao valor bruto da rescisão.';
        }

        if ($pendingAssetsTotal > 0) {
            $notes[] = 'Património e Activos da Empresa: foram imputados no acerto final os valores de equipamentos/activos ainda não devolvidos ou registados com dano imputável.';
        }

        if ($remainingEmployeeDebt > 0) {
            $notes[] = sprintf(
                'ATENÇÃO: O total de descontos e pendências excede os proveitos da rescisão em %s AOA, permanecendo este saldo devedor a regularizar pelo ex-funcionário.',
                number_format($remainingEmployeeDebt, 2, ',', '.')
            );
        }

        return $notes;
    }
}
