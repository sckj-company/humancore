<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\PayrollRecordResource;
use App\Models\PayrollRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MyPayslipsController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $employee = auth()->user()->employee;
        if (! $employee) {
            return $this->error('Utilizador sem funcionário associado.', 422);
        }

        $records = PayrollRecord::query()
            ->where('employee_id', $employee->id)
            ->where('tenant_id', tenant_id())
            ->with(['period:id,name,period_start,period_end', 'employee:id,first_name,last_name,employee_code'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(PayrollRecordResource::collection($records));
    }
}
