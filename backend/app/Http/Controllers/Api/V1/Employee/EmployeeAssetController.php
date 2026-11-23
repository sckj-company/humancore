<?php

namespace App\Http\Controllers\Api\V1\Employee;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Employee;
use App\Models\EmployeeAsset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmployeeAssetController extends BaseController
{
    public function index(Request $request, Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        $assets = EmployeeAsset::query()
            ->where('employee_id', $employee->id)
            ->with('assignedByUser:id,name')
            ->orderByRaw("CASE status WHEN 'assigned' THEN 1 WHEN 'damaged_pending' THEN 2 WHEN 'lost_unreturned' THEN 3 WHEN 'maintenance' THEN 4 ELSE 5 END")
            ->orderByDesc('assigned_at')
            ->orderByDesc('id')
            ->get();

        $formatted = $assets->map(fn (EmployeeAsset $asset) => $this->formatAsset($asset))->values();

        $summary = [
            'total_count' => $assets->count(),
            'assigned_count' => $assets->where('status', 'assigned')->count(),
            'returned_count' => $assets->where('status', 'returned')->count(),
            'issue_count' => $assets->filter(fn (EmployeeAsset $a) => in_array($a->status, ['damaged_pending', 'lost_unreturned'], true) || in_array($a->condition, ['damaged', 'lost'], true))->count(),
            'total_estimated_value' => round((float) $assets->sum('estimated_value'), 2),
            'active_assigned_value' => round((float) $assets->where('status', 'assigned')->sum('estimated_value'), 2),
            'pending_liability_amount' => round((float) $assets->sum(fn (EmployeeAsset $a) => $a->pendingLiabilityAmount()), 2),
        ];

        return $this->success([
            'items' => $formatted,
            'summary' => $summary,
        ]);
    }

    public function store(Request $request, Employee $employee): JsonResponse
    {
        $this->authorize('update', $employee);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:190'],
            'category' => ['required', 'string', Rule::in(array_keys(EmployeeAsset::CATEGORIES))],
            'asset_code' => ['nullable', 'string', 'max:100'],
            'serial_number' => ['nullable', 'string', 'max:150'],
            'brand_model' => ['nullable', 'string', 'max:150'],
            'condition' => ['required', 'string', Rule::in(array_keys(EmployeeAsset::CONDITIONS))],
            'status' => ['required', 'string', Rule::in(array_keys(EmployeeAsset::STATUSES))],
            'estimated_value' => ['nullable', 'numeric', 'min:0'],
            'chargeable_amount' => ['nullable', 'numeric', 'min:0'],
            'deduct_on_termination' => ['nullable', 'boolean'],
            'is_settled' => ['nullable', 'boolean'],
            'assigned_at' => ['nullable', 'date'],
            'expected_return_at' => ['nullable', 'date'],
            'returned_at' => ['nullable', 'date'],
            'return_notes' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $asset = EmployeeAsset::query()->create([
            'tenant_id' => $employee->tenant_id,
            'employee_id' => $employee->id,
            'name' => $data['name'],
            'category' => $data['category'],
            'asset_code' => $data['asset_code'] ?? null,
            'serial_number' => $data['serial_number'] ?? null,
            'brand_model' => $data['brand_model'] ?? null,
            'condition' => $data['condition'],
            'status' => $data['status'],
            'estimated_value' => (float) ($data['estimated_value'] ?? 0),
            'chargeable_amount' => (float) ($data['chargeable_amount'] ?? 0),
            'deduct_on_termination' => (bool) ($data['deduct_on_termination'] ?? true),
            'is_settled' => (bool) ($data['is_settled'] ?? false),
            'assigned_at' => $data['assigned_at'] ?? now()->toDateString(),
            'expected_return_at' => $data['expected_return_at'] ?? null,
            'returned_at' => $data['returned_at'] ?? ($data['status'] === 'returned' ? now()->toDateString() : null),
            'assigned_by' => $request->user()?->id,
            'return_notes' => $data['return_notes'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        $asset->load('assignedByUser:id,name');

        return $this->success($this->formatAsset($asset), 'Activo atribuído com sucesso.', 201);
    }

    public function update(Request $request, Employee $employee, EmployeeAsset $asset): JsonResponse
    {
        $this->authorize('update', $employee);

        if ((int) $asset->employee_id !== (int) $employee->id) {
            return $this->error('O activo não pertence a este funcionário.', 404);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:190'],
            'category' => ['sometimes', 'required', 'string', Rule::in(array_keys(EmployeeAsset::CATEGORIES))],
            'asset_code' => ['nullable', 'string', 'max:100'],
            'serial_number' => ['nullable', 'string', 'max:150'],
            'brand_model' => ['nullable', 'string', 'max:150'],
            'condition' => ['sometimes', 'required', 'string', Rule::in(array_keys(EmployeeAsset::CONDITIONS))],
            'status' => ['sometimes', 'required', 'string', Rule::in(array_keys(EmployeeAsset::STATUSES))],
            'estimated_value' => ['nullable', 'numeric', 'min:0'],
            'chargeable_amount' => ['nullable', 'numeric', 'min:0'],
            'deduct_on_termination' => ['nullable', 'boolean'],
            'is_settled' => ['nullable', 'boolean'],
            'assigned_at' => ['nullable', 'date'],
            'expected_return_at' => ['nullable', 'date'],
            'returned_at' => ['nullable', 'date'],
            'return_notes' => ['nullable', 'string', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        if (($data['status'] ?? null) === 'returned' && empty($data['returned_at']) && ! $asset->returned_at) {
            $data['returned_at'] = now()->toDateString();
        }

        $asset->update($data);
        $asset->load('assignedByUser:id,name');

        return $this->success($this->formatAsset($asset), 'Activo atualizado com sucesso.');
    }

    public function destroy(Request $request, Employee $employee, EmployeeAsset $asset): JsonResponse
    {
        $this->authorize('update', $employee);

        if ((int) $asset->employee_id !== (int) $employee->id) {
            return $this->error('O activo não pertence a este funcionário.', 404);
        }

        $asset->delete();

        return $this->success(null, 'Activo removido com sucesso.');
    }

    protected function formatAsset(EmployeeAsset $asset): array
    {
        return [
            'id' => $asset->id,
            'employee_id' => $asset->employee_id,
            'tenant_id' => $asset->tenant_id,
            'name' => $asset->name,
            'category' => $asset->category,
            'category_label' => EmployeeAsset::CATEGORIES[$asset->category] ?? $asset->category,
            'asset_code' => $asset->asset_code,
            'serial_number' => $asset->serial_number,
            'brand_model' => $asset->brand_model,
            'condition' => $asset->condition,
            'condition_label' => EmployeeAsset::CONDITIONS[$asset->condition] ?? $asset->condition,
            'status' => $asset->status,
            'status_label' => EmployeeAsset::STATUSES[$asset->status] ?? $asset->status,
            'estimated_value' => (float) $asset->estimated_value,
            'chargeable_amount' => (float) $asset->chargeable_amount,
            'pending_liability_amount' => $asset->pendingLiabilityAmount(),
            'deduct_on_termination' => (bool) $asset->deduct_on_termination,
            'is_settled' => (bool) $asset->is_settled,
            'assigned_at' => $asset->assigned_at?->format('Y-m-d'),
            'expected_return_at' => $asset->expected_return_at?->format('Y-m-d'),
            'returned_at' => $asset->returned_at?->format('Y-m-d'),
            'assigned_by' => $asset->assignedByUser ? [
                'id' => $asset->assignedByUser->id,
                'name' => $asset->assignedByUser->name,
            ] : null,
            'return_notes' => $asset->return_notes,
            'notes' => $asset->notes,
            'created_at' => $asset->created_at?->toIso8601String(),
            'updated_at' => $asset->updated_at?->toIso8601String(),
        ];
    }
}
