<?php

namespace App\Http\Controllers\Api\V1\Integration;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Services\Attendance\BiometricAttendanceService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BiometricIntegrationController extends BaseController
{
    public function __construct(
        private readonly BiometricAttendanceService $biometricService,
    ) {}

    /**
     * GET /api/v1/integrations/biometric/employees
     * Lista funcionários do tenant para sincronização com o terminal/PC biométrico.
     */
    public function employees(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Employee::class);

        $tenantId = (int) tenant_id();
        $validated = $request->validate([
            'updated_since' => ['nullable', 'date'],
            'date' => ['nullable', 'date'],
            'status' => ['nullable', 'in:active,inactive,terminated,on_leave,all'],
            'only_approved' => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'all' => ['nullable', 'boolean'],
        ]);

        $targetDate = ! empty($validated['date'])
            ? Carbon::parse($validated['date'])->toDateString()
            : Carbon::now(tenant()?->timezone ?? config('app.timezone', 'Africa/Luanda'))->toDateString();
        $status = $validated['status'] ?? 'active';
        $onlyApproved = array_key_exists('only_approved', $validated)
            ? (bool) $validated['only_approved']
            : true;
        $updatedSince = ! empty($validated['updated_since'])
            ? Carbon::parse($validated['updated_since'])
            : null;
        $allowedDeptIds = $request->user()?->allowedDepartmentIds();

        $query = Employee::query()
            ->where('tenant_id', $tenantId)
            ->when($updatedSince !== null, fn ($q) => $q->withTrashed()->where('updated_at', '>=', $updatedSince))
            ->when($allowedDeptIds !== null, fn ($q) => $q->whereIn('department_id', $allowedDeptIds))
            ->when($status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($onlyApproved, fn ($q) => $q->where('approval_status', 'approved'))
            ->when(! empty($validated['search']), fn ($q) => $q->search((string) $validated['search']))
            ->with([
                'department:id,name',
                'position:id,title',
                'schedules' => fn ($q) => $q
                    ->where('is_active', true)
                    ->whereDate('effective_from', '<=', $targetDate)
                    ->where(fn ($sq) => $sq->whereNull('effective_to')->orWhereDate('effective_to', '>=', $targetDate))
                    ->with('shift:id,name,code,start_time,end_time,break_minutes,work_hours,late_tolerance_minutes,working_days,is_night_shift'),
            ])
            ->orderBy('id');

        $biometricService = $this->biometricService;
        $mapEmployee = static function (Employee $emp) use ($biometricService, $targetDate): array {
            $shiftsPayload = $biometricService->formatEmployeeShiftsPayload($emp, $targetDate);

            return [
                'id' => $emp->id,
                'employee_code' => $emp->employee_code,
                'biometric_code' => $emp->biometric_code ?: $emp->employee_code,
                'has_explicit_biometric_code' => $emp->biometric_code !== null,
                'first_name' => $emp->first_name,
                'last_name' => $emp->last_name,
                'full_name' => $emp->full_name,
                'id_document_number' => $emp->id_document_number,
                'email' => $emp->email,
                'phone' => $emp->phone,
                'department_id' => $emp->department_id,
                'department' => $emp->department?->name,
                'position_id' => $emp->position_id,
                'position' => $emp->position?->title,
                'status' => $emp->status,
                'approval_status' => $emp->approval_status,
                'is_active' => $emp->status === 'active' && $emp->deleted_at === null,
                'has_assigned_shift' => $shiftsPayload['has_assigned_shift'],
                'shifts_count' => $shiftsPayload['shifts_count'],
                'shift' => $shiftsPayload['shift'],
                'shifts' => $shiftsPayload['shifts'],
                'missing_shift_warning' => $shiftsPayload['missing_shift_warning'],
                'updated_at' => $emp->updated_at?->toIso8601String(),
                'deleted_at' => $emp->deleted_at?->toIso8601String(),
            ];
        };

        if (! empty($validated['all'])) {
            $items = $query->get()->map($mapEmployee)->values();

            return $this->success([
                'synced_at' => now()->toIso8601String(),
                'total' => $items->count(),
                'employees' => $items,
            ]);
        }

        $paginator = $query->paginate((int) ($validated['per_page'] ?? 200));

        return $this->success([
            'synced_at' => now()->toIso8601String(),
            'employees' => $paginator->getCollection()->map($mapEmployee)->values(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * POST /api/v1/integrations/biometric/employees/sync
     * Sincroniza/associa biometric_code do sistema biométrico aos funcionários (ou cria pendentes se create_missing=true).
     */
    public function syncEmployees(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user || (! $user->can('create', Employee::class) && ! $user->hasAnyRole(['super-admin', 'admin', 'hr-manager']))) {
            $this->authorize('create', Employee::class);
        }

        $validated = $request->validate([
            'create_missing' => ['sometimes', 'boolean'],
            'employees' => ['required', 'array', 'min:1', 'max:500'],
            'employees.*.employee_id' => ['nullable', 'integer'],
            'employees.*.employee_code' => ['nullable', 'string', 'max:50'],
            'employees.*.biometric_code' => ['nullable', 'string', 'max:64'],
            'employees.*.biometric_id' => ['nullable', 'string', 'max:64'],
            'employees.*.id_document_number' => ['nullable', 'string', 'max:50'],
            'employees.*.first_name' => ['nullable', 'string', 'max:100'],
            'employees.*.last_name' => ['nullable', 'string', 'max:100'],
            'employees.*.full_name' => ['nullable', 'string', 'max:200'],
            'employees.*.email' => ['nullable', 'email', 'max:255'],
            'employees.*.phone' => ['nullable', 'string', 'max:50'],
            'employees.*.department_id' => ['nullable', 'integer'],
            'employees.*.position_id' => ['nullable', 'integer'],
        ]);

        $result = $this->biometricService->syncEmployees(
            tenantId: (int) tenant_id(),
            items: $validated['employees'],
            createMissing: (bool) ($validated['create_missing'] ?? false),
        );

        return $this->success($result, 'Sincronização de funcionários concluída.');
    }

    /**
     * POST /api/v1/integrations/biometric/attendance
     * Recebe 1 marcação ou lote de marcações (punches/records) do leitor biométrico e automatiza presença, atraso e hora extra.
     */
    public function attendance(Request $request): JsonResponse
    {
        $this->authorize('create', AttendanceRecord::class);

        $isBatch = $request->has('punches') || $request->has('records');
        $rawItems = $isBatch
            ? ($request->input('punches') ?? $request->input('records'))
            : [$request->all()];

        $payloadToValidate = [
            'device_name' => $request->input('device_name'),
            'debounce_seconds' => $request->input('debounce_seconds'),
            'items' => $rawItems,
        ];

        $validated = validator($payloadToValidate, [
            'device_name' => ['nullable', 'string', 'max:120'],
            'debounce_seconds' => ['nullable', 'integer', 'min:0', 'max:3600'],
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.employee_id' => ['nullable', 'integer'],
            'items.*.employee_code' => ['nullable', 'string', 'max:50'],
            'items.*.biometric_code' => ['nullable', 'string', 'max:64'],
            'items.*.biometric_id' => ['nullable', 'string', 'max:64'],
            'items.*.id_document_number' => ['nullable', 'string', 'max:50'],
            'items.*.shift_id' => ['nullable', 'integer'],
            'items.*.punched_at' => ['required_without:items.*.date', 'nullable', 'date'],
            'items.*.direction' => ['nullable', 'in:auto,in,out'],
            'items.*.force' => ['nullable', 'boolean'],
            'items.*.date' => ['required_without:items.*.punched_at', 'nullable', 'date'],
            'items.*.clock_in' => ['nullable', 'string', 'max:30'],
            'items.*.clock_out' => ['nullable', 'string', 'max:30'],
            'items.*.status' => ['nullable', 'in:present,absent,late,half_day,holiday,vacation,sick,justified'],
            'items.*.deduct_from_salary' => ['nullable', 'boolean'],
            'items.*.late_minutes' => ['nullable', 'integer', 'min:0'],
            'items.*.overtime_minutes' => ['nullable', 'integer', 'min:0'],
            'items.*.device_name' => ['nullable', 'string', 'max:120'],
            'items.*.device_id' => ['nullable', 'string', 'max:120'],
            'items.*.notes' => ['nullable', 'string', 'max:1000'],
        ])->validate();

        $summary = $this->biometricService->ingestBatch(
            tenantId: (int) tenant_id(),
            items: $validated['items'],
            defaultDevice: $validated['device_name'] ?? null,
            ipAddress: $request->ip(),
            debounceSeconds: (int) ($validated['debounce_seconds'] ?? 120),
        );

        if (! $isBatch && $summary['failed'] === 1) {
            return $this->error(
                $summary['results'][0]['message'] ?? 'Erro ao processar marcação biométrica.',
                422,
                $summary,
            );
        }

        $statusCode = $summary['created'] > 0 && ! $isBatch ? 201 : 200;

        return $this->success($summary, 'Marcações biométricas processadas com sucesso.', $statusCode);
    }

    /**
     * POST /api/v1/integrations/biometric/attendance/close-day
     * Fecha o dia e regista automaticamente 'absent' para funcionários escalados sem marcação e sem férias/feriado.
     */
    public function closeDay(Request $request): JsonResponse
    {
        $this->authorize('create', AttendanceRecord::class);

        $validated = $request->validate([
            'date' => ['nullable', 'date', 'before_or_equal:today'],
            'deduct_from_salary' => ['sometimes', 'boolean'],
            'employee_ids' => ['sometimes', 'array'],
            'employee_ids.*' => ['integer'],
        ], [
            'date.before_or_equal' => 'Não é permitido fechar presenças para datas futuras.',
        ]);

        try {
            $result = $this->biometricService->closeDay(
                tenantId: (int) tenant_id(),
                date: $validated['date'] ?? now()->toDateString(),
                deductFromSalary: (bool) ($validated['deduct_from_salary'] ?? false),
                employeeIds: $validated['employee_ids'] ?? null,
            );
        } catch (\InvalidArgumentException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success($result, 'Fecho diário de presenças concluído.');
    }
}
