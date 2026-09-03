<?php

namespace App\Http\Controllers\Api\V1\Organization;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Organization\StorePositionRequest;
use App\Http\Requests\V1\Organization\UpdatePositionRequest;
use App\Http\Resources\V1\PositionResource;
use App\Models\Position;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PositionController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Position::class);

        $positions = Position::query()
            ->with('department')
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->integer('department_id')))
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', '%'.$request->string('search').'%'))
            ->orderBy('title')
            ->get();

        return $this->success(PositionResource::collection($positions));
    }

    public function store(StorePositionRequest $request): JsonResponse
    {
        $this->authorize('create', Position::class);

        $position = Position::query()->create($request->validated());

        return $this->success(new PositionResource($position), 'Cargo criado com sucesso.', 201);
    }

    public function show(Position $position): JsonResponse
    {
        $this->authorize('view', $position);

        return $this->success(new PositionResource($position->load('department')));
    }

    public function update(UpdatePositionRequest $request, Position $position): JsonResponse
    {
        $this->authorize('update', $position);

        $position->update($request->validated());

        return $this->success(new PositionResource($position->fresh()), 'Cargo atualizado com sucesso.');
    }

    public function destroy(Position $position): JsonResponse
    {
        $this->authorize('delete', $position);

        $position->delete();

        return $this->success(null, 'Cargo eliminado com sucesso.');
    }
}
