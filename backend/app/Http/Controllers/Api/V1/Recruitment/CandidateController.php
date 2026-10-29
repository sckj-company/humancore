<?php

namespace App\Http\Controllers\Api\V1\Recruitment;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\CandidateResource;
use App\Models\Candidate;
use App\Models\JobOpening;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CandidateController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Candidate::class);

        $candidates = Candidate::query()
            ->with(['jobOpening:id,title'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('first_name', 'like', "%{$term}%")
                    ->orWhere('last_name', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('phone', 'like', "%{$term}%");
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('job_opening_id'), fn ($q) => $q->where('job_opening_id', $request->integer('job_opening_id')))
            ->when($request->filled('source'), fn ($q) => $q->where('source', $request->string('source')))
            ->orderBy($request->string('sort_by', 'created_at'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(CandidateResource::collection($candidates));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Candidate::class);

        $data = $request->validate([
            'job_opening_id' => ['required', 'integer', 'exists:job_openings,id'],
            'first_name' => ['required', 'string', 'max:150'],
            'last_name' => ['required', 'string', 'max:150'],
            'email' => ['required', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'location' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'max:100'],
            'cover_letter' => ['nullable', 'string', 'max:10000'],
            'linkedin_url' => ['nullable', 'url', 'max:500'],
            'years_experience' => ['nullable', 'integer', 'min:0'],
            'expected_salary' => ['nullable', 'numeric', 'min:0'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['status'] = 'applied';
        $data['applied_at'] = now();
        $data['last_status_at'] = now();

        $candidate = Candidate::query()->create($data);

        return $this->success(
            new CandidateResource($candidate->load('jobOpening')),
            'Candidatura registada com sucesso.',
            201,
        );
    }

    public function show(Candidate $candidate): JsonResponse
    {
        $this->authorize('view', $candidate);

        return $this->success(
            new CandidateResource($candidate->load('jobOpening'))
        );
    }

    public function update(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorize('update', $candidate);

        $data = $request->validate([
            'first_name' => ['sometimes', 'string', 'max:150'],
            'last_name' => ['sometimes', 'string', 'max:150'],
            'email' => ['sometimes', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'location' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'max:100'],
            'cover_letter' => ['nullable', 'string', 'max:10000'],
            'linkedin_url' => ['nullable', 'url', 'max:500'],
            'years_experience' => ['nullable', 'integer', 'min:0'],
            'expected_salary' => ['nullable', 'numeric', 'min:0'],
            'rating' => ['nullable', 'integer', 'min:1', 'max:5'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);

        $candidate->update($data);

        return $this->success(
            new CandidateResource($candidate->fresh()->load('jobOpening')),
            'Candidato atualizado com sucesso.',
        );
    }

    public function destroy(Candidate $candidate): JsonResponse
    {
        $this->authorize('delete', $candidate);

        $candidate->delete();

        return $this->success(null, 'Candidato removido com sucesso.');
    }

    public function move(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorize('update', $candidate);

        $request->validate([
            'status' => ['required', 'in:'.implode(',', array_keys(Candidate::STATUSES))],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $candidate->update([
            'status' => $request->string('status'),
            'last_status_at' => now(),
            'notes' => $request->input('notes') ?? $candidate->notes,
        ]);

        return $this->success(
            new CandidateResource($candidate->fresh()->load('jobOpening')),
            'Estado do candidato atualizado.',
        );
    }

    public function byJobOpening(Request $request, JobOpening $job): JsonResponse
    {
        $this->authorize('viewAny', Candidate::class);

        $candidates = Candidate::query()
            ->where('job_opening_id', $job->id)
            ->with('jobOpening:id,title')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderByDesc('applied_at')
            ->limit(min($request->integer('limit', 50), 100))
            ->get();

        return $this->success(CandidateResource::collection($candidates));
    }
}
