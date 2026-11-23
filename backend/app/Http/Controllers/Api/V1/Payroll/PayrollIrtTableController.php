<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\PayrollIrtTableResource;
use App\Models\PayrollIrtTable;
use App\Models\Tenant;
use App\Services\CloudinaryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PayrollIrtTableController extends BaseController
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
        $this->authorize('viewAny', PayrollIrtTable::class);
        $tenantId = $this->resolveTenantId($request);

        $tables = PayrollIrtTable::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->with(['validatedBy:id,name', 'revokedBy:id,name'])
            ->orderByDesc('effective_from')
            ->orderByDesc('version')
            ->get();

        return $this->success(PayrollIrtTableResource::collection($tables));
    }

    public function store(Request $request, CloudinaryService $cloudinary): JsonResponse
    {
        $this->authorize('create', PayrollIrtTable::class);
        $request->merge(['country_code' => strtoupper((string) $request->input('country_code', 'AO'))]);
        $tenantId = $this->resolveTenantId($request);

        $data = $request->validate([
            'country_code' => ['required', 'string', 'size:2', 'regex:/^[A-Z]{2}$/'],
            'regime_code' => ['required', 'string', 'max:50'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'brackets' => ['required', 'array', 'min:1'],
            'brackets.*.lower_bound' => ['required', 'numeric', 'min:0'],
            'brackets.*.upper_bound' => ['nullable', 'numeric'],
            'brackets.*.rate' => ['required', 'numeric', 'min:0', 'max:100'],
            'brackets.*.fixed_amount' => ['required', 'numeric', 'min:0'],
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

        $duplicateExists = PayrollIrtTable::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->where('status', '!=', 'revoked')
            ->whereDate('effective_from', $data['effective_from'])
            ->exists();

        if ($duplicateExists && ! in_array((int) $tenantId, $extraTenantIds, true)) {
            return $this->error('Já existe uma tabela IRT para esta data de início e regime.', 422, [
                'effective_from' => ['Já existe uma tabela IRT para esta data de início e regime.'],
            ]);
        }

        if ($legalDocument) {
            $data['legal_document_path'] = $cloudinary->upload(
                $legalDocument,
                'humancore/tenants/'.$tenantId.'/payroll-regulations/irt',
                'auto',
            )['url'];
        }

        if ($extraTenantIds !== []) {
            $allTargetIds = $tenantId && ! in_array((int) $tenantId, $extraTenantIds, true)
                ? array_merge([(int) $tenantId], $extraTenantIds)
                : $extraTenantIds;

            $result = $this->replicateTablePayloadToTenants($data, $allTargetIds, $shouldActivate, (int) $user->id);
            $primaryTable = $result['primary'];

            return $this->success(
                new PayrollIrtTableResource($primaryTable),
                'Tabela IRT aplicada a '.count($allTargetIds).' empresa(s) com sucesso.',
                201
            );
        }

        $data['tenant_id'] = $tenantId;
        $data['status'] = $shouldActivate ? 'active' : 'draft';
        if ($shouldActivate) {
            $data['validated_at'] = now();
            $data['validated_by'] = $user->id;
        }
        $data['version'] = ((int) PayrollIrtTable::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->max('version')) + 1;

        $table = PayrollIrtTable::query()->create($data);

        return $this->success(
            new PayrollIrtTableResource($table),
            $shouldActivate ? 'Tabela IRT criada e ativada com sucesso.' : 'Tabela IRT criada como rascunho.',
            201
        );
    }

    public function show(PayrollIrtTable $irtTable): JsonResponse
    {
        $this->authorize('view', $irtTable);

        return $this->success(new PayrollIrtTableResource($irtTable->load(['validatedBy:id,name', 'revokedBy:id,name'])));
    }

    public function update(Request $request, PayrollIrtTable $irtTable, CloudinaryService $cloudinary): JsonResponse
    {
        $this->authorize('update', $irtTable);

        if ($irtTable->status !== 'draft') {
            return $this->error('Só é possível editar tabelas IRT em rascunho.', 422);
        }

        $data = $request->validate([
            'effective_from' => ['sometimes', 'required', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
            'brackets' => ['sometimes', 'required', 'array', 'min:1'],
            'brackets.*.lower_bound' => ['required', 'numeric', 'min:0'],
            'brackets.*.upper_bound' => ['nullable', 'numeric'],
            'brackets.*.rate' => ['required', 'numeric', 'min:0', 'max:100'],
            'brackets.*.fixed_amount' => ['required', 'numeric', 'min:0'],
            'legal_source' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'legal_reference' => ['sometimes', 'nullable', 'string', 'max:255'],
            'legal_document' => ['nullable', 'file', 'mimes:pdf,png,jpg,jpeg', 'max:10240'],
        ]);

        $legalDocument = $request->file('legal_document');
        unset($data['legal_document']);

        if (isset($data['effective_from'])) {
            $duplicateExists = PayrollIrtTable::query()
                ->whereKeyNot($irtTable->id)
                ->where('country_code', $irtTable->country_code)
                ->where('regime_code', $irtTable->regime_code)
                ->where('status', '!=', 'revoked')
                ->whereDate('effective_from', $data['effective_from'])
                ->exists();

            if ($duplicateExists) {
                return $this->error('Já existe uma tabela IRT para esta data de início e regime.', 422, [
                    'effective_from' => ['Já existe uma tabela IRT para esta data de início e regime.'],
                ]);
            }
        }

        $oldDocumentPath = $irtTable->legal_document_path;
        if ($legalDocument) {
            $data['legal_document_path'] = $cloudinary->upload(
                $legalDocument,
                'humancore/tenants/'.$irtTable->tenant_id.'/payroll-regulations/irt',
                'auto',
            )['url'];
        }

        $irtTable->update($data);

        if ($legalDocument && $oldDocumentPath) {
            $this->deleteStoredDocument($oldDocumentPath, $cloudinary);
        }

        return $this->success(
            new PayrollIrtTableResource($irtTable->fresh()->load(['validatedBy:id,name', 'revokedBy:id,name'])),
            'Rascunho IRT atualizado com sucesso.'
        );
    }

    public function validateTable(Request $request, PayrollIrtTable $irtTable): JsonResponse
    {
        $this->authorize('validate', $irtTable);

        if ($irtTable->status !== 'draft') {
            return $this->error('Só é possível validar tabelas em rascunho.', 422);
        }

        if (empty($irtTable->brackets)) {
            return $this->error('A tabela IRT precisa ter ao menos um escalão antes de validar.', 422);
        }

        $irtTable->update([
            'status' => 'validated',
            'validated_at' => now(),
            'validated_by' => $request->user()->id,
        ]);

        return $this->success(
            new PayrollIrtTableResource($irtTable->fresh()->load(['validatedBy:id,name'])),
            'Tabela IRT validada com sucesso. Confirme a ativação para a disponibilizar aos cálculos.'
        );
    }

    public function activate(PayrollIrtTable $irtTable): JsonResponse
    {
        $this->authorize('activate', $irtTable);

        if ($irtTable->status !== 'validated') {
            return $this->error('Apenas tabelas validadas podem ser ativadas.', 422);
        }

        $hasOverlap = PayrollIrtTable::query()
            ->where('id', '!=', $irtTable->id)
            ->where('country_code', $irtTable->country_code)
            ->where('regime_code', $irtTable->regime_code)
            ->where('status', 'active')
            ->whereDate('effective_from', '<=', $irtTable->effective_to ?? '9999-12-31')
            ->where(function ($query) use ($irtTable): void {
                $query->whereNull('effective_to')
                    ->orWhereDate('effective_to', '>=', $irtTable->effective_from);
            })
            ->exists();

        if ($hasOverlap) {
            return $this->error('A vigência sobrepõe-se a outra tabela ativa. Ajuste as datas antes de ativar.', 422);
        }

        DB::transaction(fn () => $irtTable->update(['status' => 'active']));

        return $this->success(
            new PayrollIrtTableResource($irtTable->fresh()->load(['validatedBy:id,name'])),
            'Tabela IRT ativada com sucesso.'
        );
    }

    public function revoke(Request $request, PayrollIrtTable $irtTable): JsonResponse
    {
        $this->authorize('revoke', $irtTable);

        if (! in_array($irtTable->status, ['validated', 'active'], true)) {
            return $this->error('Só tabelas validadas ou ativas podem ser revogadas.', 422);
        }

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $effectiveFromStr = $irtTable->effective_from instanceof \DateTimeInterface
            ? $irtTable->effective_from->format('Y-m-d')
            : (string) $irtTable->effective_from;

        $effectiveToStr = $irtTable->effective_to instanceof \DateTimeInterface
            ? $irtTable->effective_to->format('Y-m-d')
            : ($irtTable->effective_to ? (string) $irtTable->effective_to : null);

        $today = now()->toDateString();
        if (! $effectiveToStr || $effectiveToStr > $today) {
            $effectiveToStr = $today >= $effectiveFromStr ? $today : $effectiveFromStr;
        }

        $irtTable->update([
            'status' => 'revoked',
            'effective_to' => $effectiveToStr,
            'revoked_at' => now(),
            'revoked_by' => $request->user()->id,
            'revocation_reason' => $data['reason'],
        ]);

        return $this->success(
            new PayrollIrtTableResource($irtTable->fresh()->load(['validatedBy:id,name', 'revokedBy:id,name'])),
            'Tabela IRT revogada e vigência encerrada.'
        );
    }

    public function destroy(PayrollIrtTable $irtTable, CloudinaryService $cloudinary): JsonResponse
    {
        $this->authorize('delete', $irtTable);

        if (! in_array($irtTable->status, ['draft', 'revoked'], true)) {
            return $this->error('Apenas rascunhos ou tabelas revogadas podem ser eliminadas.', 422);
        }

        $documentPath = $irtTable->legal_document_path;
        $irtTable->delete();

        if ($documentPath) {
            $this->deleteStoredDocument($documentPath, $cloudinary);
        }

        return $this->success(null, 'Tabela eliminada com sucesso.');
    }

    public function assignToTenants(Request $request, PayrollIrtTable $irtTable): JsonResponse
    {
        $this->authorize('create', PayrollIrtTable::class);

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
            : ($irtTable->status === 'active');

        $effectiveFromStr = $irtTable->effective_from instanceof \DateTimeInterface
            ? $irtTable->effective_from->format('Y-m-d')
            : (string) $irtTable->effective_from;

        $effectiveToStr = $irtTable->effective_to instanceof \DateTimeInterface
            ? $irtTable->effective_to->format('Y-m-d')
            : ($irtTable->effective_to ? (string) $irtTable->effective_to : null);

        $payload = [
            'country_code' => $irtTable->country_code,
            'regime_code' => $irtTable->regime_code,
            'effective_from' => $effectiveFromStr,
            'effective_to' => $effectiveToStr,
            'brackets' => $irtTable->brackets,
            'legal_source' => $irtTable->legal_source,
            'legal_reference' => $irtTable->legal_reference,
            'legal_document_path' => $irtTable->legal_document_path,
        ];

        $result = $this->replicateTablePayloadToTenants($payload, $tenantIds, $shouldActivate, (int) $user->id);

        return $this->success([
            'created_count' => $result['created_count'],
            'updated_count' => $result['updated_count'],
            'total_applied' => $result['created_count'] + $result['updated_count'],
            'tenant_ids' => $tenantIds,
        ], 'Tabela IRT aplicada a '.count($tenantIds).' empresa(s) com sucesso.');
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $tenantIds
     * @return array{primary: PayrollIrtTable, created_count: int, updated_count: int}
     */
    private function replicateTablePayloadToTenants(
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

                    $existing = PayrollIrtTable::withoutGlobalScopes()
                        ->where('tenant_id', $targetTenantId)
                        ->where('country_code', $payload['country_code'])
                        ->where('regime_code', $payload['regime_code'])
                        ->where('status', '!=', 'revoked')
                        ->whereDate('effective_from', $payload['effective_from'])
                        ->first();

                    if ($shouldActivate) {
                        PayrollIrtTable::withoutGlobalScopes()
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
                            'brackets' => $payload['brackets'],
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
                        $nextVersion = ((int) PayrollIrtTable::withoutGlobalScopes()
                            ->where('tenant_id', $targetTenantId)
                            ->where('country_code', $payload['country_code'])
                            ->where('regime_code', $payload['regime_code'])
                            ->max('version')) + 1;

                        $created = PayrollIrtTable::withoutGlobalScopes()->create([
                            'tenant_id' => $targetTenantId,
                            'country_code' => $payload['country_code'],
                            'regime_code' => $payload['regime_code'],
                            'version' => $nextVersion,
                            'effective_from' => $payload['effective_from'],
                            'effective_to' => $payload['effective_to'] ?? null,
                            'brackets' => $payload['brackets'],
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

    public function downloadDocument(PayrollIrtTable $irtTable, CloudinaryService $cloudinary): StreamedResponse|RedirectResponse|JsonResponse
    {
        $this->authorize('view', $irtTable);

        if (! $irtTable->legal_document_path) {
            return $this->error('Documento não encontrado.', 404);
        }

        if ($cloudinary->isCloudinaryUrl($irtTable->legal_document_path)) {
            return redirect()->away($irtTable->legal_document_path);
        }

        if (! Storage::disk('local')->exists($irtTable->legal_document_path)) {
            return $this->error('Documento não encontrado.', 404);
        }

        return Storage::disk('local')->download($irtTable->legal_document_path, basename($irtTable->legal_document_path));
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
