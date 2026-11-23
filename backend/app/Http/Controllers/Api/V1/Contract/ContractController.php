<?php

namespace App\Http\Controllers\Api\V1\Contract;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Employee\StoreContractRequest;
use App\Http\Resources\V1\ContractResource;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Services\CloudinaryService;
use App\Services\Contract\ContractTerminationService;
use App\Support\PdfDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response;

class ContractController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', EmployeeContract::class);

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();

        $contracts = EmployeeContract::query()
            ->with(['employee:id,first_name,last_name,employee_code,department_id', 'position:id,title', 'department:id,name'])
            ->when($allowedDeptIds !== null, fn ($q) => $q->whereHas('employee', fn ($eq) => $eq->whereIn('department_id', $allowedDeptIds)))
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
        $user = $request->user();
        if (
            array_key_exists('base_salary', $data)
            && (float) $data['base_salary'] !== (float) $contract->base_salary
            && ! $user->hasFieldPermission('contract', 'base_salary', 'edit')
            && ! $user->hasFieldPermission('employee', 'salary', 'edit')
        ) {
            return $this->error('Sem permissão para alterar o salário base do contrato.', 403);
        }
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

    public function terminationPreview(Request $request, EmployeeContract $contract, ContractTerminationService $service): JsonResponse
    {
        $this->authorize('view', $contract);

        $validated = $request->validate([
            'termination_type' => ['nullable', 'string', Rule::in(array_keys(ContractTerminationService::TERMINATION_TYPES))],
            'termination_date' => ['nullable', 'date'],
            'termination_reason' => ['nullable', 'string', 'max:2000'],
            'worked_days_in_month' => ['nullable', 'numeric', 'min:0', 'max:31'],
            'months_worked_in_year' => ['nullable', 'numeric', 'min:0', 'max:12'],
            'unused_vacation_days' => ['nullable', 'numeric', 'min:0', 'max:120'],
            'notice_days_required' => ['nullable', 'integer', 'min:0', 'max:180'],
            'notice_days_served' => ['nullable', 'integer', 'min:0', 'max:180'],
            'unjustified_absence_days' => ['nullable', 'numeric', 'min:0', 'max:31'],
            'custom_severance_amount' => ['nullable', 'numeric', 'min:0'],
            'include_vacation_subsidy' => ['nullable', 'boolean'],
            'include_christmas_subsidy' => ['nullable', 'boolean'],
            'include_severance' => ['nullable', 'boolean'],
            'apply_taxes' => ['nullable', 'boolean'],
            'discount_pending_deductions' => ['nullable', 'boolean'],
            'discount_unreturned_assets' => ['nullable', 'boolean'],
            'discount_attendance_pendencies' => ['nullable', 'boolean'],
            'extra_earnings' => ['nullable', 'array'],
            'extra_earnings.*.name' => ['required_with:extra_earnings', 'string', 'max:190'],
            'extra_earnings.*.amount' => ['required_with:extra_earnings', 'numeric', 'min:0'],
            'extra_deductions' => ['nullable', 'array'],
            'extra_deductions.*.name' => ['required_with:extra_deductions', 'string', 'max:190'],
            'extra_deductions.*.amount' => ['required_with:extra_deductions', 'numeric', 'min:0'],
        ]);

        return $this->success($service->calculatePreview($contract, $validated));
    }

    public function terminate(Request $request, EmployeeContract $contract, ContractTerminationService $service): JsonResponse
    {
        $this->authorize('update', $contract);

        $validated = $request->validate([
            'termination_type' => ['required', 'string', Rule::in(array_keys(ContractTerminationService::TERMINATION_TYPES))],
            'termination_date' => ['required', 'date'],
            'termination_reason' => ['required', 'string', 'max:2000'],
            'worked_days_in_month' => ['nullable', 'numeric', 'min:0', 'max:31'],
            'months_worked_in_year' => ['nullable', 'numeric', 'min:0', 'max:12'],
            'unused_vacation_days' => ['nullable', 'numeric', 'min:0', 'max:120'],
            'notice_days_required' => ['nullable', 'integer', 'min:0', 'max:180'],
            'notice_days_served' => ['nullable', 'integer', 'min:0', 'max:180'],
            'unjustified_absence_days' => ['nullable', 'numeric', 'min:0', 'max:31'],
            'custom_severance_amount' => ['nullable', 'numeric', 'min:0'],
            'include_vacation_subsidy' => ['nullable', 'boolean'],
            'include_christmas_subsidy' => ['nullable', 'boolean'],
            'include_severance' => ['nullable', 'boolean'],
            'apply_taxes' => ['nullable', 'boolean'],
            'discount_pending_deductions' => ['nullable', 'boolean'],
            'discount_unreturned_assets' => ['nullable', 'boolean'],
            'discount_attendance_pendencies' => ['nullable', 'boolean'],
            'extra_earnings' => ['nullable', 'array'],
            'extra_earnings.*.name' => ['required_with:extra_earnings', 'string', 'max:190'],
            'extra_earnings.*.amount' => ['required_with:extra_earnings', 'numeric', 'min:0'],
            'extra_deductions' => ['nullable', 'array'],
            'extra_deductions.*.name' => ['required_with:extra_deductions', 'string', 'max:190'],
            'extra_deductions.*.amount' => ['required_with:extra_deductions', 'numeric', 'min:0'],
        ]);

        $settlement = $service->executeTermination($contract, $validated, $request->user());

        return $this->success([
            'contract' => new ContractResource($contract->fresh(['employee', 'position', 'department', 'manager'])),
            'settlement' => $settlement,
        ], 'Contrato rescindido e acerto final calculado com sucesso.');
    }

    public function terminationPdf(Request $request, EmployeeContract $contract, ContractTerminationService $service): Response
    {
        $this->authorize('view', $contract);

        $contract->loadMissing(['employee.department', 'employee.position', 'position', 'department', 'tenant']);
        $settlement = is_array($contract->settlement_breakdown) && ! empty($contract->settlement_breakdown['totals'])
            ? $contract->settlement_breakdown
            : $service->calculatePreview($contract, $request->all());

        $pdf = PdfDocument::make('pdf.contract-termination', [
            'contract' => $contract,
            'employee' => $contract->employee,
            'tenant' => $contract->tenant,
            'settlement' => $settlement,
        ], 'a4', 'portrait', $request->input('lang', 'pt'));

        $code = $contract->employee?->employee_code ?? $contract->id;

        return $pdf->download("termo-rescisao-{$code}.pdf");
    }
}
