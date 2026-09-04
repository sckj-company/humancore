<?php

namespace App\Http\Controllers\Api\V1\Performance;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Performance\StorePerformanceEvaluationRequest;
use App\Http\Requests\V1\Performance\UpdatePerformanceEvaluationRequest;
use App\Http\Resources\V1\PerformanceEvaluationResource;
use App\Models\PerformanceEvaluation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PerformanceEvaluationController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', PerformanceEvaluation::class);

        $evaluations = PerformanceEvaluation::query()
            ->with(['employee:id,first_name,last_name,employee_code', 'evaluator:id,name', 'approver:id,name'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where(function ($qq) use ($term) {
                    $qq->where('period', 'like', "%{$term}%")
                        ->orWhere('comments', 'like', "%{$term}%")
                        ->orWhereHas('employee', function ($eq) use ($term) {
                            $eq->where('first_name', 'like', "%{$term}%")
                                ->orWhere('last_name', 'like', "%{$term}%")
                                ->orWhere('employee_code', 'like', "%{$term}%");
                        });
                });
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('cycle'), fn ($q) => $q->where('cycle', $request->string('cycle')))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->orderBy($request->string('sort_by', 'period_end'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(PerformanceEvaluationResource::collection($evaluations));
    }

    public function store(StorePerformanceEvaluationRequest $request): JsonResponse
    {
        $this->authorize('create', PerformanceEvaluation::class);

        $data = $request->validated();
        $data['tenant_id'] = tenant_id();
        $data['evaluator_id'] = $data['evaluator_id'] ?? $request->user()->id;
        $data['status'] = $data['status'] ?? 'draft';

        if ($data['status'] === 'submitted' && empty($data['submitted_at'])) {
            $data['submitted_at'] = now();
        }

        $evaluation = PerformanceEvaluation::query()->create($data);

        return $this->success(
            new PerformanceEvaluationResource($evaluation->load('employee', 'evaluator')),
            'Avaliação criada com sucesso.',
            201,
        );
    }

    public function show(PerformanceEvaluation $evaluation): JsonResponse
    {
        $this->authorize('view', $evaluation);

        return $this->success(new PerformanceEvaluationResource(
            $evaluation->load('employee', 'evaluator', 'approver')
        ));
    }

    public function update(UpdatePerformanceEvaluationRequest $request, PerformanceEvaluation $evaluation): JsonResponse
    {
        $this->authorize('update', $evaluation);

        $data = $request->validated();

        if (isset($data['status']) && $data['status'] === 'submitted' && ! $evaluation->submitted_at) {
            $data['submitted_at'] = now();
        }

        $evaluation->update($data);

        return $this->success(
            new PerformanceEvaluationResource($evaluation->fresh()->load('employee', 'evaluator', 'approver')),
            'Avaliação atualizada com sucesso.'
        );
    }

    public function destroy(PerformanceEvaluation $evaluation): JsonResponse
    {
        $this->authorize('delete', $evaluation);

        $evaluation->delete();

        return $this->success(null, 'Avaliação removida com sucesso.');
    }

    public function approve(Request $request, PerformanceEvaluation $evaluation): JsonResponse
    {
        $this->authorize('update', $evaluation);

        if ($evaluation->status !== 'submitted') {
            return $this->error('Só avaliações submetidas podem ser aprovadas.', 422);
        }

        $evaluation->update([
            'status' => 'approved',
            'approved_at' => now(),
            'approved_by' => $request->user()->id,
        ]);

        return $this->success(
            new PerformanceEvaluationResource($evaluation->fresh()->load('employee', 'evaluator', 'approver')),
            'Avaliação aprovada com sucesso.'
        );
    }

    public function reject(Request $request, PerformanceEvaluation $evaluation): JsonResponse
    {
        $this->authorize('update', $evaluation);

        $evaluation->update([
            'status' => 'rejected',
            'approved_by' => $request->user()->id,
            'approved_at' => now(),
        ]);

        return $this->success(
            new PerformanceEvaluationResource($evaluation->fresh()->load('employee', 'evaluator', 'approver')),
            'Avaliação rejeitada.'
        );
    }
}
