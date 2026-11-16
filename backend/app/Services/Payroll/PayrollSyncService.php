<?php

namespace App\Services\Payroll;

use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSchedule;
use App\Models\LeaveRequest;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use Carbon\Carbon;

class PayrollSyncService
{
    public const RECALCULABLE_STATUSES = ['open', 'completed', 'pending_validation', 'failed'];

    public function __construct(
        private readonly PayrollEngineService $engine,
    ) {}

    /**
     * 1. Férias e Licenças Aprovadas -> recalcula dias trabalhados, faltas e subsídios diários na folha aberta.
     */
    public function syncOnLeaveApproved(LeaveRequest $leave): int
    {
        $employee = $leave->employee ?? Employee::query()->find($leave->employee_id);
        if (! $employee) {
            return 0;
        }

        $periods = PayrollPeriod::query()
            ->where('tenant_id', $leave->tenant_id)
            ->whereIn('status', self::RECALCULABLE_STATUSES)
            ->whereDate('period_start', '<=', $leave->end_date)
            ->whereDate('period_end', '>=', $leave->start_date)
            ->whereHas('records', fn ($q) => $q->where('employee_id', $employee->id))
            ->get();

        $recalculated = 0;
        foreach ($periods as $period) {
            try {
                $this->engine->calculateForEmployee($period, $employee);
                $this->engine->refreshPeriodTotals($period);
                $recalculated++;
            } catch (\Throwable) {
                PayrollRecord::query()
                    ->where('payroll_period_id', $period->id)
                    ->where('employee_id', $employee->id)
                    ->update([
                        'is_outdated' => true,
                        'outdated_reason' => 'Licença/férias aprovada após o processamento da folha.',
                    ]);
            }
        }

        return $recalculated;
    }

    /**
     * 2. Alteração de Presenças / Faltas / Horas Extras -> marca registo da folha aberta como desatualizado.
     */
    public function markOutdatedForAttendance(AttendanceRecord $attendance): int
    {
        $date = Carbon::parse($attendance->date)->toDateString();

        return PayrollRecord::query()
            ->where('employee_id', $attendance->employee_id)
            ->whereHas('period', fn ($q) => $q
                ->where('tenant_id', $attendance->tenant_id)
                ->whereIn('status', self::RECALCULABLE_STATUSES)
                ->whereDate('period_start', '<=', $date)
                ->whereDate('period_end', '>=', $date))
            ->update([
                'is_outdated' => true,
                'outdated_reason' => 'Assiduidade alterada após o cálculo da folha.',
            ]);
    }

    /**
     * 3. Salário Base do Contrato alterado -> recalcula em cadeia horas extras, INSS, IRT e encargos nas folhas abertas.
     */
    public function syncOnContractSalaryChanged(EmployeeContract $contract): int
    {
        $employee = $contract->employee ?? Employee::query()->find($contract->employee_id);
        if (! $employee) {
            return 0;
        }

        $periods = PayrollPeriod::query()
            ->where('tenant_id', $contract->tenant_id)
            ->whereIn('status', self::RECALCULABLE_STATUSES)
            ->whereHas('records', fn ($q) => $q
                ->where('employee_id', $employee->id)
                ->where(fn ($inner) => $inner->where('contract_id', $contract->id)->orWhereNull('contract_id')))
            ->get();

        $recalculated = 0;
        foreach ($periods as $period) {
            try {
                $this->engine->calculateForEmployee($period, $employee);
                $this->engine->refreshPeriodTotals($period);
                $recalculated++;
            } catch (\Throwable) {
                PayrollRecord::query()
                    ->where('payroll_period_id', $period->id)
                    ->where('employee_id', $employee->id)
                    ->update([
                        'is_outdated' => true,
                        'outdated_reason' => 'Salário base do contrato alterado após o cálculo da folha.',
                    ]);
            }
        }

        return $recalculated;
    }

    /**
     * 4. Alteração de Valores Globais (Configurações) -> marca folhas abertas como desatualizadas e retorna períodos afetados.
     *
     * @return array<int, array{id: int, name: string, status: string, records_count: int}>
     */
    public function markOpenPeriodsOutdatedForTenant(int $tenantId, string $reason): array
    {
        $periods = PayrollPeriod::query()
            ->where('tenant_id', $tenantId)
            ->whereIn('status', self::RECALCULABLE_STATUSES)
            ->whereHas('records')
            ->withCount('records')
            ->orderByDesc('period_start')
            ->get();

        if ($periods->isEmpty()) {
            return [];
        }

        PayrollRecord::query()
            ->whereIn('payroll_period_id', $periods->pluck('id'))
            ->update([
                'is_outdated' => true,
                'outdated_reason' => $reason,
            ]);

        return $periods->map(fn (PayrollPeriod $period) => [
            'id' => $period->id,
            'name' => $period->name,
            'status' => $period->status,
            'records_count' => (int) $period->records_count,
        ])->values()->all();
    }

    /**
     * 6. Turnos e Escalas alterados -> atualiza scheduled_work_days na folha aberta e marca como desatualizado.
     */
    public function syncOnScheduleChanged(EmployeeSchedule $schedule): int
    {
        $employee = $schedule->employee ?? Employee::query()->find($schedule->employee_id);
        if (! $employee) {
            return 0;
        }

        $periodsQuery = PayrollPeriod::query()
            ->where('tenant_id', $schedule->tenant_id)
            ->whereIn('status', self::RECALCULABLE_STATUSES)
            ->whereHas('records', fn ($q) => $q->where('employee_id', $employee->id));

        if ($schedule->effective_from) {
            $periodsQuery->whereDate('period_end', '>=', $schedule->effective_from);
        }
        if ($schedule->effective_to) {
            $periodsQuery->whereDate('period_start', '<=', $schedule->effective_to);
        }

        $periods = $periodsQuery->get();
        $updated = 0;

        foreach ($periods as $period) {
            $record = PayrollRecord::query()
                ->where('payroll_period_id', $period->id)
                ->where('employee_id', $employee->id)
                ->first();

            if (! $record) {
                continue;
            }

            $scheduledCount = count($this->engine->scheduledWorkDates($employee, $period));
            $details = is_array($record->details) ? $record->details : [];
            $details['scheduled_work_days'] = $scheduledCount;

            $record->update([
                'details' => $details,
                'is_outdated' => true,
                'outdated_reason' => "Escala alterada (dias previstos atualizados para {$scheduledCount}).",
            ]);
            $updated++;
        }

        return $updated;
    }
}
