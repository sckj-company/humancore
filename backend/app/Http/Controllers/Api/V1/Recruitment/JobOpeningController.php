<?php

namespace App\Http\Controllers\Api\V1\Recruitment;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\JobOpeningResource;
use App\Models\JobOpening;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class JobOpeningController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', JobOpening::class);

        $jobs = JobOpening::query()
            ->with(['department:id,name', 'position:id,title', 'createdBy:id,name'])
            ->withCount('candidates')
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('title', 'like', "%{$term}%")
                    ->orWhere('description', 'like', "%{$term}%")
                    ->orWhere('location', 'like', "%{$term}%");
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('department_id'), fn ($q) => $q->where('department_id', $request->integer('department_id')))
            ->when($request->filled('employment_type'), fn ($q) => $q->where('employment_type', $request->string('employment_type')))
            ->when($request->filled('experience_level'), fn ($q) => $q->where('experience_level', $request->string('experience_level')))
            ->orderBy($request->string('sort_by', 'created_at'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(JobOpeningResource::collection($jobs));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', JobOpening::class);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:10000'],
            'requirements' => ['nullable', 'string', 'max:10000'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'location' => ['nullable', 'string', 'max:255'],
            'employment_type' => ['nullable', 'in:'.implode(',', array_keys(JobOpening::EMPLOYMENT_TYPES))],
            'experience_level' => ['nullable', 'in:'.implode(',', array_keys(JobOpening::EXPERIENCE_LEVELS))],
            'salary_min' => ['nullable', 'numeric', 'min:0'],
            'salary_max' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
            'openings_count' => ['nullable', 'integer', 'min:1'],
            'closes_at' => ['nullable', 'date', 'after:today'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['created_by'] = $request->user()->id;
        $data['status'] = 'draft';
        $data['currency'] = $data['currency'] ?? 'AOA';
        $data['openings_count'] = $data['openings_count'] ?? 1;

        $job = JobOpening::query()->create($data);

        return $this->success(
            new JobOpeningResource($job->load(['department', 'position', 'createdBy'])),
            'Vaga criada com sucesso.',
            201,
        );
    }

    public function show(JobOpening $job): JsonResponse
    {
        $this->authorize('view', $job);

        return $this->success(new JobOpeningResource(
            $job->load(['department', 'position', 'createdBy', 'candidates'])
                ->loadCount('candidates')
        ));
    }

    public function update(Request $request, JobOpening $job): JsonResponse
    {
        $this->authorize('update', $job);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:10000'],
            'requirements' => ['nullable', 'string', 'max:10000'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'location' => ['nullable', 'string', 'max:255'],
            'employment_type' => ['nullable', 'in:'.implode(',', array_keys(JobOpening::EMPLOYMENT_TYPES))],
            'experience_level' => ['nullable', 'in:'.implode(',', array_keys(JobOpening::EXPERIENCE_LEVELS))],
            'salary_min' => ['nullable', 'numeric', 'min:0'],
            'salary_max' => ['nullable', 'numeric', 'min:0'],
            'currency' => ['nullable', 'string', 'size:3'],
            'openings_count' => ['nullable', 'integer', 'min:1'],
            'closes_at' => ['nullable', 'date'],
            'status' => ['sometimes', 'in:'.implode(',', array_keys(JobOpening::STATUSES))],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        if (isset($data['status'])) {
            if ($data['status'] === 'closed' && ! $job->closed_at) {
                $data['closed_at'] = now();
            }
            if ($data['status'] === 'open' && ! $job->published_at) {
                $data['published_at'] = now();
            }
        }

        $job->update($data);

        return $this->success(
            new JobOpeningResource($job->fresh()->load(['department', 'position', 'createdBy'])),
            'Vaga atualizada com sucesso.',
        );
    }

    public function destroy(JobOpening $job): JsonResponse
    {
        $this->authorize('delete', $job);

        if ($job->status === 'open' && $job->candidates()->whereNotIn('status', ['rejected', 'withdrawn'])->exists()) {
            return $this->error('Não é possível remover uma vaga aberta com candidatos ativos.', 422);
        }

        $job->delete();

        return $this->success(null, 'Vaga removida com sucesso.');
    }

    public function publish(Request $request, JobOpening $job): JsonResponse
    {
        $this->authorize('update', $job);

        if ($job->status !== 'draft' && $job->status !== 'on_hold') {
            return $this->error('Só vagas em rascunho ou em pausa podem ser publicadas.', 422);
        }

        $job->update([
            'status' => 'open',
            'published_at' => now(),
        ]);

        return $this->success(
            new JobOpeningResource($job->fresh()),
            'Vaga publicada com sucesso.',
        );
    }

    public function close(Request $request, JobOpening $job): JsonResponse
    {
        $this->authorize('update', $job);

        if ($job->status !== 'open' && $job->status !== 'on_hold') {
            return $this->error('Só vagas abertas ou em pausa podem ser fechadas.', 422);
        }

        $job->update([
            'status' => 'closed',
            'closed_at' => now(),
        ]);

        return $this->success(
            new JobOpeningResource($job->fresh()),
            'Vaga fechada com sucesso.',
        );
    }
}
