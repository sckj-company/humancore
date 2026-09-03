<?php

namespace App\Http\Controllers\Api\V1\Contract;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\ContractResource;
use App\Models\EmployeeContract;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContractController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', EmployeeContract::class);

        $contracts = EmployeeContract::query()
            ->with(['employee:id,first_name,last_name,employee_code', 'position:id,title', 'department:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('is_active', $request->boolean('status')))
            ->when($request->filled('type'), fn ($q) => $q->where('contract_type', $request->string('type')))
            ->when($request->filled('expiring_soon'), fn ($q) => $q->whereNotNull('end_date')
                ->whereBetween('end_date', [now(), now()->addDays($request->integer('expiring_days', 60))]))
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(ContractResource::collection($contracts));
    }

    public function show(EmployeeContract $contract): JsonResponse
    {
        $this->authorize('view', $contract);

        return $this->success(new ContractResource($contract->load('employee', 'position', 'department', 'manager')));
    }

    public function destroy(EmployeeContract $contract): JsonResponse
    {
        $this->authorize('delete', $contract);

        $contract->update(['is_active' => false]);
        $contract->delete();

        return $this->success(null, 'Contrato eliminado com sucesso.');
    }
}
