<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\AttendanceResource;
use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Services\Attendance\QrCodeService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AttendanceQrController extends BaseController
{
    public function __construct(private readonly QrCodeService $qrService) {}

    public function issue(Request $request): JsonResponse
    {
        $request->validate([
            'action' => ['required', 'in:clock_in,clock_out'],
        ]);

        $employee = auth()->user()->employee;
        if (! $employee) {
            return $this->error('Utilizador sem funcionário associado.', 422);
        }

        $code = $this->qrService->issue(
            employeeId: $employee->id,
            tenantId: tenant_id(),
            action: $request->string('action'),
            ip: $request->ip(),
            userAgent: $request->userAgent(),
        );

        return $this->success([
            'hash' => $code->hash,
            'action' => $code->action,
            'expires_at' => $code->expires_at->toIso8601String(),
            'ttl_seconds' => QrCodeService::TTL_SECONDS,
        ], 'QR Code gerado.', 201);
    }

    public function scan(Request $request): JsonResponse
    {
        $request->validate([
            'hash' => ['required', 'string'],
        ]);

        $code = $this->qrService->validate(
            hash: $request->string('hash'),
            tenantId: tenant_id(),
        );

        if (! $code) {
            return $this->error('QR Code inválido ou expirado.', 422);
        }

        $employee = Employee::findOrFail($code->employee_id);
        $today = now()->toDateString();

        $record = AttendanceRecord::query()
            ->where('employee_id', $employee->id)
            ->where('tenant_id', tenant_id())
            ->whereDate('date', $today)
            ->first();

        if ($code->action === QrCodeService::ACTION_CLOCK_IN) {
            if ($record && $record->clock_in) {
                $this->qrService->consume($code);

                return $this->error('Entrada já registada hoje.', 422);
            }

            if (! $record) {
                $record = AttendanceRecord::create([
                    'employee_id' => $employee->id,
                    'tenant_id' => tenant_id(),
                    'date' => $today,
                    'status' => 'present',
                ]);
            }

            $record->clock_in = now();
            $record->ip_address = $request->ip();
            $record->device_info = 'QR Code';
            $record->save();
        } else {
            if (! $record || ! $record->clock_in) {
                return $this->error('Entrada não registada.', 422);
            }

            if ($record->clock_out) {
                $this->qrService->consume($code);

                return $this->error('Saída já registada hoje.', 422);
            }

            $record->clock_out = now();
            $record->total_worked = (int) Carbon::parse($record->clock_in)->diffInMinutes($record->clock_out);
            $record->save();
        }

        $this->qrService->consume($code);

        return $this->success(
            new AttendanceResource($record->fresh()),
            $code->action === QrCodeService::ACTION_CLOCK_IN ? 'Entrada registada via QR.' : 'Saída registada via QR.',
        );
    }
}
