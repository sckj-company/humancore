<?php

namespace App\Http\Controllers\Api\V1\Contract;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Employee\StoreContractRequest;
use App\Http\Resources\V1\ContractResource;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Services\CloudinaryService;
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

    public function update(StoreContractRequest $request, EmployeeContract $contract): JsonResponse
    {
        $this->authorize('update', $contract);

        $data = $request->validated();
        unset($data['document']);
        $uploaded = null;
        $file = null;

        if ($request->hasFile('document')) {
            $file = $request->file('document');
            $uploaded = app(CloudinaryService::class)->upload(
                $file,
                'humancore/tenants/'.$contract->tenant_id.'/contracts',
                'auto'
            );
            $data['document_path'] = $uploaded['url'];
        }

        $contract->update($data);
        if ($file && $uploaded) {
            EmployeeDocument::query()->create([
                'employee_id' => $contract->employee_id,
                'tenant_id' => $contract->tenant_id,
                'uploader_id' => $request->user()->id,
                'name' => 'Contrato de Trabalho - '.$contract->start_date->format('Y-m-d'),
                'document_type' => 'contract',
                'file_path' => $uploaded['url'],
                'original_name' => $file->getClientOriginalName(),
                'mime_type' => $file->getMimeType(),
                'file_size' => $uploaded['bytes'] ?? $file->getSize(),
                'is_confidential' => false,
            ]);
        }
        if ($contract->is_active && $contract->employee) {
            $contract->employee->update([
                'position_id' => $contract->position_id,
                'department_id' => $contract->department_id,
                'manager_id' => $contract->manager_id,
            ]);
        }

        return $this->success(
            new ContractResource($contract->fresh(['employee', 'position', 'department', 'manager'])),
            'Contrato atualizado com sucesso.'
        );
    }

    public function deactivate(Request $request, EmployeeContract $contract): JsonResponse
    {
        $this->authorize('update', $contract);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
            'end_date' => ['nullable', 'date'],
        ]);

        $endDate = $validated['end_date'] ?? now()->toDateString();
        $reasonText = $validated['reason'];
        $updatedNotes = trim(($contract->notes ? $contract->notes . "\n" : '') . '[Desativado em ' . now()->format('Y-m-d') . ']: ' . $reasonText);

        $contract->update([
            'is_active' => false,
            'end_date' => $endDate,
            'notes' => $updatedNotes,
        ]);

        if ($contract->employee) {
            $contract->employee->update([
                'status' => 'inactive',
                'termination_at' => $endDate,
                'termination_reason' => $reasonText,
            ]);
        }

        return $this->success(new ContractResource($contract->fresh(['employee', 'position', 'department', 'manager'])), 'Contrato desativado com sucesso.');
    }
}
