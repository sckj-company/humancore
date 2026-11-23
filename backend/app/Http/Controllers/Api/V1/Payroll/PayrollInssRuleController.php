<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\PayrollInssRuleResource;
use App\Models\PayrollInssRule;
use App\Models\Tenant;
use App\Services\CloudinaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PayrollInssRuleController extends BaseController
{
    protected function resolveTenantId(Request $request): ?int
    {
        $explicit = (int) ($request->header('X-Tenant-ID') ?: $request->input('tenant_id') ?: $request->query('tenant_id'));
        if ($explicit) {
            return $explicit;
        }

        $id = tenant_id();
        if (! $id) {
            $id = (int) (Tenant::query()->where('status', 'active')->orderBy('id')->value('id') ?: Tenant::query()->orderBy('id')->value('id'));
        }

        return $id ?: null;
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', PayrollInssRule::class);
        $tenantId = $this->resolveTenantId($request);

        $rules = PayrollInssRule::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->with(['validatedBy:id,name', 'revokedBy:id,name'])
            ->orderByDesc('effective_from')
            ->orderByDesc('version')
            ->get();

        return $this->success(PayrollInssRuleResource::collection($rules));
    }

    public function store(Request $request, CloudinaryService $cloudinary): JsonResponse
    {
        $this->authorize('create', PayrollInssRule::class);
        $request->merge(['country_code' => strtoupper((string) $request->input('country_code', 'AO'))]);
        $tenantId = $this->resolveTenantId($request);

        $data = $request->validate([
            'country_code' => ['required', 'string', 'size:2', 'regex:/^[A-Z]{2}$/'],
            'regime_code' => ['required', 'string', 'max:50'],
            'employee_rate' => ['required', 'numeric', 'min:0', 'max:100'],
            'employer_rate' => ['required', 'numeric', 'min:0', 'max:100'],
            'max_base' => ['nullable', 'numeric', 'min:0'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'legal_source' => ['nullable', 'string', 'max:5000'],
            'legal_reference' => ['nullable', 'string', 'max:255'],
            'legal_document' => ['nullable', 'file', 'mimes:pdf,png,jpg,jpeg', 'max:10240'],
            'tenant_ids' => ['sometimes', 'array', 'min:1'],
            'tenant_ids.*' => ['integer', 'exists:tenants,id'],
            'activate' => ['sometimes', 'boolean'],
        ]);

        $extraTenantIds = isset($data['tenant_ids']) && is_array($data['tenant_ids'])
            ? array_values(array_unique(array_map('intval', $data['tenant_ids'])))
            : [];
        $shouldActivate = $request->boolean('activate');
        unset($data['tenant_ids'], $data['activate']);

        $user = $request->user();
        foreach ($extraTenantIds as $tid) {
            if (! $user->canAccessTenant($tid)) {
                return $this->error('Sem permissão para configurar uma ou mais empresas selecionadas.', 403);
            }
        }

        $legalDocument = $request->file('legal_document');
        unset($data['legal_document']);

        $duplicateExists = PayrollInssRule::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->where('status', '!=', 'revoked')
            ->whereDate('effective_from', $data['effective_from'])
            ->exists();

        if ($duplicateExists && ! in_array((int) $tenantId, $extraTenantIds, true)) {
            return $this->error('Já existe uma regra INSS para esta data de início e regime.', 422, [
                'effective_from' => ['Já existe uma regra INSS para esta data de início e regime.'],
            ]);
        }

        if ($legalDocument) {
            $data['legal_document_path'] = $cloudinary->upload(
                $legalDocument,
                'humancore/tenants/'.$tenantId.'/payroll-regulations/inss',
                'auto',
            )['url'];
        }

        if ($extraTenantIds !== []) {
            $allTargetIds = $tenantId && ! in_array((int) $tenantId, $extraTenantIds, true)
                ? array_merge([(int) $tenantId], $extraTenantIds)
                : $extraTenantIds;

            $result = $this->replicateRulePayloadToTenants($data, $allTargetIds, $shouldActivate, (int) $user->id);
            $primaryRule = $result['primary'];

            return $this->success(
                new PayrollInssRuleResource($primaryRule),
                'Regra INSS aplicada a '.count($allTargetIds).' empresa(s) com sucesso.',
                201
            );
        }

        $data['tenant_id'] = $tenantId;
        $data['status'] = $shouldActivate ? 'active' : 'draft';
        if ($shouldActivate) {
            $data['validated_at'] = now();
            $data['validated_by'] = $user->id;
        }
        $data['version'] = ((int) PayrollInssRule::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->max('version')) + 1;

        $rule = PayrollInssRule::query()->create($data);

        return $this->success(
            new PayrollInssRuleResource($rule),
            $shouldActivate ? 'Regra INSS criada e ativada com sucesso.' : 'Regra INSS criada como rascunho.',
            201
        );
    }

    public function show(PayrollInssRule $rule): JsonResponse
    {
        $this->authorize('view', $rule);

        return $this->success(new PayrollInssRuleResource($rule->load(['validatedBy:id,name', 'revokedBy:id,name'])));
    }

    public function update(Request $request, PayrollInssRule $rule, CloudinaryService $cloudinary): JsonResponse
    {
        $this->authorize('update', $rule);

        if ($rule->status !== 'draft') {
            return $this->error('Só é possível editar regras INSS em rascunho.', 422);
        }

        $data = $request->validate([
            'employee_rate' => ['sometimes', 'required', 'numeric', 'min:0', 'max:100'],
            'employer_rate' => ['sometimes', 'required', 'numeric', 'min:0', 'max:100'],
            'max_base' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'effective_from' => ['sometimes', 'required', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
            'legal_source' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'legal_reference' => ['sometimes', 'nullable', 'string', 'max:255'],
            'legal_document' => ['nullable', 'file', 'mimes:pdf,png,jpg,jpeg', 'max:10240'],
        ]);

        $legalDocument = $request->file('legal_document');
        unset($data['legal_document']);

        if (isset($data['effective_from'])) {
            $duplicateExists = PayrollInssRule::query()
                ->whereKeyNot($rule->id)
                ->where('country_code', $rule->country_code)
                ->where('regime_code', $rule->regime_code)
                ->where('status', '!=', 'revoked')
                ->whereDate('effective_from', $data['effective_from'])
                ->exists();

            if ($duplicateExists) {
                return $this->error('Já existe uma regra INSS para esta data de início e regime.', 422, [
                    'effective_from' => ['Já existe uma regra INSS para esta data de início e regime.'],
                ]);
            }
        }

        $oldDocumentPath = $rule->legal_document_path;
        if ($legalDocument) {
            $data['legal_document_path'] = $cloudinary->upload(
                $legalDocument,
                'humancore/tenants/'.$rule->tenant_id.'/payroll-regulations/inss',
                'auto',
            )['url'];
        }

        $rule->update($data);

        if ($legalDocument && $oldDocumentPath) {
            $this->deleteStoredDocument($oldDocumentPath, $cloudinary);
        }

        return $this->success(
            new PayrollInssRuleResource($rule->fresh()->load(['validatedBy:id,name', 'revokedBy:id,name'])),
            'Rascunho INSS atualizado com sucesso.'
        );
    }

    public function validateRule(Request $request, PayrollInssRule $rule): JsonResponse
    {
        $this->authorize('validate', $rule);

        if ($rule->status !== 'draft') {
            return $this->error('Só é possível validar regras em rascunho.', 422);
        }

        if ($rule->employee_rate === null || $rule->employer_rate === null) {
            return $this->error('Preencha as taxas antes de validar.', 422);
        }

        $rule->update([
            'status' => 'validated',
            'validated_at' => now(),
            'validated_by' => $request->user()->id,
        ]);

        return $this->success(
            new PayrollInssRuleResource($rule->fresh()->load(['validatedBy:id,name'])),
            'Regra INSS validada com sucesso. Confirme a ativação para a disponibilizar aos cálculos.'
        );
    }

    public function activate(PayrollInssRule $rule): JsonResponse
    {
        $this->authorize('activate', $rule);

        if ($rule->status !== 'validated') {
            return $this->error('Apenas regras validadas podem ser ativadas.', 422);
        }

        $hasOverlap = PayrollInssRule::query()
            ->where('id', '!=', $rule->id)
            ->where('country_code', $rule->country_code)
            ->where('regime_code', $rule->regime_code)
            ->where('status', 'active')
            ->whereDate('effective_from', '<=', $rule->effective_to ?? '9999-12-31')
            ->where(function ($query) use ($rule): void {
                $query->whereNull('effective_to')
                    ->orWhereDate('effective_to', '>=', $rule->effective_from);
            })
            ->exists();

        if ($hasOverlap) {
            return $this->error('A vigência sobrepõe-se a outra regra ativa. Ajuste as datas antes de ativar.', 422);
        }

        DB::transaction(fn () => $rule->update(['status' => 'active']));

        return $this->success(
            new PayrollInssRuleResource($rule->fresh()->load(['validatedBy:id,name'])),
            'Regra INSS ativada com sucesso.'
        );
    }

    public function revoke(Request $request, PayrollInssRule $rule): JsonResponse
    {
        $this->authorize('revoke', $rule);

        if (! in_array($rule->status, ['validated', 'active'], true)) {
            return $this->error('Só regras validadas ou ativas podem ser revogadas.', 422);
        }

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $effectiveFromStr = $rule->effective_from instanceof \DateTimeInterface
            ? $rule->effective_from->format('Y-m-d')
            : (string) $rule->effective_from;

        $effectiveToStr = $rule->effective_to instanceof \DateTimeInterface
            ? $rule->effective_to->format('Y-m-d')
            : ($rule->effective_to ? (string) $rule->effective_to : null);

        $today = now()->toDateString();
        if (! $effectiveToStr || $effectiveToStr > $today) {
            $effectiveToStr = $today >= $effectiveFromStr ? $today : $effectiveFromStr;
        }

        $rule->update([
            'status' => 'revoked',
            'effective_to' => $effectiveToStr,
            'revoked_at' => now(),
            'revoked_by' => $request->user()->id,
            'revocation_reason' => $data['reason'],
        ]);

        return $this->success(
            new PayrollInssRuleResource($rule->fresh()->load(['validatedBy:id,name', 'revokedBy:id,name'])),
            'Regra INSS revogada e vigência encerrada.'
        );
    }

    public function destroy(PayrollInssRule $rule): JsonResponse
    {
        $this->authorize('delete', $rule);

        if (! in_array($rule->status, ['draft', 'revoked'], true)) {
            return $this->error('Apenas rascunhos ou regras revogadas podem ser eliminadas.', 422);
        }

        $documentPath = $rule->legal_document_path;
        $rule->delete();

        if ($documentPath) {
            $this->deleteStoredDocument($documentPath, app(CloudinaryService::class));
        }

        return $this->success(null, 'Regra eliminada com sucesso.');
    }

    public function assignToTenants(Request $request, PayrollInssRule $rule): JsonResponse
    {
        $this->authorize('create', PayrollInssRule::class);

        $validated = $request->validate([
            'tenant_ids' => ['required', 'array', 'min:1'],
            'tenant_ids.*' => ['integer', 'exists:tenants,id'],
            'activate' => ['sometimes', 'boolean'],
        ]);

        $tenantIds = array_values(array_unique(array_map('intval', $validated['tenant_ids'])));
        $user = $request->user();

        foreach ($tenantIds as $tid) {
            if (! $user->canAccessTenant($tid)) {
                return $this->error('Sem permissão para configurar uma ou mais empresas selecionadas.', 403);
            }
        }

        $shouldActivate = array_key_exists('activate', $validated)
            ? (bool) $validated['activate']
            : ($rule->status === 'active');

        $effectiveFromStr = $rule->effective_from instanceof \DateTimeInterface
            ? $rule->effective_from->format('Y-m-d')
            : (string) $rule->effective_from;

        $effectiveToStr = $rule->effective_to instanceof \DateTimeInterface
            ? $rule->effective_to->format('Y-m-d')
            : ($rule->effective_to ? (string) $rule->effective_to : null);

        $payload = [
            'country_code' => $rule->country_code,
            'regime_code' => $rule->regime_code,
            'employee_rate' => $rule->employee_rate,
            'employer_rate' => $rule->employer_rate,
            'max_base' => $rule->max_base,
            'effective_from' => $effectiveFromStr,
            'effective_to' => $effectiveToStr,
            'legal_source' => $rule->legal_source,
            'legal_reference' => $rule->legal_reference,
            'legal_document_path' => $rule->legal_document_path,
        ];

        $result = $this->replicateRulePayloadToTenants($payload, $tenantIds, $shouldActivate, (int) $user->id);

        return $this->success([
            'created_count' => $result['created_count'],
            'updated_count' => $result['updated_count'],
            'total_applied' => $result['created_count'] + $result['updated_count'],
            'tenant_ids' => $tenantIds,
        ], 'Regra INSS aplicada a '.count($tenantIds).' empresa(s) com sucesso.');
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $tenantIds
     * @return array{primary: PayrollInssRule, created_count: int, updated_count: int}
     */
    private function replicateRulePayloadToTenants(
        array $payload,
        array $tenantIds,
        bool $shouldActivate,
        int $actorId,
    ): array {
        $tenantManager = app(\App\Services\Tenant\TenantManager::class);
        $previousTenant = $tenantManager->get();
        $tenantsById = Tenant::query()->whereIn('id', $tenantIds)->get()->keyBy('id');

        $createdCount = 0;
        $updatedCount = 0;
        $primary = null;

        try {
            DB::transaction(function () use (
                $payload,
                $tenantIds,
                $shouldActivate,
                $actorId,
                $tenantManager,
                $tenantsById,
                &$createdCount,
                &$updatedCount,
                &$primary,
            ): void {
                foreach ($tenantIds as $targetTenantId) {
                    $targetTenant = $tenantsById->get($targetTenantId);
                    if (! $targetTenant) {
                        continue;
                    }

                    $tenantManager->set($targetTenant);

                    $existing = PayrollInssRule::withoutGlobalScopes()
                        ->where('tenant_id', $targetTenantId)
                        ->where('country_code', $payload['country_code'])
                        ->where('regime_code', $payload['regime_code'])
                        ->where('status', '!=', 'revoked')
                        ->whereDate('effective_from', $payload['effective_from'])
                        ->first();

                    if ($shouldActivate) {
                        PayrollInssRule::withoutGlobalScopes()
                            ->where('tenant_id', $targetTenantId)
                            ->where('country_code', $payload['country_code'])
                            ->where('regime_code', $payload['regime_code'])
                            ->where('status', 'active')
                            ->when($existing, fn ($q) => $q->where('id', '!=', $existing->id))
                            ->whereDate('effective_from', '<=', $payload['effective_to'] ?? '9999-12-31')
                            ->where(function ($query) use ($payload): void {
                                $query->whereNull('effective_to')
                                    ->orWhereDate('effective_to', '>=', $payload['effective_from']);
                            })
                            ->update([
                                'status' => 'revoked',
                                'revoked_at' => now(),
                                'revoked_by' => $actorId,
                                'revocation_reason' => 'Substituída por aplicação multi-empresa.',
                            ]);
                    }

                    if ($existing) {
                        $updateData = [
                            'employee_rate' => $payload['employee_rate'],
                            'employer_rate' => $payload['employer_rate'],
                            'max_base' => $payload['max_base'] ?? null,
                            'effective_to' => $payload['effective_to'] ?? null,
                            'legal_source' => $payload['legal_source'] ?? $existing->legal_source,
                            'legal_reference' => $payload['legal_reference'] ?? $existing->legal_reference,
                            'legal_document_path' => $payload['legal_document_path'] ?? $existing->legal_document_path,
                        ];

                        if ($shouldActivate) {
                            $updateData['status'] = 'active';
                            $updateData['validated_at'] = $existing->validated_at ?? now();
                            $updateData['validated_by'] = $existing->validated_by ?? $actorId;
                        }

                        $existing->update($updateData);
                        $updatedCount++;
                        $primary ??= $existing->fresh();
                    } else {
                        $nextVersion = ((int) PayrollInssRule::withoutGlobalScopes()
                            ->where('tenant_id', $targetTenantId)
                            ->where('country_code', $payload['country_code'])
                            ->where('regime_code', $payload['regime_code'])
                            ->max('version')) + 1;

                        $created = PayrollInssRule::withoutGlobalScopes()->create([
                            'tenant_id' => $targetTenantId,
                            'country_code' => $payload['country_code'],
                            'regime_code' => $payload['regime_code'],
                            'version' => $nextVersion,
                            'employee_rate' => $payload['employee_rate'],
                            'employer_rate' => $payload['employer_rate'],
                            'max_base' => $payload['max_base'] ?? null,
                            'effective_from' => $payload['effective_from'],
                            'effective_to' => $payload['effective_to'] ?? null,
                            'legal_source' => $payload['legal_source'] ?? null,
                            'legal_reference' => $payload['legal_reference'] ?? null,
                            'legal_document_path' => $payload['legal_document_path'] ?? null,
                            'status' => $shouldActivate ? 'active' : 'draft',
                            'validated_at' => $shouldActivate ? now() : null,
                            'validated_by' => $shouldActivate ? $actorId : null,
                        ]);

                        $createdCount++;
                        $primary ??= $created;
                    }
                }
            });
        } finally {
            if ($previousTenant !== null) {
                $tenantManager->set($previousTenant);
            } else {
                $tenantManager->clear();
            }
        }

        return [
            'primary' => $primary,
            'created_count' => $createdCount,
            'updated_count' => $updatedCount,
        ];
    }

    public function downloadDocument(PayrollInssRule $rule, CloudinaryService $cloudinary): StreamedResponse|RedirectResponse|JsonResponse
    {
        $this->authorize('view', $rule);

        if (! $rule->legal_document_path) {
            return $this->error('Documento não encontrado.', 404);
        }

        if ($cloudinary->isCloudinaryUrl($rule->legal_document_path)) {
            return redirect()->away($rule->legal_document_path);
        }

        if (! Storage::disk('local')->exists($rule->legal_document_path)) {
            return $this->error('Documento não encontrado.', 404);
        }

        return Storage::disk('local')->download($rule->legal_document_path, basename($rule->legal_document_path));
    }

    private function deleteStoredDocument(string $path, CloudinaryService $cloudinary): void
    {
        if ($cloudinary->isCloudinaryUrl($path)) {
            $cloudinary->delete($path);
        } else {
            Storage::disk('local')->delete($path);
        }
    }
}
