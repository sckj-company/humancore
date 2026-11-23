<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Payroll\CompanyPayrollDossierService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class CompanyPayrollReportController extends BaseController
{
    public function __construct(private readonly CompanyPayrollDossierService $dossierService) {}

    public function overview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'periodicity' => ['nullable', Rule::in(CompanyPayrollDossierService::PERIODICITIES)],
            'year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
            'quarter' => ['nullable', 'integer', 'min:1', 'max:4'],
            'semester' => ['nullable', 'integer', 'min:1', 'max:2'],
            'tenant_ids' => ['nullable'],
        ]);

        $tenantIds = $this->parseTenantIds($request->input('tenant_ids'));
        $tenants = $this->accessibleTenants($request->user(), $tenantIds);

        $range = $this->dossierService->resolvePeriodRange(
            periodicity: (string) ($validated['periodicity'] ?? 'monthly'),
            year: (int) ($validated['year'] ?? now()->year),
            month: isset($validated['month']) ? (int) $validated['month'] : (int) now()->month,
            quarter: isset($validated['quarter']) ? (int) $validated['quarter'] : null,
            semester: isset($validated['semester']) ? (int) $validated['semester'] : null,
        );

        return $this->success($this->dossierService->buildOverview($tenants, $range));
    }

    public function inspectTenant(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorizeTenantAccess($request->user(), $tenant);

        $validated = $request->validate([
            'year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
            'period_id' => ['nullable', 'integer'],
        ]);

        $year = (int) ($validated['year'] ?? now()->year);
        $month = (int) ($validated['month'] ?? now()->month);
        $periodId = isset($validated['period_id']) ? (int) $validated['period_id'] : null;

        return $this->success(
            $this->dossierService->inspectTenantMonth($tenant, $year, $month, $periodId)
        );
    }

    public function downloadCompanyDossier(Request $request, Tenant $tenant): SymfonyResponse
    {
        $this->authorizeTenantAccess($request->user(), $tenant);

        $validated = $request->validate([
            'period_id' => ['nullable', 'integer'],
            'year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
            'sections' => ['nullable', 'array'],
            'sections.*' => ['string', Rule::in(CompanyPayrollDossierService::DOSSIER_SECTIONS)],
            'lang' => ['nullable', 'string'],
            'disposition' => ['nullable', Rule::in(['inline', 'attachment'])],
        ]);

        $result = $this->dossierService->buildCompanyDossierPdf(
            tenant: $tenant,
            periodId: isset($validated['period_id']) ? (int) $validated['period_id'] : null,
            year: (int) ($validated['year'] ?? now()->year),
            month: (int) ($validated['month'] ?? now()->month),
            sections: $validated['sections'] ?? CompanyPayrollDossierService::DOSSIER_SECTIONS,
            lang: $validated['lang'] ?? null,
            actor: $request->user(),
        );

        $disposition = $validated['disposition'] ?? 'attachment';

        return response($result['binary'], 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "{$disposition}; filename=\"{$result['filename']}\"",
            'X-Payroll-Period-Id' => (string) $result['period']->id,
            'X-INSS-Paid' => $result['inss_paid'] ? '1' : '0',
        ]);
    }

    public function downloadCompanyInssMap(Request $request, Tenant $tenant): SymfonyResponse
    {
        return $this->downloadCompanyTaxMap($request, $tenant, 'inss');
    }

    public function downloadCompanyIrtMap(Request $request, Tenant $tenant): SymfonyResponse
    {
        return $this->downloadCompanyTaxMap($request, $tenant, 'irt');
    }

    private function downloadCompanyTaxMap(Request $request, Tenant $tenant, string $mapType): SymfonyResponse
    {
        $this->authorizeTenantAccess($request->user(), $tenant);

        $validated = $request->validate([
            'period_id' => ['nullable', 'integer'],
            'year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
            'lang' => ['nullable', 'string'],
            'disposition' => ['nullable', Rule::in(['inline', 'attachment'])],
        ]);

        $result = $this->dossierService->buildCompanyTaxMapPdf(
            tenant: $tenant,
            mapType: $mapType,
            periodId: isset($validated['period_id']) ? (int) $validated['period_id'] : null,
            year: (int) ($validated['year'] ?? now()->year),
            month: (int) ($validated['month'] ?? now()->month),
            lang: $validated['lang'] ?? null,
            actor: $request->user(),
        );

        if (($validated['disposition'] ?? 'attachment') === 'inline') {
            return $result['pdf']->stream($result['filename']);
        }

        return $result['pdf']->download($result['filename']);
    }

    public function downloadBulkSingular(Request $request): SymfonyResponse
    {
        $validated = $request->validate([
            'tenant_ids' => ['nullable', 'array'],
            'tenant_ids.*' => ['integer'],
            'year' => ['required', 'integer', 'min:2000', 'max:2100'],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
            'sections' => ['nullable', 'array'],
            'sections.*' => ['string', Rule::in(CompanyPayrollDossierService::DOSSIER_SECTIONS)],
            'lang' => ['nullable', 'string'],
        ]);

        $tenantIds = ! empty($validated['tenant_ids']) ? array_map('intval', $validated['tenant_ids']) : null;
        $tenants = $this->accessibleTenants($request->user(), $tenantIds);

        if ($tenants->isEmpty()) {
            return $this->error('Nenhuma empresa disponível para exportar.', 422);
        }

        $zip = $this->dossierService->buildBulkSingularZip(
            tenants: $tenants,
            year: (int) $validated['year'],
            month: (int) $validated['month'],
            sections: $validated['sections'] ?? CompanyPayrollDossierService::DOSSIER_SECTIONS,
            lang: $validated['lang'] ?? null,
            actor: $request->user(),
        );

        return response()->download($zip['path'], $zip['filename'], [
            'Content-Type' => 'application/zip',
            'X-Included-Count' => (string) $zip['included_count'],
            'X-Skipped-Count' => (string) count($zip['skipped']),
        ])->deleteFileAfterSend(true);
    }

    public function downloadGeneralSummaryPdf(Request $request): SymfonyResponse
    {
        $validated = $request->validate([
            'periodicity' => ['nullable', Rule::in(CompanyPayrollDossierService::PERIODICITIES)],
            'year' => ['nullable', 'integer', 'min:2000', 'max:2100'],
            'month' => ['nullable', 'integer', 'min:1', 'max:12'],
            'quarter' => ['nullable', 'integer', 'min:1', 'max:4'],
            'semester' => ['nullable', 'integer', 'min:1', 'max:2'],
            'tenant_ids' => ['nullable', 'array'],
            'tenant_ids.*' => ['integer'],
            'lang' => ['nullable', 'string'],
            'disposition' => ['nullable', Rule::in(['inline', 'attachment'])],
        ]);

        $tenantIds = ! empty($validated['tenant_ids']) ? array_map('intval', $validated['tenant_ids']) : null;
        $tenants = $this->accessibleTenants($request->user(), $tenantIds);

        if ($tenants->isEmpty()) {
            return $this->error('Nenhuma empresa selecionada para gerar o resumo.', 422);
        }

        $range = $this->dossierService->resolvePeriodRange(
            periodicity: (string) ($validated['periodicity'] ?? 'monthly'),
            year: (int) ($validated['year'] ?? now()->year),
            month: isset($validated['month']) ? (int) $validated['month'] : (int) now()->month,
            quarter: isset($validated['quarter']) ? (int) $validated['quarter'] : null,
            semester: isset($validated['semester']) ? (int) $validated['semester'] : null,
        );

        $overview = $this->dossierService->buildOverview($tenants, $range);
        $scopeLabel = $tenants->count() === 1
            ? $tenants->first()->name
            : ($tenantIds !== null
                ? "{$tenants->count()} empresa(s) selecionada(s)"
                : "Todas as empresas ({$tenants->count()})");

        $pdf = $this->dossierService->renderGeneralSummaryPdf(
            overview: $overview,
            scopeLabel: $scopeLabel,
            lang: $validated['lang'] ?? null,
            actor: $request->user(),
        );

        $filename = "resumo-geral-empresas-{$range['code']}.pdf";
        if (($validated['disposition'] ?? 'attachment') === 'inline') {
            return $pdf->stream($filename);
        }

        return $pdf->download($filename);
    }

    /**
     * @param  array<int, int>|null  $tenantIds
     * @return Collection<int, Tenant>
     */
    private function accessibleTenants(User $user, ?array $tenantIds = null): Collection
    {
        $this->authorize('viewAny', Tenant::class);

        return Tenant::query()
            ->when($tenantIds !== null && $tenantIds !== [], fn ($q) => $q->whereIn('id', $tenantIds))
            ->orderBy('name')
            ->get()
            ->filter(fn (Tenant $tenant) => $user->canAccessTenant($tenant->id))
            ->values();
    }

    private function authorizeTenantAccess(User $user, Tenant $tenant): void
    {
        $this->authorize('viewAny', Tenant::class);

        if (! $user->canAccessTenant($tenant->id)) {
            abort(403, 'Sem acesso a esta empresa.');
        }
    }

    /**
     * @return array<int, int>|null
     */
    private function parseTenantIds(mixed $raw): ?array
    {
        if (is_array($raw)) {
            $ids = array_values(array_unique(array_filter(array_map('intval', $raw), fn ($id) => $id > 0)));

            return $ids === [] ? null : $ids;
        }

        if (is_string($raw) && trim($raw) !== '') {
            $ids = array_values(array_unique(array_filter(array_map('intval', explode(',', $raw)), fn ($id) => $id > 0)));

            return $ids === [] ? null : $ids;
        }

        return null;
    }
}
