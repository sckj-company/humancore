<?php

namespace App\Http\Controllers\Api\V1\Organization;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Organization\StoreBranchRequest;
use App\Http\Requests\V1\Organization\UpdateBranchRequest;
use App\Http\Resources\V1\BranchResource;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Branch::class);

        $branches = Branch::query()
            ->withCount('departments')
            ->orderBy('name')
            ->get();

        return $this->success(BranchResource::collection($branches));
    }

    public function store(StoreBranchRequest $request): JsonResponse
    {
        $this->authorize('create', Branch::class);

        $branch = Branch::query()->create($request->validated());

        return $this->success(new BranchResource($branch), 'Filial criada com sucesso.', 201);
    }

    public function show(Branch $branch): JsonResponse
    {
        $this->authorize('view', $branch);

        return $this->success(new BranchResource($branch));
    }

    public function update(UpdateBranchRequest $request, Branch $branch): JsonResponse
    {
        $this->authorize('update', $branch);

        $branch->update($request->validated());

        return $this->success(new BranchResource($branch->fresh()), 'Filial atualizada com sucesso.');
    }

    public function destroy(Branch $branch): JsonResponse
    {
        $this->authorize('delete', $branch);

        $branch->delete();

        return $this->success(null, 'Filial eliminada com sucesso.');
    }
}
