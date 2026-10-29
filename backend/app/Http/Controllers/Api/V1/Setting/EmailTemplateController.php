<?php

namespace App\Http\Controllers\Api\V1\Setting;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\EmailTemplateResource;
use App\Models\EmailTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class EmailTemplateController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', EmailTemplate::class);

        $templates = EmailTemplate::query()
            ->with('creator:id,name')
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('name', 'like', "%{$term}%")
                    ->orWhere('code', 'like', "%{$term}%")
                    ->orWhere('subject', 'like', "%{$term}%");
            })
            ->when($request->filled('event'), fn ($q) => $q->where('event', $request->string('event')))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->orderBy($request->string('sort_by', 'name'), $request->string('sort_dir', 'asc'))
            ->paginate($request->integer('per_page', 15));

        return $this->paginated(EmailTemplateResource::collection($templates));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', EmailTemplate::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['required', 'string', 'max:100', 'regex:/^[a-z0-9_-]+$/',
                Rule::unique('email_templates')->where(fn ($q) => $q->where('tenant_id', tenant_id())),
            ],
            'event' => ['nullable', 'in:'.implode(',', array_keys(EmailTemplate::EVENTS))],
            'subject' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:65535'],
            'variables' => ['nullable', 'array'],
            'variables.*' => ['string', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $data['tenant_id'] = tenant_id();
        $data['created_by'] = $request->user()->id;
        $data['is_active'] = $data['is_active'] ?? true;
        $data['variables'] = $data['variables'] ?? EmailTemplate::DEFAULT_VARIABLES;

        $template = EmailTemplate::query()->create($data);

        return $this->success(
            new EmailTemplateResource($template->load('creator')),
            'Template de email criado com sucesso.',
            201,
        );
    }

    public function show(EmailTemplate $emailTemplate): JsonResponse
    {
        $this->authorize('view', $emailTemplate);

        return $this->success(new EmailTemplateResource($emailTemplate->load('creator')));
    }

    public function update(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->authorize('update', $emailTemplate);

        if ($emailTemplate->is_system) {
            return $this->error('Templates de sistema não podem ser editados.', 403);
        }

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'event' => ['nullable', 'in:'.implode(',', array_keys(EmailTemplate::EVENTS))],
            'subject' => ['sometimes', 'string', 'max:255'],
            'body' => ['sometimes', 'string', 'max:65535'],
            'variables' => ['nullable', 'array'],
            'variables.*' => ['string', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $emailTemplate->update($data);

        return $this->success(
            new EmailTemplateResource($emailTemplate->fresh()->load('creator')),
            'Template atualizado com sucesso.',
        );
    }

    public function destroy(EmailTemplate $emailTemplate): JsonResponse
    {
        $this->authorize('delete', $emailTemplate);

        if ($emailTemplate->is_system) {
            return $this->error('Templates de sistema não podem ser removidos.', 403);
        }

        $emailTemplate->delete();

        return $this->success(null, 'Template removido com sucesso.');
    }

    public function preview(Request $request, EmailTemplate $emailTemplate): JsonResponse
    {
        $this->authorize('view', $emailTemplate);

        $data = $request->validate([
            'data' => ['nullable', 'array'],
        ]);

        $rendered = $emailTemplate->render($data['data'] ?? $this->sampleData());

        return $this->success([
            'subject' => $rendered['subject'],
            'body' => $rendered['body'],
        ]);
    }

    private function sampleData(): array
    {
        return [
            'employee_name' => 'João Silva',
            'employee_code' => 'EMP-001',
            'employee_email' => 'joao.silva@example.com',
            'company_name' => 'Empresa Demo Lda',
            'period_name' => 'Setembro 2026',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
            'amount' => '350.000,00 AOA',
            'link' => url('/'),
        ];
    }
}
