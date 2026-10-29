<?php

namespace App\Http\Controllers\Api\V1\Compensation;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\BenefitResource;
use App\Models\Benefit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BenefitController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Benefit::class);

        $benefits = Benefit::query()
            ->with(['employee:id,first_name,last_name,employee_code'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('name', 'like', "%{$term}%")
                    ->orWhere('provider', 'like', "%{$term}%")
                    ->orWhereHas('employee', function ($eq) use ($term) {
                        $eq->where('first_name', 'like', "%{$term}%")
                            ->orWhere('last_name', 'like', "%{$term}%")
                            ->orWhere('employee_code', 'like', "%{$term}%");
                    });
            })
            ->when($request->filled('benefit_type'), fn ($q) => $q->where('benefit_type', $request->string('benefit_type')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->orderBy($request->string('sort_by', 'created_at'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(BenefitResource::collection($benefits));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Benefit::class);

        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:employees,id'],
            'name' => ['required', 'string', 'max:255'],
            'benefit_type' => ['required', 'in:'.implode(',', array_keys(Benefit::TYPES))],
            'amount_type' => ['required', 'in:'.implode(',', array_keys(Benefit::AMOUNT_TYPES))],
            'amount' => ['required_if:amount_type,fixed', 'nullable', 'numeric', 'min:0'],
            'percentage' => ['required_if:amount_type,percentage', 'nullable', 'numeric', 'min:0', 'max:100'],
            'is_taxable' => ['nullable', 'boolean'],
            'provider' => ['nullable', 'string', 'max:255'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['nullable', 'in:'.implode(',', array_keys(Benefit::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['status'] = $data['status'] ?? 'active';

        $benefit = Benefit::query()->create($data);

        return $this->success(
            new BenefitResource($benefit->load('employee')),
            'Benefício criado com sucesso.',
            201,
        );
    }

    public function show(Benefit $benefit): JsonResponse
    {
        $this->authorize('view', $benefit);

        return $this->success(new BenefitResource($benefit->load('employee')));
    }

    public function update(Request $request, Benefit $benefit): JsonResponse
    {
        $this->authorize('update', $benefit);

        $data = $request->validate([
            'employee_id' => ['sometimes', 'integer', 'exists:employees,id'],
            'name' => ['sometimes', 'string', 'max:255'],
            'benefit_type' => ['sometimes', 'in:'.implode(',', array_keys(Benefit::TYPES))],
            'amount_type' => ['sometimes', 'in:'.implode(',', array_keys(Benefit::AMOUNT_TYPES))],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'percentage' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'is_taxable' => ['nullable', 'boolean'],
            'provider' => ['nullable', 'string', 'max:255'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'status' => ['sometimes', 'in:'.implode(',', array_keys(Benefit::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $benefit->update($data);

        return $this->success(
            new BenefitResource($benefit->fresh()->load('employee')),
            'Benefício atualizado com sucesso.',
        );
    }

    public function destroy(Benefit $benefit): JsonResponse
    {
        $this->authorize('delete', $benefit);

        $benefit->delete();

        return $this->success(null, 'Benefício removido com sucesso.');
    }
}
