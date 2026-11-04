<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\PayrollInssRuleResource;
use App\Models\PayrollInssRule;
use Illuminate\Http\JsonResponse;
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
            $id = (int) (\App\Models\Tenant::query()->where('is_active', true)->orderBy('id')->value('id') ?: \App\Models\Tenant::query()->orderBy('id')->value('id'));
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

    public function store(Request $request): JsonResponse
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
        ]);

        $legalDocument = $request->file('legal_document');
        unset($data['legal_document']);

        $duplicateExists = PayrollInssRule::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->where('status', '!=', 'revoked')
            ->whereDate('effective_from', $data['effective_from'])
            ->exists();

        if ($duplicateExists) {
            return $this->error('Já existe uma regra INSS para esta data de início e regime.', 422, [
                'effective_from' => ['Já existe uma regra INSS para esta data de início e regime.'],
            ]);
        }

        $data['tenant_id'] = $tenantId;
        $data['status'] = 'draft';
        $data['version'] = ((int) PayrollInssRule::query()
            ->when($tenantId, fn ($q) => $q->where('tenant_id', $tenantId))
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->max('version')) + 1;

        if ($legalDocument) {
            $data['legal_document_path'] = $legalDocument->store(
                'payroll-regulations/' . $tenantId . '/inss',
                'local'
            );
        }

        $rule = PayrollInssRule::query()->create($data);

        return $this->success(
            new PayrollInssRuleResource($rule),
            'Regra INSS criada como rascunho.',
            201
        );
    }

    public function show(PayrollInssRule $rule): JsonResponse
    {
        $this->authorize('view', $rule);

        return $this->success(new PayrollInssRuleResource($rule->load(['validatedBy:id,name', 'revokedBy:id,name'])));
    }

    public function update(Request $request, PayrollInssRule $rule): JsonResponse
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
            $data['legal_document_path'] = $legalDocument->store(
                'payroll-regulations/' . $rule->tenant_id . '/inss',
                'local'
            );
        }

        $rule->update($data);

        if ($legalDocument && $oldDocumentPath) {
            Storage::disk('local')->delete($oldDocumentPath);
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
            Storage::disk('local')->delete($documentPath);
        }

        return $this->success(null, 'Regra eliminada com sucesso.');
    }
}

