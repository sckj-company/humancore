<?php

namespace App\Http\Controllers\Api\V1\Compensation;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\DeductionResource;
use App\Models\Deduction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class DeductionController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Deduction::class);

        $deductions = Deduction::query()
            ->with(['employee:id,first_name,last_name,employee_code', 'approver:id,name'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('name', 'like', "%{$term}%")
                    ->orWhereHas('employee', function ($eq) use ($term) {
                        $eq->where('first_name', 'like', "%{$term}%")
                            ->orWhere('last_name', 'like', "%{$term}%")
                            ->orWhere('employee_code', 'like', "%{$term}%");
                    });
            })
            ->when($request->filled('deduction_type'), fn ($q) => $q->where('deduction_type', $request->string('deduction_type')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->orderBy($request->string('sort_by', 'created_at'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(DeductionResource::collection($deductions));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Deduction::class);

        $data = $request->validate([
            'employee_id' => ['required', 'integer', Rule::exists('employees', 'id')->where('tenant_id', tenant_id())],
            'name' => ['required', 'string', 'max:255'],
            'deduction_type' => ['required', 'string', 'max:50'],
            'amount_type' => ['required', 'in:'.implode(',', array_keys(Deduction::AMOUNT_TYPES))],
            'amount' => ['required_if:amount_type,fixed', 'nullable', 'numeric', 'min:0'],
            'percentage' => ['required_if:amount_type,percentage', 'nullable', 'numeric', 'min:0', 'max:100'],
            'total_amount' => [
                'nullable',
                'numeric',
                'min:0',
                Rule::requiredIf(fn () => $request->input('amount_type') === 'percentage' && $request->filled('installment_count')),
            ],
            'installment_count' => ['nullable', 'integer', 'min:1'],
            'is_recurring' => ['nullable', 'boolean'],
            'is_mandatory' => ['nullable', 'boolean'],
            'legal_basis' => ['nullable', 'string', 'max:1000'],
            'status' => ['nullable', 'in:'.implode(',', array_keys(Deduction::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['status'] = $data['status'] ?? 'active';
        $data['paid_amount'] = 0;

        if (($data['amount_type'] ?? '') === 'fixed' && filled($data['installment_count'] ?? null)) {
            $data['total_amount'] = filled($data['total_amount'] ?? null)
                ? (float) $data['total_amount']
                : round((float) $data['amount'] * (int) $data['installment_count'], 2);
            $data['installment_amount'] = round($data['total_amount'] / (int) $data['installment_count'], 2);
            $data['amount'] = $data['installment_amount'];
        } else {
            $data['installment_amount'] = null;
        }

        $deduction = Deduction::query()->create($data);

        return $this->success(
            new DeductionResource($deduction->load('employee')),
            'Desconto criado com sucesso.',
            201,
        );
    }

    public function show(Deduction $deduction): JsonResponse
    {
        $this->authorize('view', $deduction);

        return $this->success(new DeductionResource($deduction->load('employee', 'approver')));
    }

    public function update(Request $request, Deduction $deduction): JsonResponse
    {
        $this->authorize('update', $deduction);

        $data = $request->validate([
            'employee_id' => ['sometimes', 'integer', Rule::exists('employees', 'id')->where('tenant_id', tenant_id())],
            'name' => ['sometimes', 'string', 'max:255'],
            'deduction_type' => ['sometimes', 'string', 'max:50'],
            'amount_type' => ['sometimes', 'in:'.implode(',', array_keys(Deduction::AMOUNT_TYPES))],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'percentage' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'total_amount' => [
                'nullable',
                'numeric',
                'min:0',
                Rule::requiredIf(fn () => $request->input('amount_type', $deduction->amount_type) === 'percentage'
                    && ($request->exists('installment_count')
                        ? $request->filled('installment_count')
                        : $deduction->installment_count !== null)),
            ],
            'installment_count' => ['nullable', 'integer', 'min:1'],
            'is_recurring' => ['nullable', 'boolean'],
            'is_mandatory' => ['sometimes', 'boolean'],
            'legal_basis' => ['nullable', 'string', 'max:1000'],
            'status' => ['sometimes', 'in:'.implode(',', array_keys(Deduction::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $amountType = $data['amount_type'] ?? $deduction->amount_type;
        $totalAmount = array_key_exists('total_amount', $data) ? $data['total_amount'] : $deduction->total_amount;
        $installmentCount = array_key_exists('installment_count', $data) ? $data['installment_count'] : $deduction->installment_count;

        if ($amountType === 'fixed' && filled($installmentCount)) {
            $totalAmount = filled($totalAmount)
                ? (float) $totalAmount
                : round((float) ($data['amount'] ?? $deduction->amount) * (int) $installmentCount, 2);
            $data['total_amount'] = $totalAmount;
            $data['installment_amount'] = round(((float) $totalAmount) / ((int) $installmentCount), 2);
            $data['amount'] = $data['installment_amount'];
        } else {
            $data['installment_amount'] = null;
        }

        $deduction->update($data);

        return $this->success(
            new DeductionResource($deduction->fresh()->load('employee', 'approver')),
            'Desconto atualizado com sucesso.',
        );
    }

    public function destroy(Deduction $deduction): JsonResponse
    {
        $this->authorize('delete', $deduction);

        $deduction->delete();

        return $this->success(null, 'Desconto removido com sucesso.');
    }

    public function approve(Request $request, Deduction $deduction): JsonResponse
    {
        $this->authorize('approve', $deduction);

        if ($deduction->status !== 'active') {
            return $this->error('Só descontos ativos podem ser aprovados.', 422);
        }

        $deduction->update([
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
        ]);

        return $this->success(
            new DeductionResource($deduction->fresh()->load('employee', 'approver')),
            'Desconto aprovado com sucesso.',
        );
    }
}
