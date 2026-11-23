<?php

namespace App\Services\Employee;

use App\Models\AttendanceRecord;
use App\Models\Audit;
use App\Models\Benefit;
use App\Models\Deduction;
use App\Models\DeductionInstallment;
use App\Models\Employee;
use App\Models\EmployeeAsset;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Models\EmployeeEducation;
use App\Models\EmployeeLatenessEvent;
use App\Models\EmployeeSalaryComponent;
use App\Models\EmployeeSchedule;
use App\Models\LeaveRequest;
use App\Models\OnboardingTask;
use App\Models\PayrollRecord;
use App\Models\PerformanceEvaluation;
use App\Models\TrainingAssignment;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class EmployeeHistoryService
{
    private const IGNORED_FIELDS = [
        'id',
        'tenant_id',
        'employee_id',
        'updated_at',
        'created_at',
        'deleted_at',
        'password',
        'remember_token',
        'settlement_breakdown',
        'details',
        'snapshot',
        'validation_errors',
        'progress_message',
    ];

    private const MODEL_META = [
        Employee::class => ['category' => 'profile', 'category_label' => 'Ficha / Perfil', 'noun' => 'Dados do Funcionário'],
        EmployeeContract::class => ['category' => 'contract', 'category_label' => 'Contrato', 'noun' => 'Contrato de Trabalho'],
        EmployeeDocument::class => ['category' => 'document', 'category_label' => 'Documentos', 'noun' => 'Documento'],
        EmployeeAsset::class => ['category' => 'asset', 'category_label' => 'Activos', 'noun' => 'Activo / Equipamento'],
        PayrollRecord::class => ['category' => 'payroll', 'category_label' => 'Folha Salarial', 'noun' => 'Processamento Salarial'],
        EmployeeSalaryComponent::class => ['category' => 'payroll', 'category_label' => 'Remuneração', 'noun' => 'Componente Salarial'],
        Deduction::class => ['category' => 'deduction', 'category_label' => 'Adiantamentos & Descontos', 'noun' => 'Adiantamento / Desconto'],
        DeductionInstallment::class => ['category' => 'deduction', 'category_label' => 'Adiantamentos & Descontos', 'noun' => 'Parcela de Adiantamento'],
        Benefit::class => ['category' => 'benefit', 'category_label' => 'Benefícios', 'noun' => 'Benefício'],
        AttendanceRecord::class => ['category' => 'attendance', 'category_label' => 'Presenças & Atrasos', 'noun' => 'Registo de Presença'],
        LeaveRequest::class => ['category' => 'leave', 'category_label' => 'Ausências & Férias', 'noun' => 'Ausência / Férias'],
        EmployeeSchedule::class => ['category' => 'schedule', 'category_label' => 'Turnos & Horários', 'noun' => 'Atribuição de Turno'],
        EmployeeEducation::class => ['category' => 'education', 'category_label' => 'Educação & Advertências', 'noun' => 'Ocorrência / Formação'],
        PerformanceEvaluation::class => ['category' => 'performance', 'category_label' => 'Desempenho', 'noun' => 'Avaliação de Desempenho'],
        OnboardingTask::class => ['category' => 'onboarding', 'category_label' => 'Onboarding', 'noun' => 'Tarefa de Onboarding'],
        TrainingAssignment::class => ['category' => 'training', 'category_label' => 'Formações', 'noun' => 'Formação'],
    ];

    private const EVENT_LABELS = [
        'created' => 'Criado',
        'updated' => 'Atualizado',
        'deleted' => 'Eliminado',
        'restored' => 'Restaurado',
        'event' => 'Evento',
    ];

    private const FIELD_LABELS = [
        'first_name' => 'Primeiro nome',
        'last_name' => 'Último nome',
        'email' => 'Email',
        'phone' => 'Telefone',
        'alternative_phone' => 'Telefone alternativo',
        'department_id' => 'Departamento',
        'position_id' => 'Cargo',
        'manager_id' => 'Responsável direto',
        'status' => 'Estado',
        'approval_status' => 'Estado de aprovação',
        'base_salary' => 'Salário base',
        'contract_type' => 'Tipo de contrato',
        'start_date' => 'Data de início',
        'end_date' => 'Data de fim',
        'is_active' => 'Ativo',
        'termination_type' => 'Tipo de rescisão',
        'termination_date' => 'Data de rescisão',
        'termination_reason' => 'Motivo da rescisão',
        'net_settlement' => 'Valor líquido de rescisão',
        'gross_settlement' => 'Total bruto de rescisão',
        'name' => 'Nome / Descrição',
        'category' => 'Categoria',
        'condition' => 'Condição',
        'estimated_value' => 'Valor estimado',
        'chargeable_amount' => 'Valor imputável',
        'returned_at' => 'Data de devolução',
        'is_settled' => 'Liquidado',
        'document_type' => 'Tipo de documento',
        'is_verified' => 'Verificado',
        'expiry_date' => 'Data de validade',
        'deduction_type' => 'Tipo de desconto',
        'total_amount' => 'Valor total',
        'paid_amount' => 'Valor pago',
        'amount' => 'Valor',
        'installment_number' => 'Nº da parcela',
        'reference_month' => 'Mês de referência',
        'gross_salary' => 'Salário bruto',
        'net_salary' => 'Salário líquido',
        'total_deductions' => 'Total descontos',
        'total_taxes' => 'Imposto (IRT)',
        'work_days' => 'Dias trabalhados',
        'absent_days' => 'Dias de falta',
        'overtime_hours' => 'Horas extras',
        'date' => 'Data',
        'clock_in' => 'Entrada',
        'clock_out' => 'Saída',
        'late_minutes' => 'Atraso (min)',
        'overtime_minutes' => 'Hora extra (min)',
        'deduct_from_salary' => 'Descontar do salário',
        'occurrence_type' => 'Tipo de ocorrência',
        'total_days' => 'Total de dias',
        'reason' => 'Motivo',
        'shift_id' => 'Turno',
        'effective_from' => 'Válido desde',
        'effective_to' => 'Válido até',
        'notes' => 'Observações',
    ];

    /**
     * Agrega todo o histórico auditável e eventos de domínio que envolvam o funcionário.
     *
     * @param  array{category?: string|null, search?: string|null}  $filters
     * @return array<int, array<string, mixed>>
     */
    public function forEmployee(Employee $employee, array $filters = []): array
    {
        $employeeId = (int) $employee->id;

        // 1. Coletar IDs de entidades do funcionário (incluindo eliminadas) para capturar audits legados anteriores à coluna audits.employee_id
        $legacyMap = [
            EmployeeContract::class => EmployeeContract::withTrashed()->where('employee_id', $employeeId)->pluck('id')->all(),
            EmployeeDocument::class => EmployeeDocument::withTrashed()->where('employee_id', $employeeId)->pluck('id')->all(),
            EmployeeAsset::class => EmployeeAsset::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            EmployeeSalaryComponent::class => EmployeeSalaryComponent::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            Deduction::class => Deduction::withTrashed()->where('employee_id', $employeeId)->pluck('id')->all(),
            DeductionInstallment::class => DeductionInstallment::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            Benefit::class => Benefit::withTrashed()->where('employee_id', $employeeId)->pluck('id')->all(),
            AttendanceRecord::class => AttendanceRecord::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            LeaveRequest::class => LeaveRequest::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            EmployeeSchedule::class => EmployeeSchedule::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            EmployeeEducation::class => EmployeeEducation::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            PayrollRecord::class => PayrollRecord::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            PerformanceEvaluation::class => PerformanceEvaluation::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            OnboardingTask::class => OnboardingTask::query()->where('employee_id', $employeeId)->pluck('id')->all(),
            TrainingAssignment::class => TrainingAssignment::query()->where('employee_id', $employeeId)->pluck('id')->all(),
        ];

        $audits = Audit::query()
            ->withoutGlobalScopes()
            ->with('user:id,name')
            ->where(function ($q) use ($employeeId, $legacyMap): void {
                $q->where('employee_id', $employeeId)
                    ->orWhere(function ($eq) use ($employeeId): void {
                        $eq->where('auditable_type', Employee::class)
                            ->where('auditable_id', $employeeId);
                    });

                foreach ($legacyMap as $modelClass => $ids) {
                    if ($ids !== []) {
                        $q->orWhere(function ($lq) use ($modelClass, $ids): void {
                            $lq->where('auditable_type', $modelClass)
                                ->whereIn('auditable_id', $ids);
                        });
                    }
                }
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(500)
            ->get();

        $seenAuditKeys = [];
        $entries = collect();

        foreach ($audits as $audit) {
            $key = "{$audit->auditable_type}:{$audit->auditable_id}:{$audit->event}";
            $seenAuditKeys[$key] = true;

            $formatted = $this->formatAudit($audit);
            if ($formatted !== null) {
                $entries->push($formatted);
            }
        }

        // 2. Fallback / Enriquecimento para registos que possam ter sido inseridos diretamente (::insert / seeder / eventos calculados)
        $this->appendMissingDomainEvents($employee, $seenAuditKeys, $entries);

        $categoryFilter = isset($filters['category']) ? trim((string) $filters['category']) : '';
        $searchFilter = isset($filters['search']) ? mb_strtolower(trim((string) $filters['search'])) : '';

        return $entries
            ->filter(function (array $entry) use ($categoryFilter, $searchFilter): bool {
                if ($categoryFilter !== '' && $categoryFilter !== 'all' && ($entry['category'] ?? '') !== $categoryFilter) {
                    return false;
                }
                if ($searchFilter !== '') {
                    $haystack = mb_strtolower(
                        ($entry['title'] ?? '').' '.
                        ($entry['description'] ?? '').' '.
                        ($entry['category_label'] ?? '').' '.
                        ($entry['actor']['name'] ?? '')
                    );
                    if (! str_contains($haystack, $searchFilter)) {
                        return false;
                    }
                }

                return true;
            })
            ->sortByDesc(fn (array $entry) => ($entry['occurred_at'] ?? $entry['date'] ?? ''))
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>|null
     */
    protected function formatAudit(Audit $audit): ?array
    {
        $type = (string) $audit->auditable_type;
        $meta = self::MODEL_META[$type] ?? [
            'category' => 'other',
            'category_label' => class_basename($type),
            'noun' => class_basename($type),
        ];

        $event = (string) $audit->event;
        $eventLabel = self::EVENT_LABELS[$event] ?? ucfirst($event);
        $old = is_array($audit->old_values) ? $audit->old_values : [];
        $new = is_array($audit->new_values) ? $audit->new_values : [];
        $merged = array_merge($old, $new);

        $changes = $this->extractChanges($event, $old, $new);
        if ($event === 'updated' && $changes === []) {
            return null;
        }

        $contextSubject = $this->resolveSubjectLabel($type, $merged);
        $title = match ($event) {
            'created' => "{$meta['noun']} registado(a)".($contextSubject ? ": {$contextSubject}" : ''),
            'updated' => "{$meta['noun']} atualizado(a)".($contextSubject ? ": {$contextSubject}" : ''),
            'deleted' => "{$meta['noun']} eliminado(a)".($contextSubject ? ": {$contextSubject}" : ''),
            'restored' => "{$meta['noun']} restaurado(a)".($contextSubject ? ": {$contextSubject}" : ''),
            default => "{$meta['noun']} ({$eventLabel})".($contextSubject ? ": {$contextSubject}" : ''),
        };

        $description = $this->buildAuditDescription($type, $event, $old, $new, $changes);
        $timestamp = $audit->created_at ?? now();

        return [
            'id' => 'audit-'.$audit->id,
            'source' => 'audit',
            'category' => $meta['category'],
            'category_label' => $meta['category_label'],
            'event' => $event,
            'event_label' => $eventLabel,
            'title' => $title,
            'description' => $description,
            'date' => Carbon::parse($timestamp)->format('Y-m-d'),
            'occurred_at' => Carbon::parse($timestamp)->toIso8601String(),
            'actor' => $audit->user ? [
                'id' => $audit->user->id,
                'name' => $audit->user->name,
            ] : null,
            'changes' => $changes,
        ];
    }

    /**
     * @param  array<string, mixed>  $old
     * @param  array<string, mixed>  $new
     * @return array<int, array{field: string, label: string, old: mixed, new: mixed}>
     */
    protected function extractChanges(string $event, array $old, array $new): array
    {
        $changes = [];

        if ($event === 'updated') {
            $keys = array_unique(array_merge(array_keys($old), array_keys($new)));
            foreach ($keys as $field) {
                if (in_array($field, self::IGNORED_FIELDS, true)) {
                    continue;
                }
                $oldVal = $old[$field] ?? null;
                $newVal = $new[$field] ?? null;
                if ($oldVal === $newVal || (is_scalar($oldVal) && is_scalar($newVal) && (string) $oldVal === (string) $newVal)) {
                    continue;
                }
                $changes[] = [
                    'field' => (string) $field,
                    'label' => self::FIELD_LABELS[$field] ?? str_replace('_', ' ', ucfirst((string) $field)),
                    'old' => $this->stringifyAuditValue($oldVal),
                    'new' => $this->stringifyAuditValue($newVal),
                ];
            }
        } elseif ($event === 'created') {
            $highlightFields = ['status', 'base_salary', 'gross_salary', 'net_salary', 'amount', 'total_amount', 'condition', 'date', 'start_date', 'end_date', 'document_type', 'deduction_type', 'contract_type', 'termination_reason'];
            foreach ($highlightFields as $field) {
                if (array_key_exists($field, $new) && $new[$field] !== null && $new[$field] !== '') {
                    $changes[] = [
                        'field' => $field,
                        'label' => self::FIELD_LABELS[$field] ?? $field,
                        'old' => null,
                        'new' => $this->stringifyAuditValue($new[$field]),
                    ];
                }
            }
        }

        return $changes;
    }

    protected function stringifyAuditValue(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (is_bool($value)) {
            return $value ? 'Sim' : 'Não';
        }
        if (is_array($value)) {
            return json_encode($value, JSON_UNESCAPED_UNICODE) ?: '—';
        }

        return (string) $value;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function resolveSubjectLabel(string $type, array $data): string
    {
        return match ($type) {
            Employee::class => trim(($data['first_name'] ?? '').' '.($data['last_name'] ?? '')) ?: ($data['employee_code'] ?? ''),
            EmployeeContract::class => (string) ($data['contract_type'] ?? ''),
            EmployeeDocument::class => (string) ($data['name'] ?? $data['original_name'] ?? ''),
            EmployeeAsset::class => (string) ($data['name'] ?? ''),
            Deduction::class => (string) ($data['name'] ?? ''),
            DeductionInstallment::class => isset($data['installment_number'])
                ? "Parcela #{$data['installment_number']} ({$data['reference_month']})"
                : '',
            Benefit::class => (string) ($data['name'] ?? ''),
            AttendanceRecord::class => (string) ($data['date'] ?? ''),
            LeaveRequest::class => trim(($data['occurrence_type'] ?? 'Ausência').' '.($data['start_date'] ?? '')),
            PayrollRecord::class => isset($data['net_salary'])
                ? 'Líquido '.number_format((float) $data['net_salary'], 2, ',', '.')
                : '',
            EmployeeEducation::class => (string) ($data['title'] ?? $data['type'] ?? ''),
            default => (string) ($data['name'] ?? $data['title'] ?? ''),
        };
    }

    /**
     * @param  array<string, mixed>  $old
     * @param  array<string, mixed>  $new
     * @param  array<int, array{field: string, label: string, old: mixed, new: mixed}>  $changes
     */
    protected function buildAuditDescription(string $type, string $event, array $old, array $new, array $changes): string
    {
        $merged = array_merge($old, $new);

        if ($type === EmployeeContract::class && ! empty($new['termination_type'])) {
            return 'Rescisão contratual: '.($new['termination_reason'] ?? $new['termination_type']).
                (isset($new['net_settlement']) ? ' · Líquido final: '.number_format((float) $new['net_settlement'], 2, ',', '.') : '');
        }

        if ($event === 'updated' && count($changes) > 0) {
            $parts = array_slice(array_map(
                fn (array $c) => "{$c['label']}: ".($c['old'] ?? '—').' → '.($c['new'] ?? '—'),
                $changes
            ), 0, 4);
            $suffix = count($changes) > 4 ? ' (+'.(count($changes) - 4).' alterações)' : '';

            return implode(' | ', $parts).$suffix;
        }

        return match ($type) {
            EmployeeContract::class => 'Salário base: '.number_format((float) ($merged['base_salary'] ?? 0), 2, ',', '.').
                (! empty($merged['start_date']) ? ' · Início: '.Carbon::parse($merged['start_date'])->format('Y-m-d') : ''),
            EmployeeAsset::class => 'Categoria: '.($merged['category'] ?? '—').' · Condição: '.($merged['condition'] ?? '—').' · Estado: '.($merged['status'] ?? '—'),
            EmployeeDocument::class => 'Tipo: '.($merged['document_type'] ?? '—').(! empty($merged['original_name']) ? " ({$merged['original_name']})" : ''),
            Deduction::class => 'Valor total: '.number_format((float) ($merged['total_amount'] ?? $merged['amount'] ?? 0), 2, ',', '.'),
            DeductionInstallment::class => 'Valor: '.number_format((float) ($merged['amount'] ?? 0), 2, ',', '.').' · Estado: '.($merged['status'] ?? '—'),
            PayrollRecord::class => 'Bruto: '.number_format((float) ($merged['gross_salary'] ?? 0), 2, ',', '.').
                ' · Líquido: '.number_format((float) ($merged['net_salary'] ?? 0), 2, ',', '.'),
            AttendanceRecord::class => 'Estado: '.($merged['status'] ?? '—').
                (! empty($merged['late_minutes']) ? " · Atraso: {$merged['late_minutes']} min" : ''),
            LeaveRequest::class => ($merged['start_date'] ?? '').' → '.($merged['end_date'] ?? '').
                (! empty($merged['reason']) ? ' · '.$merged['reason'] : ''),
            default => count($changes) > 0
                ? implode(' | ', array_map(fn ($c) => "{$c['label']}: ".($c['new'] ?? '—'), array_slice($changes, 0, 3)))
                : 'Registo no sistema.',
        };
    }

    /**
     * @param  array<string, bool>  $seenAuditKeys
     */
    protected function appendMissingDomainEvents(Employee $employee, array $seenAuditKeys, Collection $entries): void
    {
        if ($employee->hired_at && empty($seenAuditKeys[Employee::class.":{$employee->id}:created"])) {
            $entries->push([
                'id' => 'domain-hire-'.$employee->id,
                'source' => 'domain',
                'category' => 'profile',
                'category_label' => 'Ficha / Perfil',
                'event' => 'event',
                'event_label' => 'Admissão',
                'title' => 'Admissão do Funcionário',
                'description' => "Data de admissão: {$employee->hired_at->format('Y-m-d')} · Código: {$employee->employee_code}",
                'date' => $employee->hired_at->format('Y-m-d'),
                'occurred_at' => $employee->hired_at->toIso8601String(),
                'actor' => null,
                'changes' => [],
            ]);
        }

        // Eventos calculados de atrasos acumulados
        $latenessEvents = EmployeeLatenessEvent::query()
            ->where('employee_id', $employee->id)
            ->orderByDesc('occurred_on')
            ->get();

        foreach ($latenessEvents as $event) {
            $occurred = $event->occurred_on ?? $event->created_at ?? now();
            $entries->push([
                'id' => 'lateness-'.$event->id,
                'source' => 'domain',
                'category' => 'attendance',
                'category_label' => 'Presenças & Atrasos',
                'event' => 'event',
                'event_label' => 'Atraso',
                'title' => match ($event->event_type) {
                    'discount' => 'Desconto por atraso aplicado',
                    'week_carry' => 'Transição semanal de saldo de atraso',
                    'month_reset' => 'Reinício mensal de saldo de atraso',
                    default => 'Evento de atraso',
                },
                'description' => match ($event->event_type) {
                    'discount' => sprintf('%d min acumulados · Desconto: %s', $event->minutes, number_format((float) $event->amount, 2, ',', '.')),
                    'week_carry' => sprintf('%d min transitaram entre semanas.', $event->minutes),
                    'month_reset' => sprintf('%d min reiniciados no início do mês.', $event->minutes),
                    default => sprintf('%d min registados.', $event->minutes),
                },
                'date' => Carbon::parse($occurred)->format('Y-m-d'),
                'occurred_at' => Carbon::parse($occurred)->toIso8601String(),
                'actor' => null,
                'changes' => [],
            ]);
        }

        // Parcelas criadas via ::insert() em lote que não dispararam eventos Eloquent
        $installments = DeductionInstallment::query()
            ->where('employee_id', $employee->id)
            ->with('deduction:id,name,deduction_type')
            ->orderByDesc('id')
            ->limit(100)
            ->get();

        foreach ($installments as $inst) {
            $auditKey = DeductionInstallment::class.":{$inst->id}:created";
            if (! empty($seenAuditKeys[$auditKey])) {
                continue;
            }
            $ts = $inst->paid_at ?? $inst->created_at ?? now();
            $entries->push([
                'id' => 'inst-'.$inst->id,
                'source' => 'domain',
                'category' => 'deduction',
                'category_label' => 'Adiantamentos & Descontos',
                'event' => 'event',
                'event_label' => DeductionInstallment::STATUSES[$inst->status] ?? $inst->status,
                'title' => sprintf(
                    'Parcela #%d de %s (%s)',
                    $inst->installment_number,
                    $inst->deduction?->name ?? "Desconto #{$inst->deduction_id}",
                    $inst->reference_month
                ),
                'description' => 'Valor: '.number_format((float) $inst->amount, 2, ',', '.').' · Estado: '.(DeductionInstallment::STATUSES[$inst->status] ?? $inst->status),
                'date' => Carbon::parse($ts)->format('Y-m-d'),
                'occurred_at' => Carbon::parse($ts)->toIso8601String(),
                'actor' => null,
                'changes' => [],
            ]);
        }
    }
}
