<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\PayrollIrtTableResource;
use App\Models\PayrollIrtTable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

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
            $id = (int) (\App\Models\Tenant::query()->where('is_active', true)->orderBy('id')->value('id') ?: \App\Models\Tenant::query()->orderBy('id')->value('id'));
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

    public function store(Request $request): JsonResponse
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
        ]);

        $legalDocument = $request->file('legal_document');
        unset($data['legal_document']);

        $duplicateExists = PayrollIrtTable::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->whereDate('effective_from', $data['effective_from'])
            ->exists();

        if ($duplicateExists) {
            return $this->error('Já existe uma tabela IRT para esta data de início e regime.', 422, [
                'effective_from' => ['Já existe uma tabela IRT para esta data de início e regime.'],
            ]);
        }

        $data['tenant_id'] = $tenantId;
        $data['status'] = 'draft';
        $data['version'] = ((int) PayrollIrtTable::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->max('version')) + 1;

        if ($legalDocument) {
            $data['legal_document_path'] = $legalDocument->store(
                'payroll-regulations/' . $tenantId . '/irt',
                'local'
            );
        }

        $table = PayrollIrtTable::query()->create($data);

        return $this->success(
            new PayrollIrtTableResource($table),
            'Tabela IRT criada como rascunho.',
            201
        );
    }

    public function show(PayrollIrtTable $irtTable): JsonResponse
    {
        $this->authorize('view', $irtTable);

        return $this->success(new PayrollIrtTableResource($irtTable->load(['validatedBy:id,name', 'revokedBy:id,name'])));
    }

    public function update(Request $request, PayrollIrtTable $irtTable): JsonResponse
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
            $data['legal_document_path'] = $legalDocument->store(
                'payroll-regulations/' . $irtTable->tenant_id . '/irt',
                'local'
            );
        }

        $irtTable->update($data);

        if ($legalDocument && $oldDocumentPath) {
            Storage::disk('local')->delete($oldDocumentPath);
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

        $irtTable->update([
            'status' => 'revoked',
            'revoked_at' => now(),
            'revoked_by' => $request->user()->id,
            'revocation_reason' => $data['reason'],
        ]);

        return $this->success(
            new PayrollIrtTableResource($irtTable->fresh()->load(['validatedBy:id,name', 'revokedBy:id,name'])),
            'Tabela IRT revogada; o histórico foi preservado.'
        );
    }

    public function destroy(PayrollIrtTable $irtTable): JsonResponse
    {
        $this->authorize('delete', $irtTable);

        if ($irtTable->status !== 'draft') {
            return $this->error('Só rascunhos podem ser eliminados.', 422);
        }

        $documentPath = $irtTable->legal_document_path;
        $irtTable->delete();

        if ($documentPath) {
            Storage::disk('local')->delete($documentPath);
        }

        return $this->success(null, 'Rascunho eliminado.');
    }
}

