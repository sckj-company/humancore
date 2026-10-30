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
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

        $validated = $request->validated();

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
                $cldPhoto = app(\App\Services\CloudinaryService::class)->upload(
                    $photoFile,
                    'humancore/tenants/'.($employeeData['tenant_id'] ?? tenant_id()).'/photos',
                    'image'
                );
                $employeeData['photo_path'] = $cldPhoto['url'];
            }

            /** @var Employee $employee */
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
                    $cldContract = app(\App\Services\CloudinaryService::class)->upload(
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
                    ]);
                }
            }

            // 2. Registar documentos adicionais enviados (Imagens ou PDFs)
            if ($request->hasFile('documents')) {
                $files = $request->file('documents');
                $docNames = $request->input('document_names', []);
                $docTypes = $request->input('document_types', []);
                $cld = app(\App\Services\CloudinaryService::class);

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

        return $this->success(new EmployeeResource($employee->load('department', 'position', 'manager', 'activeContract', 'activeSchedule.shift')));
    }

    public function update(UpdateEmployeeRequest $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $data = $request->validated();

        if ($request->hasFile('photo')) {
            $tenantId = tenant_id() ?? $employee->tenant_id;
            $cld = app(\App\Services\CloudinaryService::class)->upload(
                $request->file('photo'),
                'humancore/tenants/'.$tenantId.'/photos',
                'image'
            );
            $data['photo_path'] = $cld['url'];
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
            $cld = app(\App\Services\CloudinaryService::class)->upload(
                $request->file('document'),
                'humancore/tenants/'.$employee->tenant_id.'/contracts',
                'auto'
            );
            $documentPath = $cld['url'];
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
