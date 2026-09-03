<?php

namespace App\Http\Controllers\Api\V1\Employee;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Employee\StoreContractRequest;
use App\Http\Requests\V1\Employee\StoreEmployeeRequest;
use App\Http\Requests\V1\Employee\UpdateEmployeeRequest;
use App\Http\Resources\V1\ContractResource;
use App\Http\Resources\V1\EmployeeListResource;
use App\Http\Resources\V1\EmployeeResource;
use App\Models\Employee;
use App\Models\EmployeeContract;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmployeeController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Employee::class);

        $employees = Employee::query()
            ->with(['department', 'position', 'activeContract'])
            ->when($request->filled('search'), fn ($q) => $q->search($request->string('search')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->integer('department_id')))
            ->when($request->filled('position_id'), fn ($q) => $q->where('position_id', $request->integer('position_id')))
            ->orderBy($request->string('sort_by', 'first_name'), $request->string('sort_dir', 'asc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(EmployeeListResource::collection($employees));
    }

    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $this->authorize('create', Employee::class);

        $data = $request->validated();

        if (! isset($data['employee_code'])) {
            $data['employee_code'] = $this->generateEmployeeCode();
        }

        $photoPath = null;
        if ($request->hasFile('photo')) {
            $photoPath = $request->file('photo')->store('tenants/'.tenant_id().'/employees/photos', 'public');
        }

        $data['photo_path'] = $photoPath;

        /** @var Employee $employee */
        $employee = Employee::query()->create($data);

        return $this->success(
            new EmployeeResource($employee->load('department', 'position', 'manager')),
            'Funcionário criado com sucesso.',
            201,
        );
    }

    public function show(Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        return $this->success(new EmployeeResource($employee->load('department', 'position', 'manager', 'activeContract')));
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $data = $request->validated();

        if ($request->hasFile('photo')) {
            $data['photo_path'] = $request->file('photo')->store('tenants/'.tenant_id().'/employees/photos', 'public');
        }

        $employee->update($data);

        return $this->success(new EmployeeResource($employee->fresh()->load('department', 'position', 'manager')), 'Funcionário atualizado com sucesso.');
    }

    public function destroy(Employee $employee): JsonResponse
    {
        $this->authorize('delete', $employee);

        $employee->update(['status' => 'inactive']);
        $employee->delete();

        return $this->success(null, 'Funcionário eliminado com sucesso.');
    }

    public function contracts(Employee $employee): JsonResponse
    {
        $this->authorize('viewAny', EmployeeContract::class);

        return $this->success(ContractResource::collection($employee->contracts()->with('position', 'department')->get()));
    }

    public function storeContract(StoreContractRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('create', EmployeeContract::class);

        $data = $request->validated();
        $data['employee_id'] = $employee->id;
        $data['tenant_id'] = $employee->tenant_id;

        $documentPath = null;
        if ($request->hasFile('document')) {
            $documentPath = $request->file('document')->store('tenants/'.tenant_id().'/employees/contracts', 'public');
        }
        $data['document_path'] = $documentPath;

        if ($data['is_active'] ?? true) {
            EmployeeContract::query()
                ->where('employee_id', $employee->id)
                ->update(['is_active' => false]);
        }

        $contract = EmployeeContract::query()->create($data);

        return $this->success(new ContractResource($contract->load('position', 'department')), 'Contrato criado com sucesso.', 201);
    }

    public function timeline(Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        $timeline = collect()
            ->merge($employee->contracts()->get()->map(fn ($contract) => [
                'type' => 'contract',
                'title' => 'Contrato '.$contract->contract_type,
                'date' => $contract->start_date?->format('Y-m-d'),
                'description' => 'Salário base: '.number_format((float) $contract->base_salary, 2),
            ]))
            ->sortByDesc('date')
            ->values();

        return $this->success($timeline);
    }

    protected function generateEmployeeCode(): string
    {
        $lastCode = Employee::query()->max('employee_code');
        $nextNumber = $lastCode ? ((int) str_replace('EMP-', '', $lastCode) + 1) : 1;

        return 'EMP-'.str_pad((string) $nextNumber, 4, '0', STR_PAD_LEFT);
    }
}
