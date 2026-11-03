<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\SalaryComponentRegulationResource;
use App\Models\SalaryComponent;
use App\Models\SalaryComponentRegulation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class SalaryComponentRegulationController extends BaseController
{
    public function components(): JsonResponse
    {
        $this->authorize('viewAny', SalaryComponentRegulation::class);

        return $this->success(SalaryComponent::query()
            ->select(['id', 'name', 'code', 'type'])
            ->orderBy('name')
            ->get());
    }

    public function storeComponent(Request $request): JsonResponse
    {
        $this->authorize('create', SalaryComponentRegulation::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => [
                'required',
                'string',
                'max:50',
                'regex:/^[a-z][a-z0-9_]*$/',
                Rule::unique('salary_components', 'code')->where('tenant_id', tenant_id()),
            ],
            'type' => ['required', Rule::in(['earning', 'deduction', 'benefit', 'tax', 'contribution'])],
            'calculation_type' => ['required', Rule::in(['fixed', 'percentage', 'formula', 'hours'])],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);

        $component = SalaryComponent::query()->create([
            ...$data,
            'tenant_id' => tenant_id(),
            'default_value' => 0,
            'is_mandatory' => false,
            'is_taxable' => false,
        ]);

        return $this->success($component, 'Componente salarial criado sem regra de incidência.', 201);
    }

    public function initializeAngolaDefaults(): JsonResponse
    {
        $this->authorize('create', SalaryComponentRegulation::class);

        $definitions = [
            ['code' => 'base_salary', 'name' => 'Salário Base', 'type' => 'earning', 'calculation_type' => 'fixed', 'priority' => 10],
            ['code' => 'meal_allowance', 'name' => 'Subsídio de Alimentação', 'type' => 'benefit', 'calculation_type' => 'fixed', 'priority' => 20],
            ['code' => 'transport_allowance', 'name' => 'Subsídio de Transporte', 'type' => 'benefit', 'calculation_type' => 'fixed', 'priority' => 21],
            ['code' => 'housing_allowance', 'name' => 'Subsídio de Habitação', 'type' => 'benefit', 'calculation_type' => 'fixed', 'priority' => 22],
            ['code' => 'function_allowance', 'name' => 'Subsídio de Função', 'type' => 'earning', 'calculation_type' => 'fixed', 'priority' => 23],
            ['code' => 'overtime', 'name' => 'Horas Extraordinárias', 'type' => 'earning', 'calculation_type' => 'hours', 'priority' => 30],
            ['code' => 'night_work', 'name' => 'Trabalho Nocturno', 'type' => 'earning', 'calculation_type' => 'hours', 'priority' => 31],
            ['code' => 'productivity_bonus', 'name' => 'Prémio de Produtividade', 'type' => 'earning', 'calculation_type' => 'fixed', 'priority' => 40],
            ['code' => 'commission', 'name' => 'Comissões', 'type' => 'earning', 'calculation_type' => 'percentage', 'priority' => 41],
            ['code' => 'vacation_subsidy', 'name' => 'Subsídio de Férias', 'type' => 'benefit', 'calculation_type' => 'fixed', 'priority' => 50],
            ['code' => 'christmas_subsidy', 'name' => 'Subsídio de Natal', 'type' => 'benefit', 'calculation_type' => 'fixed', 'priority' => 51],
        ];

        $componentsCreated = 0;
        foreach ($definitions as $definition) {
            $component = SalaryComponent::query()->firstOrCreate(
                ['tenant_id' => tenant_id(), 'code' => $definition['code']],
                [
                    ...$definition,
                    'default_value' => 0,
                    'is_mandatory' => false,
                    'is_taxable' => false,
                ],
            );
            $componentsCreated += (int) $component->wasRecentlyCreated;
        }

        $regulationsCreated = 0;
        $components = SalaryComponent::query()->orderBy('id')->get();
        foreach ($components as $component) {
            $hasAngolaStandardRule = $component->regulations()
                ->where('country_code', 'AO')
                ->where('regime_code', 'standard')
                ->exists();

            if ($hasAngolaStandardRule) {
                continue;
            }

            $isBaseSalary = $component->code === 'base_salary';
            SalaryComponentRegulation::query()->create([
                'tenant_id' => tenant_id(),
                'salary_component_id' => $component->id,
                'country_code' => 'AO',
                'regime_code' => 'standard',
                'version' => 1,
                'effective_from' => now()->toDateString(),
                'employee_inss_applicable' => $isBaseSalary ? true : null,
                'employer_inss_applicable' => $isBaseSalary ? true : null,
                'irt_applicable' => $isBaseSalary ? true : null,
                'status' => 'draft',
            ]);
            $regulationsCreated++;
        }

        return $this->success([
            'components_created' => $componentsCreated,
            'draft_regulations_created' => $regulationsCreated,
        ], 'Componentes e rascunhos de Angola inicializados. Revise as incidências antes de validar.');
    }

    public function index(): JsonResponse
    {
        $this->authorize('viewAny', SalaryComponentRegulation::class);

        $components = SalaryComponent::query()
            ->select(['id', 'name', 'code', 'type'])
            ->orderBy('name')
            ->get();

        $regulations = SalaryComponentRegulation::query()
            ->with(['component:id,name,code,type', 'validatedBy:id,name'])
            ->orderBy('salary_component_id')
            ->orderByDesc('version')
            ->get();

        return $this->success([
            'components' => $components,
            'regulations' => SalaryComponentRegulationResource::collection($regulations)->resolve(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', SalaryComponentRegulation::class);
        $request->merge(['country_code' => strtoupper((string) $request->input('country_code', 'AO'))]);

        $data = $request->validate([
            'salary_component_id' => [
                'required',
                'integer',
                Rule::exists('salary_components', 'id')->where('tenant_id', tenant_id()),
            ],
            'country_code' => ['required', 'string', 'size:2', 'regex:/^[A-Z]{2}$/'],
            'regime_code' => ['required', 'string', 'max:50'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'employee_inss_applicable' => ['nullable', 'boolean'],
            'employer_inss_applicable' => ['nullable', 'boolean'],
            'irt_applicable' => ['nullable', 'boolean'],
            'legal_source' => ['nullable', 'string', 'max:5000'],
            'legal_reference' => ['nullable', 'string', 'max:255'],
            'legal_document' => ['nullable', 'file', 'mimes:pdf,png,jpg,jpeg', 'max:10240'],
        ]);

        $legalDocument = $request->file('legal_document');
        unset($data['legal_document']);
        $duplicateExists = SalaryComponentRegulation::query()
            ->where('salary_component_id', $data['salary_component_id'])
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->whereDate('effective_from', $data['effective_from'])
            ->exists();

        if ($duplicateExists) {
            return $this->error('Já existe uma regra para esta componente e data de início.', 422, [
                'effective_from' => ['Já existe uma regra para esta componente e data de início.'],
            ]);
        }

        $component = SalaryComponent::query()->findOrFail($data['salary_component_id']);
        $data['tenant_id'] = tenant_id();
        $data['status'] = 'draft';
        $data['version'] = ((int) $component->regulations()
            ->where('country_code', $data['country_code'])
            ->where('regime_code', $data['regime_code'])
            ->max('version')) + 1;

        if ($legalDocument) {
            $data['legal_document_path'] = $legalDocument->store(
                'payroll-regulations/'.tenant_id().'/'.$component->id,
                'local',
            );
        }

        $regulation = SalaryComponentRegulation::query()->create($data);

        return $this->success(
            new SalaryComponentRegulationResource($regulation->load('component:id,name,code,type')),
            'Regra salarial criada como rascunho.',
            201,
        );
    }

    public function update(Request $request, SalaryComponentRegulation $regulation): JsonResponse
    {
        $this->authorize('update', $regulation);

        if ($regulation->status !== 'draft') {
            return $this->error('Só é possível editar regras em rascunho.', 422);
        }

        $data = $request->validate([
            'effective_from' => ['sometimes', 'required', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
            'employee_inss_applicable' => ['sometimes', 'nullable', 'boolean'],
            'employer_inss_applicable' => ['sometimes', 'nullable', 'boolean'],
            'irt_applicable' => ['sometimes', 'nullable', 'boolean'],
            'legal_source' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'legal_reference' => ['sometimes', 'nullable', 'string', 'max:255'],
            'legal_document' => ['nullable', 'file', 'mimes:pdf,png,jpg,jpeg', 'max:10240'],
        ]);

        $legalDocument = $request->file('legal_document');
        unset($data['legal_document']);
        if (isset($data['effective_from'])) {
            $duplicateExists = SalaryComponentRegulation::query()
                ->whereKeyNot($regulation->id)
                ->where('salary_component_id', $regulation->salary_component_id)
                ->where('country_code', $regulation->country_code)
                ->where('regime_code', $regulation->regime_code)
                ->whereDate('effective_from', $data['effective_from'])
                ->exists();

            if ($duplicateExists) {
                return $this->error('Já existe uma regra para esta componente e data de início.', 422, [
                    'effective_from' => ['Já existe uma regra para esta componente e data de início.'],
                ]);
            }
        }

        $oldDocumentPath = $regulation->legal_document_path;
        if ($legalDocument) {
            $data['legal_document_path'] = $legalDocument->store(
                'payroll-regulations/'.$regulation->tenant_id.'/'.$regulation->salary_component_id,
                'local',
            );
        }

        $regulation->update($data);
        if ($legalDocument && $oldDocumentPath) {
            Storage::disk('local')->delete($oldDocumentPath);
        }

        return $this->success(
            new SalaryComponentRegulationResource($regulation->fresh()->load('component:id,name,code,type')),
            'Rascunho atualizado com sucesso.',
        );
    }

    public function validateRegulation(Request $request, SalaryComponentRegulation $regulation): JsonResponse
    {
        $this->authorize('validate', $regulation);

        if ($regulation->status !== 'draft') {
            return $this->error('Só é possível validar regras em rascunho.', 422);
        }

        if (
            $regulation->employee_inss_applicable === null
            || $regulation->employer_inss_applicable === null
            || $regulation->irt_applicable === null
        ) {
            return $this->error('Preencha as três incidências antes de validar. O diploma/fonte é opcional.', 422);
        }

        $regulation->update([
            'status' => 'validated',
            'validated_at' => now(),
            'validated_by' => $request->user()->id,
        ]);

        return $this->success(
            new SalaryComponentRegulationResource($regulation->fresh()->load('component:id,name,code,type', 'validatedBy:id,name')),
            'Regra marcada como validada. Confirme a activação para a disponibilizar aos cálculos.',
        );
    }

    public function activate(SalaryComponentRegulation $regulation): JsonResponse
    {
        $this->authorize('activate', $regulation);

        if ($regulation->status !== 'validated') {
            return $this->error('Apenas regras validadas podem ser activadas.', 422);
        }

        $hasOverlap = SalaryComponentRegulation::query()
            ->where('id', '!=', $regulation->id)
            ->where('salary_component_id', $regulation->salary_component_id)
            ->where('country_code', $regulation->country_code)
            ->where('regime_code', $regulation->regime_code)
            ->where('status', 'active')
            ->whereDate('effective_from', '<=', $regulation->effective_to ?? '9999-12-31')
            ->where(function ($query) use ($regulation): void {
                $query->whereNull('effective_to')
                    ->orWhereDate('effective_to', '>=', $regulation->effective_from);
            })
            ->exists();

        if ($hasOverlap) {
            return $this->error('A vigência sobrepõe-se a outra regra activa. Ajuste as datas antes de activar.', 422);
        }

        DB::transaction(fn () => $regulation->update(['status' => 'active']));

        return $this->success(
            new SalaryComponentRegulationResource($regulation->fresh()->load('component:id,name,code,type', 'validatedBy:id,name')),
            'Regra activada para a vigência indicada.',
        );
    }

    public function destroy(SalaryComponentRegulation $regulation): JsonResponse
    {
        $this->authorize('delete', $regulation);

        if ($regulation->status !== 'draft') {
            return $this->error('Só rascunhos podem ser eliminados. Regras validadas ou activas devem ser revogadas.', 422);
        }

        $documentPath = $regulation->legal_document_path;
        $regulation->delete();

        if ($documentPath) {
            Storage::disk('local')->delete($documentPath);
        }

        return $this->success(null, 'Rascunho eliminado.');
    }

    public function revoke(Request $request, SalaryComponentRegulation $regulation): JsonResponse
    {
        $this->authorize('revoke', $regulation);

        if (! in_array($regulation->status, ['validated', 'active'], true)) {
            return $this->error('Só regras validadas ou activas podem ser revogadas.', 422);
        }

        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        $regulation->update([
            'status' => 'revoked',
            'revoked_at' => now(),
            'revoked_by' => $request->user()->id,
            'revocation_reason' => $data['reason'],
        ]);

        return $this->success(
            new SalaryComponentRegulationResource($regulation->fresh()->load('component:id,name,code,type', 'validatedBy:id,name', 'revokedBy:id,name')),
            'Regra revogada; o histórico foi preservado.',
        );
    }

    public function downloadDocument(SalaryComponentRegulation $regulation): StreamedResponse|JsonResponse
    {
        $this->authorize('view', $regulation);

        if (! $regulation->legal_document_path || ! Storage::disk('local')->exists($regulation->legal_document_path)) {
            return $this->error('Documento não encontrado.', 404);
        }

        return Storage::disk('local')->download(
            $regulation->legal_document_path,
            basename($regulation->legal_document_path),
        );
    }
}
