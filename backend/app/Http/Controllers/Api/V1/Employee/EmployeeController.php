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
use App\Models\EmployeeDocument;
use App\Services\CloudinaryService;
use App\Services\Employee\EmployeeHistoryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class EmployeeController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Employee::class);

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();

        $employees = Employee::query()
            ->with(['department', 'departments:id,name', 'position', 'activeContract', 'latestContract'])
            ->when($allowedDeptIds !== null, function ($q) use ($allowedDeptIds): void {
                $q->where(function ($sub) use ($allowedDeptIds): void {
                    $sub->whereIn('department_id', $allowedDeptIds)
                        ->orWhereHas('departments', fn ($dq) => $dq->whereIn('departments.id', $allowedDeptIds));
                });
            })
            ->when($request->filled('search'), fn ($q) => $q->search($request->string('search')))
            ->when($request->filled('approval_status'), fn ($q) => $q->where('approval_status', $request->string('approval_status')))
            ->when($request->filled('status'), function ($q) use ($request) {
                $statusFilter = $request->string('status')->toString();
                if ($statusFilter === 'pending') {
                    $q->where('approval_status', 'pending');
                } else {
                    $q->where('status', $statusFilter);
                }
            })
            ->when($request->filled('department_id'), function ($q) use ($request): void {
                $deptId = $request->integer('department_id');
                $q->where(function ($sub) use ($deptId): void {
                    $sub->where('department_id', $deptId)
                        ->orWhereHas('departments', fn ($dq) => $dq->where('departments.id', $deptId));
                });
            })
            ->when($request->filled('position_id'), fn ($q) => $q->where('position_id', $request->integer('position_id')))
            ->orderBy($request->string('sort_by', 'first_name'), $request->string('sort_dir', 'asc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(EmployeeListResource::collection($employees));
    }

    public function store(StoreEmployeeRequest $request): JsonResponse
    {
        $this->authorize('create', Employee::class);

        $validated = $request->validated();
        $allowedDeptIds = $request->user()?->allowedDepartmentIds();
        if ($allowedDeptIds !== null) {
            $deptId = isset($validated['department_id']) ? (int) $validated['department_id'] : null;
            if (! $deptId || ! in_array($deptId, $allowedDeptIds, true)) {
                return $this->error('Sem permissão para criar funcionário fora dos departamentos atribuídos.', 403);
            }
        }

        $employee = DB::transaction(function () use ($request, $validated) {
            $employeeData = collect($validated)->except([
                'contract_type',
                'base_salary',
                'salary_frequency',
                'work_hours_per_week',
                'contract_start_date',
                'contract_end_date',
                'contract_signed_at',
                'contract_notes',
                'contract_file',
                'documents',
                'document_names',
                'document_types',
            ])->toArray();

            if (! isset($employeeData['employee_code'])) {
                $employeeData['employee_code'] = $this->generateEmployeeCode();
            }

            if ($request->hasFile('photo')) {
                $photoFile = $request->file('photo');
                $cldPhoto = app(CloudinaryService::class)->upload(
                    $photoFile,
                    'humancore/tenants/'.($employeeData['tenant_id'] ?? tenant_id()).'/photos',
                    'image'
                );
                $employeeData['photo_path'] = $cldPhoto['url'];
            }

            /** @var Employee $employee */
            $employeeData['approval_status'] = 'pending';
            $employeeData['approved_by'] = null;
            $employeeData['approved_at'] = null;
            $employee = Employee::query()->create($employeeData);

            // 1. Criar contrato caso tenham sido preenchidas informações de contrato
            $hasContractInfo = $request->filled('contract_type') ||
                $request->filled('base_salary') ||
                $request->filled('contract_start_date') ||
                $request->hasFile('contract_file');

            if ($hasContractInfo) {
                $contractDocPath = null;
                $contractFile = null;
                if ($request->hasFile('contract_file')) {
                    $contractFile = $request->file('contract_file');
                    $cldContract = app(CloudinaryService::class)->upload(
                        $contractFile,
                        'humancore/tenants/'.$employee->tenant_id.'/contracts',
                        'auto'
                    );
                    $contractDocPath = $cldContract['url'];
                }

                EmployeeContract::query()->create([
                    'employee_id' => $employee->id,
                    'tenant_id' => $employee->tenant_id,
                    'position_id' => $employee->position_id,
                    'department_id' => $employee->department_id,
                    'manager_id' => $employee->manager_id,
                    'contract_type' => $validated['contract_type'] ?? 'permanent',
                    'base_salary' => $validated['base_salary'] ?? 0,
                    'salary_frequency' => $validated['salary_frequency'] ?? 'monthly',
                    'work_hours_per_week' => $validated['work_hours_per_week'] ?? 40,
                    'start_date' => $validated['contract_start_date'] ?? ($employee->hired_at ?? now()->toDateString()),
                    'end_date' => $validated['contract_end_date'] ?? null,
                    'signed_at' => $validated['contract_signed_at'] ?? null,
                    'document_path' => $contractDocPath,
                    'notes' => $validated['contract_notes'] ?? null,
                    'is_active' => true,
                ]);

                if ($contractDocPath && $contractFile) {
                    EmployeeDocument::query()->create([
                        'employee_id' => $employee->id,
                        'tenant_id' => $employee->tenant_id,
                        'uploader_id' => $request->user()->id,
                        'name' => 'Contrato de Trabalho',
                        'document_type' => 'contract',
                        'file_path' => $contractDocPath,
                        'original_name' => $contractFile->getClientOriginalName(),
                        'mime_type' => $contractFile->getMimeType(),
                        'file_size' => $contractFile->getSize(),
                        'is_confidential' => false,
                        'is_verified' => false,
                    ]);
                }
            }

            // 2. Registar documentos adicionais enviados (Imagens ou PDFs)
            if ($request->hasFile('documents')) {
                $files = $request->file('documents');
                $docNames = $request->input('document_names', []);
                $docTypes = $request->input('document_types', []);
                $cld = app(CloudinaryService::class);

                foreach ($files as $idx => $docFile) {
                    $folder = 'humancore/tenants/'.$employee->tenant_id.'/documents';
                    $uploadRes = $cld->upload($docFile, $folder, 'auto');
                    $docUrl = $uploadRes['url'];

                    EmployeeDocument::query()->create([
                        'employee_id' => $employee->id,
                        'tenant_id' => $employee->tenant_id,
                        'uploader_id' => $request->user()->id,
                        'name' => $docNames[$idx] ?? $docFile->getClientOriginalName(),
                        'document_type' => $docTypes[$idx] ?? 'other',
                        'file_path' => $docUrl,
                        'original_name' => $docFile->getClientOriginalName(),
                        'mime_type' => $docFile->getMimeType(),
                        'file_size' => $uploadRes['bytes'] ?? $docFile->getSize(),
                        'is_confidential' => false,
                        'is_verified' => false,
                    ]);
                }
            }

            return $employee;
        });

        return $this->success(
            new EmployeeResource($employee->load('department', 'position', 'manager', 'activeContract', 'documents')),
            'Funcionário criado com sucesso.',
            201,
        );
    }

    public function show(Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        return $this->success(new EmployeeResource($employee->load('department', 'departments:id,name', 'position', 'manager', 'activeContract', 'latestContract', 'activeSchedule.shift')));
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $data = $request->validated();
        $user = $request->user();
        $fieldGroups = [
            'personal_identity' => ['first_name', 'last_name', 'birth_date', 'gender', 'marital_status', 'nationality', 'id_document_type', 'id_document_number', 'id_document_expiry'],
            'fiscal_ids' => ['tax_id', 'social_security_id'],
            'contact_address' => ['email', 'phone', 'alternative_phone', 'address', 'city', 'state', 'country', 'postal_code'],
            'organization' => ['department_id', 'position_id', 'manager_id', 'hired_at', 'probation_end', 'status', 'termination_at', 'termination_reason'],
            'salary' => ['overtime_hourly_rate'],
        ];

        foreach ($fieldGroups as $fieldGroup => $columns) {
            if ($user->hasFieldPermission('employee', $fieldGroup, 'edit')) {
                continue;
            }
            foreach ($columns as $column) {
                if (! array_key_exists($column, $data)) {
                    continue;
                }
                $currentValue = $employee->{$column};
                if ($currentValue instanceof \DateTimeInterface) {
                    $currentValue = $currentValue->format('Y-m-d');
                }
                if ((string) ($data[$column] ?? '') !== (string) ($currentValue ?? '')) {
                    return $this->error("Sem permissão para alterar o campo {$column}.", 403);
                }
                unset($data[$column]);
            }
        }

        if ($request->hasFile('photo')) {
            $tenantId = tenant_id() ?? $employee->tenant_id;
            $cld = app(CloudinaryService::class)->upload(
                $request->file('photo'),
                'humancore/tenants/'.$tenantId.'/photos',
                'image'
            );
            $data['photo_path'] = $cld['url'];
        }

        if (array_key_exists('approval_status', $data) && $data['approval_status'] !== ($employee->approval_status ?? 'approved')) {
            if ($data['approval_status'] === 'approved' && $employee->documents()->where('is_verified', false)->exists()) {
                return $this->error('Verifique todos os documentos anexados antes de aprovar o funcionário.', 422);
            }
            $data['approved_by'] = $data['approval_status'] === 'approved' ? $user->id : null;
            $data['approved_at'] = $data['approval_status'] === 'approved' ? now() : null;
        }

        $employee->update($data);

        return $this->success(new EmployeeResource($employee->fresh()->load('department', 'position', 'manager', 'activeContract', 'latestContract', 'activeSchedule.shift')), 'Funcionário atualizado com sucesso.');
    }

    public function updateApproval(Request $request, Employee $employee): JsonResponse
    {
        $user = $request->user();
        if (! $user->can('approve_employee') && ! $user->can('update_employee') && ! $user->hasRole('super-admin')) {
            $this->authorize('update', $employee);
        }

        $allowedDeptIds = $user->allowedDepartmentIds();
        if ($allowedDeptIds !== null && ! in_array((int) $employee->department_id, $allowedDeptIds, true)) {
            return $this->error('Sem permissão para aprovar funcionários fora dos departamentos atribuídos.', 403);
        }

        $validated = $request->validate([
            'approval_status' => ['required', 'in:pending,approved'],
        ]);

        $targetStatus = $validated['approval_status'];
        if ($targetStatus === 'approved' && $employee->documents()->where('is_verified', false)->exists()) {
            return $this->error('Todos os documentos anexados devem ser verificados antes de aprovar o funcionário.', 422);
        }

        $employee->update([
            'approval_status' => $targetStatus,
            'approved_by' => $targetStatus === 'approved' ? $user->id : null,
            'approved_at' => $targetStatus === 'approved' ? now() : null,
        ]);

        return $this->success(
            new EmployeeResource($employee->fresh()->load('department', 'position', 'manager', 'activeContract', 'latestContract', 'activeSchedule.shift')),
            $targetStatus === 'approved' ? 'Funcionário aprovado com sucesso.' : 'Funcionário movido para pendente.',
        );
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

        return $this->success(ContractResource::collection(
            $employee->contracts()->with('position', 'department')->orderByDesc('start_date')->orderByDesc('id')->get()
        ));
    }

    public function storeContract(StoreContractRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('create', EmployeeContract::class);

        if (! $employee->isApproved()) {
            return $this->error('O funcionário aguarda aprovação e verificação dos documentos.', 422);
        }

        $data = $request->validated();
        $data['employee_id'] = $employee->id;
        $data['tenant_id'] = $employee->tenant_id;

        $documentPath = null;
        $uploadedDocument = null;
        $contractFile = null;
        if ($request->hasFile('document')) {
            $contractFile = $request->file('document');
            $uploadedDocument = app(CloudinaryService::class)->upload(
                $contractFile,
                'humancore/tenants/'.$employee->tenant_id.'/contracts',
                'auto'
            );
            $documentPath = $uploadedDocument['url'];
        }
        unset($data['document']);
        $data['document_path'] = $documentPath;

        $contract = DB::transaction(function () use ($employee, $data, $request, $contractFile, $uploadedDocument) {
            EmployeeContract::query()
                ->where('employee_id', $employee->id)
                ->update(['is_active' => false]);
            $data['is_active'] = true;
            $contract = EmployeeContract::query()->create($data);
            $employee->update([
                'status' => 'active',
                'termination_at' => null,
                'termination_reason' => null,
                'position_id' => $contract->position_id,
                'department_id' => $contract->department_id,
                'manager_id' => $contract->manager_id,
            ]);

            if ($contractFile && $uploadedDocument) {
                EmployeeDocument::query()->create([
                    'employee_id' => $employee->id,
                    'tenant_id' => $employee->tenant_id,
                    'uploader_id' => $request->user()->id,
                    'name' => 'Contrato de Trabalho - '.$contract->start_date->format('Y-m-d'),
                    'document_type' => 'contract',
                    'file_path' => $uploadedDocument['url'],
                    'original_name' => $contractFile->getClientOriginalName(),
                    'mime_type' => $contractFile->getMimeType(),
                    'file_size' => $uploadedDocument['bytes'] ?? $contractFile->getSize(),
                    'is_confidential' => false,
                ]);
            }

            return $contract;
        });

        return $this->success(new ContractResource($contract->load('position', 'department')), 'Contrato criado com sucesso.', 201);
    }

    public function timeline(Request $request, Employee $employee, EmployeeHistoryService $historyService): JsonResponse
    {
        $this->authorize('view', $employee);

        $timeline = $historyService->forEmployee($employee, [
            'category' => $request->input('category'),
            'search' => $request->input('search'),
        ]);

        return $this->success($timeline);
    }

    protected function generateEmployeeCode(): string
    {
        $lastCode = Employee::query()->max('employee_code');
        $nextNumber = $lastCode ? ((int) str_replace('EMP-', '', $lastCode) + 1) : 1;

        return 'EMP-'.str_pad((string) $nextNumber, 4, '0', STR_PAD_LEFT);
    }
}
