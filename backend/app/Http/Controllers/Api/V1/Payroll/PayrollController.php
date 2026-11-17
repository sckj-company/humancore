<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Payroll\StorePeriodRequest;
use App\Http\Resources\V1\PayrollPeriodResource;
use App\Http\Resources\V1\PayrollRecordResource;
use App\Models\Deduction;
use App\Models\Employee;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Models\PayrollRecordItem;
use App\Services\Payroll\PayrollEngineService;
use App\Services\Payroll\PayrollValidationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PayrollController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', PayrollPeriod::class);

        $periods = PayrollPeriod::query()
            ->withCount('records')
            ->withSum('records', 'gross_salary')
            ->withSum('records', 'net_salary')
            ->orderByDesc('period_start')
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(PayrollPeriodResource::collection($periods));
    }

    public function store(StorePeriodRequest $request): JsonResponse
    {
        $this->authorize('create', PayrollPeriod::class);

        $data = $request->validated();
        if (! isset($data['name'])) {
            $data['name'] = Carbon::parse($data['period_start'])
                ->locale('pt_BR')
                ->translatedFormat('F/Y');
        }

        $period = PayrollPeriod::query()->create($data);

        return $this->success(new PayrollPeriodResource($period), 'Período criado com sucesso.', 201);
    }

    public function show(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('view', $period);

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();

        $period->load([
            'records' => function ($query) use ($allowedDeptIds) {
                if ($allowedDeptIds !== null) {
                    $query->whereHas('employee', fn ($eq) => $eq->whereIn('department_id', $allowedDeptIds));
                }
                $query->with(['employee', 'items']);
            },
            'events.actor:id,name',
            'processedBy:id,name',
            'approvedBy:id,name',
        ])
            ->loadCount('records');

        return $this->success(new PayrollPeriodResource($period));
    }

    public function process(Request $request, PayrollPeriod $period, PayrollEngineService $engine): JsonResponse
    {
        $this->authorize('process', $period);

        if ($period->isClosed()) {
            return $this->error('Não é possível processar um período fechado.', 422);
        }

        $data = $request->validate([
            'employee_ids' => ['sometimes', 'array'],
            'employee_ids.*' => ['integer', 'exists:employees,id'],
        ]);

        $employeeIds = $data['employee_ids'] ?? null;
        if (is_array($employeeIds) && $employeeIds === []) {
            return $this->error('Seleccione pelo menos um funcionário para processar.', 422);
        }

        // Processamento síncrono com lock — o utilizador vê o progresso via polling
        // do endpoint /progress enquanto o pedido está em curso.
        try {
            $result = Cache::lock("payroll:period:{$period->id}", 3600)->block(5, function () use ($period, $employeeIds, $engine): array {
                $period->refresh();
                $processed = $engine->processPeriod($period, $employeeIds);
                $period->refresh();

                return [
                    'status' => $period->status,
                    'processed' => $processed['processed'],
                    'total' => $processed['total'],
                    'progress_total' => $period->progress_total,
                    'progress_done' => $period->progress_done,
                    'progress_message' => $period->progress_message,
                ];
            });
        } catch (\Throwable $e) {
            return $this->error('Não foi possível processar o período: '.$e->getMessage(), 422);
        }

        $period->recordEvent('processed', auth()->id(), 'Processamento salarial executado.', [
            'employee_ids' => $employeeIds,
            'result' => $result,
        ]);

        return $this->success($result, 'Processamento concluído.');
    }

    public function recalculate(Request $request, PayrollPeriod $period, PayrollEngineService $engine): JsonResponse
    {
        $this->authorize('process', $period);

        if ($period->isClosed()) {
            return $this->error('Não é possível recalcular um período fechado.', 422);
        }

        $data = $request->validate([
            'records' => ['required', 'array', 'min:1'],
            'records.*.employee_id' => ['required', 'integer', 'exists:employees,id'],
            'records.*.work_days' => ['nullable', 'numeric', 'min:0', 'max:31'],
            'records.*.absent_days' => ['nullable', 'numeric', 'min:0', 'max:31'],
            'records.*.overtime_hours' => ['nullable', 'numeric', 'min:0', 'max:500'],
            'records.*.late_minutes' => ['nullable', 'integer', 'min:0', 'max:10000'],
            'records.*.components' => ['sometimes', 'array'],
            'records.*.components.*' => ['nullable', 'numeric', 'min:0'],
            'records.*.extra_items' => ['sometimes', 'array'],
            'records.*.extra_items.*.name' => ['required', 'string', 'max:120'],
            'records.*.extra_items.*.type' => ['required', 'in:earning,deduction'],
            'records.*.extra_items.*.amount' => ['required', 'numeric', 'min:0'],
        ]);

        $user = $request->user();
        foreach ($data['records'] as $entry) {
            $hasAttendanceEdit = array_key_exists('work_days', $entry)
                || array_key_exists('absent_days', $entry)
                || array_key_exists('overtime_hours', $entry)
                || array_key_exists('late_minutes', $entry);
            if ($hasAttendanceEdit && ! $user->hasFieldPermission('payroll', 'attendance_metrics', 'edit')) {
                return $this->error('Sem permissão para alterar dias trabalhados, faltas, horas extras ou atrasos na folha.', 403);
            }

            $hasAllowancesEdit = ! empty($entry['components'])
                || collect($entry['extra_items'] ?? [])->contains(fn ($item) => ($item['type'] ?? '') === 'earning');
            if ($hasAllowancesEdit && ! $user->hasFieldPermission('payroll', 'allowances', 'edit')) {
                return $this->error('Sem permissão para alterar subsídios e abonos na folha.', 403);
            }

            $hasDeductionsEdit = collect($entry['extra_items'] ?? [])->contains(fn ($item) => ($item['type'] ?? '') === 'deduction');
            if ($hasDeductionsEdit && ! $user->hasFieldPermission('payroll', 'deductions', 'edit')) {
                return $this->error('Sem permissão para alterar descontos na folha.', 403);
            }
        }

        try {
            $result = $engine->recalculatePeriodRecords($period, $data['records']);
        } catch (\Throwable $e) {
            return $this->error('Não foi possível recalcular os registos: '.$e->getMessage(), 422);
        }

        $period->recordEvent('processed', auth()->id(), 'Recálculo manual de registos executado.', [
            'employee_ids' => collect($data['records'])->pluck('employee_id')->values()->all(),
            'recalculated' => $result['recalculated'],
        ]);

        $period->refresh()->load([
            'records.employee.department',
            'records.employee.position',
            'records.items',
            'events.actor:id,name',
            'processedBy:id,name',
            'approvedBy:id,name',
        ])->loadCount('records');

        return $this->success(new PayrollPeriodResource($period), 'Folha recalculada com sucesso.');
    }

    public function progress(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('view', $period);

        return $this->success([
            'id' => $period->id,
            'status' => $period->status,
            'progress_total' => $period->progress_total,
            'progress_done' => $period->progress_done,
            'progress_message' => $period->progress_message,
            'records_count' => $period->records()->count(),
            'processed_at' => $period->processed_at,
        ]);
    }

    public function processableEmployees(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('process', $period);

        $user = $request->user();
        $allowedDeptIds = $user?->allowedDepartmentIds();
        $canViewSalary = ! $user
            || $user->hasFieldPermission('payroll', 'base_salary', 'view')
            || $user->hasFieldPermission('employee', 'salary', 'view');

        $employees = Employee::query()
            ->where('tenant_id', $period->tenant_id)
            ->where('status', 'active')
            ->when($allowedDeptIds !== null, fn ($q) => $q->whereIn('department_id', $allowedDeptIds))
            ->with('activeContract')
            ->orderBy('first_name')
            ->get()
            ->map(function (Employee $employee) use ($canViewSalary) {
                $contract = $employee->activeContract;
                $isExpired = $contract?->end_date !== null
                    && $contract->end_date->lt(today());

                return [
                    'id' => $employee->id,
                    'employee_code' => $employee->employee_code,
                    'full_name' => $employee->full_name,
                    'position' => $employee->position?->title,
                    'base_salary' => $canViewSalary ? $contract?->base_salary : null,
                    'contract_end_date' => $contract?->end_date?->format('Y-m-d'),
                    'is_contract_expired' => $isExpired,
                    'eligible' => ! $isExpired,
                ];
            })
            ->values();

        return $this->success($employees);
    }

    public function validations(PayrollPeriod $period, PayrollValidationService $validator): JsonResponse
    {
        $this->authorize('view', $period);

        $report = $validator->validate($period);

        return $this->success($report);
    }

    public function submit(PayrollPeriod $period, PayrollValidationService $validator): JsonResponse
    {
        $this->authorize('process', $period);

        if ($period->isClosed()) {
            return $this->error('Não é possível submeter um período fechado.', 422);
        }

        $report = $validator->validate($period);
        if (! $report['is_valid']) {
            return $this->error('O período possui erros bloqueantes que impedem a submissão para aprovação.', 422, $report);
        }

        try {
            $period->transitionTo('pending_approval');
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $period->recordEvent('submitted', auth()->id(), 'Período submetido para aprovação executiva.', [
            'warning_count' => $report['warning_count'],
        ]);

        return $this->success(null, 'Período submetido para aprovação com sucesso.');
    }

    public function approve(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('approve', $period);

        if ($period->records()->count() === 0) {
            return $this->error('Não é possível aprovar um período sem registos calculados.', 422);
        }

        $totals = [
            'total_gross' => (float) $period->records()->sum('gross_salary'),
            'total_net' => (float) $period->records()->sum('net_salary'),
            'total_inss_employee' => (float) $period->records()->sum('total_deductions'),
            'total_employer_inss' => (float) $period->records()->sum('employer_inss'),
            'total_irt' => (float) $period->records()->sum('total_taxes'),
            'total_employer_cost' => (float) $period->records()->sum('employer_cost'),
            'records_count' => $period->records()->count(),
            'approved_at' => now()->toIso8601String(),
        ];

        $period->records()->update(['status' => 'approved', 'approved_at' => now(), 'approved_by' => auth()->id()]);

        try {
            $period->transitionTo('approved');
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $period->update([
            'approved_by' => auth()->id(),
            'approved_at' => now(),
            'totals_snapshot' => $totals,
        ]);

        $period->recordEvent('approved', auth()->id(), 'Folha salarial aprovada.', $totals);

        return $this->success(null, 'Folha aprovada com sucesso.');
    }

    public function reject(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('approve', $period);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        try {
            $period->transitionTo('pending_validation');
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $period->update(['rejection_reason' => $data['reason']]);

        $period->recordEvent('rejected', auth()->id(), 'Folha rejeitada: '.$data['reason'], [
            'reason' => $data['reason'],
        ]);

        return $this->success(null, 'Folha rejeitada; devolvida para correções.');
    }

    public function close(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('close', $period);

        try {
            $period->transitionTo('closed');
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $period->update(['closed_at' => now()]);
        $period->recordEvent('closed', auth()->id(), 'Período salarial fechado definitivamente.');

        return $this->success(null, 'Período fechado com sucesso.');
    }

    public function reopen(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('reopen', $period);

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $previousSnapshot = $period->totals_snapshot;

        try {
            $period->transitionTo('open');
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $period->update([
            'rejection_reason' => null,
            'approved_at' => null,
            'approved_by' => null,
            'closed_at' => null,
        ]);

        $period->recordEvent('reopened', auth()->id(), 'Período reaberto: '.$data['reason'], [
            'reason' => $data['reason'],
            'previous_totals_snapshot' => $previousSnapshot,
        ]);

        return $this->success(null, 'Período reaberto para recálculo.');
    }

    public function pay(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('pay', $period);

        if (! in_array($period->status, ['approved', 'closed'], true)) {
            return $this->error('Apenas períodos aprovados ou fechados podem ser marcados como pagos.', 422);
        }

        try {
            DB::transaction(function () use ($period): void {
                $records = $period->records()->with('items')->get();
                $paidAt = now();

                foreach ($records as $record) {
                    $record->update(['status' => 'paid', 'paid_at' => $paidAt]);
                }

                $deductionAmounts = $records
                    ->flatMap(fn ($record) => $record->items)
                    ->filter(fn (PayrollRecordItem $item) => $item->deduction_id !== null)
                    ->groupBy('deduction_id')
                    ->map(fn ($items) => $items->sum(fn (PayrollRecordItem $item) => abs((float) $item->amount)));

                foreach ($deductionAmounts as $deductionId => $amount) {
                    $deduction = Deduction::query()->lockForUpdate()->find($deductionId);
                    if (! $deduction) {
                        continue;
                    }

                    $paidAmount = round((float) $deduction->paid_amount + $amount, 2);
                    $updates = ['paid_amount' => $paidAmount];
                    $isComplete = ($deduction->total_amount !== null && $paidAmount >= (float) $deduction->total_amount)
                        || (! $deduction->is_recurring && $deduction->total_amount === null);

                    if ($isComplete && $deduction->status !== 'cancelled') {
                        $updates['status'] = 'completed';
                    }

                    $deduction->update($updates);
                }

                $period->transitionTo('paid');
            });
        } catch (InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $period->recordEvent('paid', auth()->id(), 'Pagamento da folha salarial registado.');

        return $this->success(null, 'Pagamento registado com sucesso.');
    }

    public function events(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('view', $period);

        $events = $period->events()->with('actor:id,name')->get();

        return $this->success($events);
    }

    public function records(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->authorize('viewAny', PayrollRecord::class);

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();

        $records = $period->records()
            ->when($allowedDeptIds !== null, fn ($q) => $q->whereHas('employee', fn ($eq) => $eq->whereIn('department_id', $allowedDeptIds)))
            ->with(['employee', 'contract', 'items'])
            ->get();

        return $this->success(PayrollRecordResource::collection($records));
    }
}
