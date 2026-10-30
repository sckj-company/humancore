<?php

namespace App\Http\Controllers\Api\V1\Leave;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Leave\StoreLeaveRequest;
use App\Http\Resources\V1\LeaveRequestResource;
use App\Models\Employee;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\LeaveRequestNotification;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LeaveController extends BaseController
{
    public function types(): JsonResponse
    {
        $this->authorize('viewAny', LeaveType::class);

        return $this->success(LeaveType::query()->where('is_active', true)->get());
    }

    public function balance(Request $request): JsonResponse
    {
        $employeeId = $request->filled('employee_id')
            ? $request->integer('employee_id')
            : auth()->user()->employee?->id;

        $employee = $employeeId ? Employee::find($employeeId) : null;
        if (! $employee) {
            return $this->error('Funcionário não encontrado.', 422);
        }

        $annual = (int) ($this->setting('leave.vacation_days_per_year') ?? 22);
        $daysUsed = LeaveRequest::where('employee_id', $employee->id)
            ->where('status', 'approved')
            ->whereHas('leaveType', fn ($q) => $q->where('code', 'vacation'))
            ->sum('total_days');

        $pending = LeaveRequest::where('employee_id', $employee->id)
            ->where('status', 'pending')
            ->sum('total_days');

        return $this->success([
            'annual_entitlement' => $annual,
            'days_used' => (int) $daysUsed,
            'days_remaining' => max(0, $annual - (int) $daysUsed),
            'days_pending' => (int) $pending,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', LeaveRequest::class);

        $requests = LeaveRequest::query()
            ->with(['employee', 'leaveType', 'approvedBy'])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20));

        return $this->paginated(LeaveRequestResource::collection($requests));
    }

    public function myRequests(Request $request): JsonResponse
    {
        $employee = auth()->user()->employee;
        if (! $employee) {
            return $this->error('Utilizador sem funcionário associado.', 422);
        }

        $requests = LeaveRequest::where('employee_id', $employee->id)
            ->with(['leaveType', 'approvedBy'])
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20));

        return $this->paginated(LeaveRequestResource::collection($requests));
    }

    public function store(StoreLeaveRequest $request): JsonResponse
    {
        $this->authorize('create', LeaveRequest::class);

        $validated = $request->validated();
        $employeeId = $request->filled('employee_id')
            ? $request->integer('employee_id')
            : auth()->user()->employee?->id;

        $employee = Employee::find($employeeId);

        if (! $employee) {
            return $this->error('Funcionário não encontrado.', 422);
        }

        $start = Carbon::parse($validated['start_date']);
        $end = Carbon::parse($validated['end_date']);
        $totalDays = $start->diffInDays($end) + 1;

        $status = $request->input('status', 'approved');

        $leave = LeaveRequest::create([
            'employee_id' => $employee->id,
            'tenant_id' => tenant_id() ?: $employee->tenant_id,
            'leave_type_id' => $validated['leave_type_id'],
            'start_date' => $start->format('Y-m-d'),
            'end_date' => $end->format('Y-m-d'),
            'total_days' => $totalDays,
            'reason' => $validated['reason'] ?? null,
            'status' => $status,
            'approved_by' => $status === 'approved' ? auth()->id() : null,
            'approved_at' => $status === 'approved' ? now() : null,
        ]);

        if ($status === 'pending') {
            $this->notifyApprovers(
                $employee->first_name.' '.$employee->last_name,
                $totalDays,
                $start->format('d/m/Y'),
                $end->format('d/m/Y'),
            );
        }

        return $this->success(new LeaveRequestResource($leave->load(['employee', 'leaveType'])), 'Registo de ausência/férias criado com sucesso.', 201);
    }

    public function approve(LeaveRequest $leave): JsonResponse
    {
        $this->authorize('approve', $leave);

        $leave->update([
            'status' => 'approved',
            'approved_by' => auth()->id(),
            'approved_at' => now(),
        ]);

        $leave->employee?->user?->notify(new LeaveRequestNotification(
            title: 'Pedido de férias aprovado',
            message: 'O seu pedido de '.$leave->total_days.' dias foi aprovado.',
            icon: 'check-circle',
            actionUrl: '/leave',
        ));

        return $this->success(new LeaveRequestResource($leave->load('leaveType')), 'Pedido aprovado.');
    }

    public function reject(Request $request, LeaveRequest $leave): JsonResponse
    {
        $this->authorize('reject', $leave);

        $validated = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);

        $leave->update([
            'status' => 'rejected',
            'rejected_reason' => $validated['reason'] ?? null,
        ]);

        $leave->employee?->user?->notify(new LeaveRequestNotification(
            title: 'Pedido de férias rejeitado',
            message: $validated['reason'] ? 'Motivo: '.$validated['reason'] : 'O seu pedido de férias foi rejeitado.',
            icon: 'x-circle',
            actionUrl: '/leave',
        ));

        return $this->success(new LeaveRequestResource($leave->load('leaveType')), 'Pedido rejeitado.');
    }

    public function cancel(LeaveRequest $leave): JsonResponse
    {
        if ($leave->employee_id !== (auth()->user()->employee_id ?? null)) {
            $this->authorize('cancel', $leave);
        }

        $leave->update(['status' => 'cancelled']);

        return $this->success(new LeaveRequestResource($leave->load('leaveType')), 'Pedido cancelado.');
    }

    protected function setting(string $key): mixed
    {
        [$group, $k] = explode('.', $key, 2);

        return Setting::where('tenant_id', tenant_id())
            ->where('group', $group)
            ->where('key', $k)
            ->value('value');
    }

    protected function notifyApprovers(string $employeeName, int $days, string $start, string $end): void
    {
        $approvers = User::permission('approve_leave')
            ->where('tenant_id', tenant_id())
            ->where('is_active', true)
            ->get();

        foreach ($approvers as $approver) {
            $approver->notify(new LeaveRequestNotification(
                title: 'Novo pedido de férias',
                message: $employeeName.' solicitou '.$days.' dias ('.$start.' a '.$end.').',
                icon: 'calendar',
                actionUrl: '/leave',
            ));
        }
    }
}
