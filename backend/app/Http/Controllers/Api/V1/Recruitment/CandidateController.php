<?php

namespace App\Http\Controllers\Api\V1\Recruitment;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\CandidateResource;
use App\Models\Candidate;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\JobOpening;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

    public function hire(Request $request, Candidate $candidate): JsonResponse
    {
        $this->authorize('update', $candidate);

        $validated = $request->validate([
            'contract_type' => ['required', 'string', 'in:permanent,fixed_term,temporary,probation,internship,outsourced'],
            'base_salary' => ['required', 'numeric', 'min:0'],
            'salary_frequency' => ['required', 'string', 'in:monthly,biweekly,weekly,hourly'],
            'work_hours_per_week' => ['nullable', 'numeric', 'min:1', 'max:168'],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'signed_at' => ['nullable', 'date'],
            'department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'position_id' => ['nullable', 'integer', 'exists:positions,id'],
            'manager_id' => ['nullable', 'integer', 'exists:employees,id'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        return DB::transaction(function () use ($candidate, $validated) {
            $job = $candidate->jobOpening;
            $tenantId = $candidate->tenant_id ?? tenant_id();
            $deptId = $validated['department_id'] ?? $job?->department_id;
            $posId = $validated['position_id'] ?? $job?->position_id;

            // Generate unique employee code
            $count = Employee::withoutGlobalScopes()->where('tenant_id', $tenantId)->count() + 1;
            $code = 'EMP-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
            while (Employee::withoutGlobalScopes()->where('tenant_id', $tenantId)->where('employee_code', $code)->exists()) {
                $count++;
                $code = 'EMP-' . str_pad((string) $count, 4, '0', STR_PAD_LEFT);
            }

            $employee = Employee::create([
                'tenant_id' => $tenantId,
                'employee_code' => $code,
                'first_name' => $candidate->first_name,
                'last_name' => $candidate->last_name,
                'email' => $candidate->email,
                'phone' => $candidate->phone,
                'department_id' => $deptId,
                'position_id' => $posId,
                'manager_id' => $validated['manager_id'] ?? null,
                'status' => 'active',
                'hired_at' => $validated['start_date'],
            ]);

            $contract = EmployeeContract::create([
                'tenant_id' => $tenantId,
                'employee_id' => $employee->id,
                'department_id' => $deptId,
                'position_id' => $posId,
                'manager_id' => $validated['manager_id'] ?? null,
                'contract_type' => $validated['contract_type'],
                'base_salary' => $validated['base_salary'],
                'salary_frequency' => $validated['salary_frequency'],
                'work_hours_per_week' => $validated['work_hours_per_week'] ?? 40,
                'start_date' => $validated['start_date'],
                'end_date' => $validated['end_date'] ?? null,
                'signed_at' => $validated['signed_at'] ?? now()->toDateString(),
                'notes' => $validated['notes'] ?? ('Candidato contratado via processo seletivo: ' . ($job?->title ?? '')),
                'is_active' => true,
            ]);

            $candidate->update([
                'status' => 'hired',
                'last_status_at' => now(),
                'notes' => trim(($candidate->notes ?? '') . "\n[Contratado em " . now()->format('Y-m-d') . " como funcionário #{$employee->employee_code}]"),
            ]);

            return $this->success([
                'candidate' => new CandidateResource($candidate->fresh()->load('jobOpening')),
                'employee' => new \App\Http\Resources\V1\EmployeeResource($employee->load('department', 'position', 'activeContract')),
                'contract' => new \App\Http\Resources\V1\ContractResource($contract),
            ], 'Candidato contratado e convertido em funcionário com sucesso!', 201);
        });
    }
}
