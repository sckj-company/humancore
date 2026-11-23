<?php

namespace App\Services\Payroll;

use App\Models\PayrollPeriod;
use App\Models\PayrollPeriodReport;
use App\Models\PayrollRecord;
use App\Models\Tenant;
use App\Models\User;
use App\Scopes\TenantScope;
use App\Services\Attendance\AttendanceReportService;
use App\Services\DocumentStorageService;
use App\Services\Tenant\TenantManager;
use App\Support\PdfDocument;
use App\Support\PdfMergerService;
use Barryvdh\DomPDF\PDF as DomPdfDocument;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use ZipArchive;

class CompanyPayrollDossierService
{
    public const DOSSIER_SECTIONS = [
        'payroll_sheet',
        'payslips',
        'inss_map',
        'irt_map',
        'inss_payment_proof',
        'attendance',
    ];

    public const PERIODICITIES = ['monthly', 'quarterly', 'semiannual', 'annual'];

    public function __construct(
        private readonly PayslipPdfService $payslipPdf,
        private readonly AttendanceReportService $attendanceReport,
        private readonly DocumentStorageService $storage,
        private readonly PdfMergerService $merger,
        private readonly TenantManager $tenantManager,
    ) {}

    /**
     * Resolve start/end dates and localized labels for monthly, quarterly, semiannual, or annual periods.
     *
     * @return array<string, mixed>
     */
    public function resolvePeriodRange(
        string $periodicity,
        int $year,
        ?int $month = null,
        ?int $quarter = null,
        ?int $semester = null,
    ): array {
        $norm = in_array($periodicity, self::PERIODICITIES, true) ? $periodicity : 'monthly';
        $safeYear = max(2000, min(2100, $year));

        if ($norm === 'quarterly') {
            $q = max(1, min(4, $quarter ?? 1));
            $startMonth = (($q - 1) * 3) + 1;
            $start = Carbon::create($safeYear, $startMonth, 1)->startOfDay();
            $end = $start->copy()->addMonths(2)->endOfMonth()->startOfDay();

            return [
                'periodicity' => 'quarterly',
                'year' => $safeYear,
                'month' => null,
                'quarter' => $q,
                'semester' => null,
                'start' => $start,
                'end' => $end,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'label' => "{$q}º Trimestre de {$safeYear}",
                'label_zh' => "{$safeYear}年 第{$q}季度",
                'code' => "{$safeYear}-T{$q}",
            ];
        }

        if ($norm === 'semiannual') {
            $s = max(1, min(2, $semester ?? 1));
            $startMonth = $s === 1 ? 1 : 7;
            $start = Carbon::create($safeYear, $startMonth, 1)->startOfDay();
            $end = $start->copy()->addMonths(5)->endOfMonth()->startOfDay();

            return [
                'periodicity' => 'semiannual',
                'year' => $safeYear,
                'month' => null,
                'quarter' => null,
                'semester' => $s,
                'start' => $start,
                'end' => $end,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'label' => "{$s}º Semestre de {$safeYear}",
                'label_zh' => "{$safeYear}年 ".($s === 1 ? '上半年' : '下半年'),
                'code' => "{$safeYear}-S{$s}",
            ];
        }

        if ($norm === 'annual') {
            $start = Carbon::create($safeYear, 1, 1)->startOfDay();
            $end = Carbon::create($safeYear, 12, 31)->startOfDay();

            return [
                'periodicity' => 'annual',
                'year' => $safeYear,
                'month' => null,
                'quarter' => null,
                'semester' => null,
                'start' => $start,
                'end' => $end,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'label' => "Ano {$safeYear}",
                'label_zh' => "{$safeYear}年度",
                'code' => (string) $safeYear,
            ];
        }

        $m = max(1, min(12, $month ?? (int) now()->month));
        $start = Carbon::create($safeYear, $m, 1)->startOfDay();
        $end = $start->copy()->endOfMonth()->startOfDay();
        $monthPt = ucfirst($start->locale('pt_BR')->translatedFormat('F'));

        return [
            'periodicity' => 'monthly',
            'year' => $safeYear,
            'month' => $m,
            'quarter' => null,
            'semester' => null,
            'start' => $start,
            'end' => $end,
            'start_date' => $start->toDateString(),
            'end_date' => $end->toDateString(),
            'label' => "{$monthPt} de {$safeYear}",
            'label_zh' => "{$safeYear}年{$m}月",
            'code' => sprintf('%04d-%02d', $safeYear, $m),
        ];
    }

    public function findPeriodForTenantMonth(Tenant $tenant, int $year, int $month, ?int $periodId = null): ?PayrollPeriod
    {
        if ($periodId !== null) {
            return PayrollPeriod::withoutGlobalScope(TenantScope::class)
                ->where('tenant_id', $tenant->id)
                ->where('id', $periodId)
                ->first();
        }

        $start = Carbon::create($year, $month, 1)->toDateString();
        $end = Carbon::create($year, $month, 1)->endOfMonth()->toDateString();

        $approved = PayrollPeriod::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->whereIn('status', PayrollPeriodReport::REPORTABLE_PERIOD_STATUSES)
            ->whereDate('period_start', '<=', $end)
            ->whereDate('period_end', '>=', $start)
            ->orderByDesc('period_end')
            ->first();

        if ($approved) {
            return $approved;
        }

        return PayrollPeriod::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->whereDate('period_start', '<=', $end)
            ->whereDate('period_end', '>=', $start)
            ->orderByDesc('period_end')
            ->first();
    }

    /**
     * Inspect readiness and compliance blockers for generating a company's complete dossier PDF.
     *
     * @return array<string, mixed>
     */
    public function inspectTenantMonth(Tenant $tenant, int $year, int $month, ?int $periodId = null): array
    {
        $period = $this->findPeriodForTenantMonth($tenant, $year, $month, $periodId);

        $availablePeriods = PayrollPeriod::withoutGlobalScope(TenantScope::class)
            ->where('tenant_id', $tenant->id)
            ->whereIn('status', PayrollPeriodReport::REPORTABLE_PERIOD_STATUSES)
            ->with('report.documents')
            ->orderByDesc('period_end')
            ->limit(24)
            ->get()
            ->map(fn (PayrollPeriod $p) => [
                'id' => $p->id,
                'name' => $p->displayName(),
                'status' => $p->status,
                'period_start' => $p->period_start?->format('Y-m-d'),
                'period_end' => $p->period_end?->format('Y-m-d'),
                'has_inss_payment_proof' => (bool) ($p->report?->hasInssPaymentProof() ?? false),
                'inss_paid' => (bool) ($p->report?->inss_paid ?? false),
            ])
            ->values()
            ->all();

        $report = $period?->report()->with(['documents.uploadedBy:id,name', 'updatedBy:id,name'])->first();
        $hasProof = $report?->hasInssPaymentProof() ?? false;
        $isReportable = $period?->isReportable() ?? false;
        $inssPaid = (bool) ($report?->inss_paid || ($report?->inssPaymentProofDocument()?->is_paid ?? false));
        $inssProofSent = (bool) ($report?->inss_payment_proof_sent || ($report?->inssPaymentProofDocument()?->is_sent ?? false));

        $blockingReason = null;
        if (! $period) {
            $blockingReason = 'Nenhum período salarial encontrado para esta empresa no mês selecionado.';
        } elseif (! $isReportable) {
            $blockingReason = 'A folha salarial do período selecionado ainda não foi aprovada.';
        } elseif (! $hasProof) {
            $blockingReason = 'Não é possível imprimir o resumo completo sem o comprovativo de pagamento do INSS anexado no relatório da folha.';
        }

        $periodFinancials = $period ? $this->extractPeriodFinancials(
            $period->loadMissing(['records.employee.department', 'records.contract.position', 'records.items.deduction'])
        ) : null;

        return [
            'tenant' => [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'tax_id' => $tenant->tax_id,
                'inss_number' => $tenant->inss_number,
                'currency' => $tenant->currency ?? 'AOA',
            ],
            'period' => $period ? [
                'id' => $period->id,
                'name' => $period->displayName(),
                'period_type' => $period->period_type,
                'period_start' => $period->period_start?->format('Y-m-d'),
                'period_end' => $period->period_end?->format('Y-m-d'),
                'status' => $period->status,
                'is_reportable' => $isReportable,
                'employees_count' => $periodFinancials['employees_count'] ?? 0,
                'total_gross' => $periodFinancials['total_gross'] ?? 0.0,
                'total_net' => $periodFinancials['total_net'] ?? 0.0,
                'total_inss' => $periodFinancials['total_inss'] ?? 0.0,
                'total_irt' => $periodFinancials['total_irt'] ?? 0.0,
            ] : null,
            'has_inss_payment_proof' => $hasProof,
            'inss_paid' => $inssPaid,
            'inss_payment_proof_sent' => $inssProofSent,
            'mandatory_status' => $report?->mandatoryStatus(),
            'can_print' => $blockingReason === null,
            'blocking_reason' => $blockingReason,
            'available_periods' => $availablePeriods,
        ];
    }

    /**
     * Extract financial totals, INSS remittance rows, and IRT tax rows from a loaded period.
     *
     * @param  Collection<int, PayrollRecord>|null  $records
     * @return array<string, mixed>
     */
    public function extractPeriodFinancials(PayrollPeriod $period, ?Collection $records = null): array
    {
        if ($records === null) {
            $records = $period->relationLoaded('records')
                ? $period->records
                : $period->records()->with(['employee.department', 'contract.position', 'items.deduction'])->get();
        }

        $inssRows = [];
        $irtRows = [];

        $totals = [
            'employees_count' => $records->count(),
            'total_base_salary' => 0.0,
            'total_gross' => 0.0,
            'total_inss_base' => 0.0,
            'total_inss_employee' => 0.0,
            'total_inss_employer' => 0.0,
            'total_inss' => 0.0,
            'total_irt_base' => 0.0,
            'total_irt' => 0.0,
            'total_deductions' => 0.0,
            'total_net' => 0.0,
            'total_employer_cost' => 0.0,
        ];

        $sorted = $records
            ->sortBy(fn (PayrollRecord $r) => mb_strtolower((string) ($r->employee?->full_name ?? '')))
            ->values();

        foreach ($sorted as $record) {
            $items = $record->items;
            $inssItem = $items->firstWhere('code', 'inss');
            $employerInssItem = $items->firstWhere('code', 'employer_inss');
            $irtItem = $items->firstWhere('code', 'irt');

            $breakdown = collect($record->details['breakdown'] ?? []);
            $inssEmpAmount = $inssItem
                ? abs((float) $inssItem->amount)
                : abs((float) ($breakdown->firstWhere('code', 'inss')['amount'] ?? 0));
            $inssEmployerAmount = $employerInssItem
                ? abs((float) $employerInssItem->amount)
                : (float) ($record->employer_inss ?? 0);
            $irtAmount = $irtItem
                ? abs((float) $irtItem->amount)
                : (float) ($record->total_taxes ?? 0);

            $baseSalary = (float) ($record->base_salary ?? 0);
            $gross = (float) ($record->gross_salary ?? 0);
            $inssBase = (float) ($record->inss_base > 0 ? $record->inss_base : $gross);
            $employerInssBase = (float) ($record->employer_inss_base > 0 ? $record->employer_inss_base : $inssBase);
            $irtBase = (float) ($record->irt_taxable_base > 0 ? $record->irt_taxable_base : max(0, $gross - $inssEmpAmount));
            $deductions = (float) ($record->total_deductions ?? 0);
            $net = (float) ($record->net_salary ?? 0);
            $employerCost = (float) ($record->employer_cost > 0 ? $record->employer_cost : ($gross + $inssEmployerAmount));

            $empRate = $inssItem && (float) $inssItem->rate > 0
                ? (float) $inssItem->rate
                : ($inssBase > 0 ? round(($inssEmpAmount / $inssBase) * 100, 2) : 3.0);
            $employerRate = $employerInssItem && (float) $employerInssItem->rate > 0
                ? (float) $employerInssItem->rate
                : ($employerInssBase > 0 ? round(($inssEmployerAmount / $employerInssBase) * 100, 2) : 8.0);

            $emp = $record->employee;
            $inssRows[] = [
                'employee_code' => $emp?->employee_code ?? '—',
                'full_name' => $emp?->full_name ?? '—',
                'social_security_id' => $emp?->social_security_id ?? '—',
                'tax_id' => $emp?->tax_id ?? '—',
                'department' => $emp?->department?->name ?? '—',
                'position' => $record->contract?->position?->title ?? '—',
                'inss_base' => round($inssBase, 2),
                'employee_rate' => round($empRate, 2),
                'employee_inss' => round($inssEmpAmount, 2),
                'employer_rate' => round($employerRate, 2),
                'employer_inss' => round($inssEmployerAmount, 2),
                'total_inss' => round($inssEmpAmount + $inssEmployerAmount, 2),
            ];

            $irtRows[] = [
                'employee_code' => $emp?->employee_code ?? '—',
                'full_name' => $emp?->full_name ?? '—',
                'tax_id' => $emp?->tax_id ?? '—',
                'department' => $emp?->department?->name ?? '—',
                'position' => $record->contract?->position?->title ?? '—',
                'gross_salary' => round($gross, 2),
                'employee_inss' => round($inssEmpAmount, 2),
                'irt_taxable_base' => round($irtBase, 2),
                'irt_amount' => round($irtAmount, 2),
                'net_salary' => round($net, 2),
            ];

            $totals['total_base_salary'] += $baseSalary;
            $totals['total_gross'] += $gross;
            $totals['total_inss_base'] += $inssBase;
            $totals['total_inss_employee'] += $inssEmpAmount;
            $totals['total_inss_employer'] += $inssEmployerAmount;
            $totals['total_inss'] += ($inssEmpAmount + $inssEmployerAmount);
            $totals['total_irt_base'] += $irtBase;
            $totals['total_irt'] += $irtAmount;
            $totals['total_deductions'] += $deductions;
            $totals['total_net'] += $net;
            $totals['total_employer_cost'] += $employerCost;
        }

        foreach ($totals as $k => $v) {
            if ($k !== 'employees_count') {
                $totals[$k] = round((float) $v, 2);
            }
        }

        return [
            'employees_count' => $totals['employees_count'],
            'totals' => $totals,
            'inss_rows' => $inssRows,
            'irt_rows' => $irtRows,
        ] + $totals;
    }

    /**
     * Build the combined multi-section dossier PDF for one company.
     *
     * @param  array<int, string>  $sections
     * @return array{binary: string, filename: string, period: PayrollPeriod, inss_paid: bool}
     */
    public function buildCompanyDossierPdf(
        Tenant $tenant,
        ?int $periodId,
        int $year,
        int $month,
        array $sections,
        ?string $lang,
        User $actor,
    ): array {
        $period = $this->findPeriodForTenantMonth($tenant, $year, $month, $periodId);

        if (! $period || ! $period->isReportable()) {
            throw ValidationException::withMessages([
                'period' => 'A empresa selecionada não possui uma folha salarial aprovada para o período indicado.',
            ]);
        }

        $period->load([
            'tenant',
            'processedBy:id,name',
            'approvedBy:id,name',
            'records.employee.department',
            'records.contract.position',
            'records.items.deduction',
            'report.documents.uploadedBy:id,name',
            'report.updatedBy:id,name',
        ]);

        $report = $period->report;
        $inssProofDoc = $report?->inssPaymentProofDocument();
        if (! $inssProofDoc) {
            throw ValidationException::withMessages([
                'inss_payment_proof' => 'Não é possível imprimir o resumo completo sem o comprovativo de pagamento do INSS enviado no relatório da folha salarial.',
            ]);
        }

        $normalizedSections = collect($sections)
            ->filter(fn ($s) => in_array($s, self::DOSSIER_SECTIONS, true))
            ->values()
            ->all();

        if ($normalizedSections === []) {
            $normalizedSections = self::DOSSIER_SECTIONS;
        }

        $financials = $this->extractPeriodFinancials($period);
        $inssPaid = (bool) ($report->inss_paid || $inssProofDoc->is_paid);
        $inssProofSent = (bool) ($report->inss_payment_proof_sent || $inssProofDoc->is_sent);
        $operatorName = $actor->name ?: 'Sistema';

        $chunks = [];

        // 1. Cover & Compliance Executive Sheet
        $chunks[] = PdfDocument::make(
            view: 'pdf.company-dossier-cover',
            data: [
                'tenant' => $tenant,
                'period' => $period,
                'report' => $report,
                'mandatoryStatus' => $report->mandatoryStatus(),
                'financials' => $financials,
                'sections' => $normalizedSections,
                'inssPaid' => $inssPaid,
                'inssProofSent' => $inssProofSent,
                'inssProofDoc' => $inssProofDoc,
                'operatorName' => $operatorName,
            ],
            paper: 'a4',
            orientation: 'portrait',
            lang: $lang,
        )->output();

        // 2. Payroll Sheet (Landscape)
        if (in_array('payroll_sheet', $normalizedSections, true)) {
            $chunks[] = $this->payslipPdf->renderPeriod($period, $lang)->output();
        }

        // 3. Employee Payslips (Portrait, mirrored)
        if (in_array('payslips', $normalizedSections, true) && $period->records->isNotEmpty()) {
            $sortedRecords = $period->records
                ->sortBy(fn (PayrollRecord $r) => mb_strtolower((string) ($r->employee?->full_name ?? '')))
                ->values();
            $chunks[] = $this->payslipPdf->renderBulkBinary($sortedRecords, $lang);
        }

        // 4. INSS Map (Landscape)
        if (in_array('inss_map', $normalizedSections, true)) {
            $chunks[] = PdfDocument::make(
                view: 'pdf.inss-map',
                data: [
                    'tenant' => $tenant,
                    'period' => $period,
                    'rows' => $financials['inss_rows'],
                    'totals' => $financials['totals'],
                    'inssPaid' => $inssPaid,
                    'inssProofSent' => $inssProofSent,
                    'operatorName' => $operatorName,
                ],
                paper: 'a4',
                orientation: 'landscape',
                lang: $lang,
            )->output();
        }

        // 5. IRT Map (Landscape)
        if (in_array('irt_map', $normalizedSections, true)) {
            $chunks[] = PdfDocument::make(
                view: 'pdf.irt-map',
                data: [
                    'tenant' => $tenant,
                    'period' => $period,
                    'rows' => $financials['irt_rows'],
                    'totals' => $financials['totals'],
                    'operatorName' => $operatorName,
                ],
                paper: 'a4',
                orientation: 'landscape',
                lang: $lang,
            )->output();
        }

        // 6. INSS Payment Proof (Cover + Embedded image or appended PDF)
        if (in_array('inss_payment_proof', $normalizedSections, true)) {
            $proofFile = $this->storage->readBinary($inssProofDoc->file_path);
            $imageDataUri = null;
            $externalPdfBinary = null;

            if ($proofFile !== null) {
                if (in_array($proofFile['extension'], ['png', 'jpg', 'jpeg', 'webp'], true) || str_starts_with($proofFile['mime'], 'image/')) {
                    $mime = $proofFile['mime'] !== 'application/octet-stream'
                        ? $proofFile['mime']
                        : 'image/'.($proofFile['extension'] === 'jpg' ? 'jpeg' : $proofFile['extension']);
                    $imageDataUri = 'data:'.$mime.';base64,'.base64_encode($proofFile['contents']);
                } elseif (
                    ($proofFile['extension'] === 'pdf' || str_contains($proofFile['mime'], 'pdf'))
                    && $this->merger->isValidPdf($proofFile['contents'])
                ) {
                    $externalPdfBinary = $proofFile['contents'];
                }
            }

            $chunks[] = PdfDocument::make(
                view: 'pdf.inss-proof-sheet',
                data: [
                    'tenant' => $tenant,
                    'period' => $period,
                    'document' => $inssProofDoc,
                    'inssPaid' => $inssPaid,
                    'inssProofSent' => $inssProofSent,
                    'imageDataUri' => $imageDataUri,
                    'hasAttachedPdf' => $externalPdfBinary !== null,
                    'hasFile' => $proofFile !== null,
                    'operatorName' => $operatorName,
                ],
                paper: 'a4',
                orientation: 'portrait',
                lang: $lang,
            )->output();

            if ($externalPdfBinary !== null) {
                $chunks[] = $externalPdfBinary;
            }
        }

        // 7. Attendance Report (Landscape)
        if (in_array('attendance', $normalizedSections, true)) {
            $attendanceData = $this->buildTenantAttendanceReport($tenant, $period);
            $chunks[] = PdfDocument::make(
                view: 'pdf.attendance-report',
                data: [
                    'report' => $attendanceData,
                    'operatorName' => $operatorName,
                    'isSingleEmployee' => false,
                ],
                paper: 'a4',
                orientation: 'landscape',
                lang: $lang,
            )->output();
        }

        $mergedBinary = $this->merger->merge($chunks);
        $ym = $period->period_start?->format('Y-m') ?? sprintf('%04d-%02d', $year, $month);
        $slug = preg_replace('/[^a-z0-9-]+/i', '-', strtolower($tenant->slug ?: "empresa-{$tenant->id}"));

        return [
            'binary' => $mergedBinary,
            'filename' => "resumo-completo-{$slug}-{$ym}.pdf",
            'period' => $period,
            'inss_paid' => $inssPaid,
        ];
    }

    /**
     * Generate a ZIP archive containing one complete dossier PDF per eligible company for the chosen month.
     *
     * @param  Collection<int, Tenant>  $tenants
     * @param  array<int, string>  $sections
     * @return array{path: string, filename: string, included_count: int, skipped: array<int, array<string, mixed>>}
     */
    public function buildBulkSingularZip(
        Collection $tenants,
        int $year,
        int $month,
        array $sections,
        ?string $lang,
        User $actor,
    ): array {
        $range = $this->resolvePeriodRange('monthly', $year, $month);
        $ym = $range['code'];

        $tmpZip = tempnam(sys_get_temp_dir(), 'hrms_bulk_zip_');
        if ($tmpZip === false) {
            throw new RuntimeException('Não foi possível criar o ficheiro ZIP temporário.');
        }
        $zipPath = $tmpZip.'.zip';
        @unlink($tmpZip);

        $zip = new ZipArchive;
        if ($zip->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new RuntimeException('Não foi possível inicializar o arquivo ZIP.');
        }

        $included = 0;
        $skipped = [];
        $usedFilenames = [];
        $zipOpen = true;

        try {
            foreach ($tenants as $tenant) {
                $inspection = $this->inspectTenantMonth($tenant, $year, $month);
                if (! $inspection['can_print']) {
                    $skipped[] = [
                        'tenant_id' => $tenant->id,
                        'tenant_name' => $tenant->name,
                        'tax_id' => $tenant->tax_id,
                        'reason' => $inspection['blocking_reason'],
                    ];
                    continue;
                }

                try {
                    $result = $this->buildCompanyDossierPdf(
                        tenant: $tenant,
                        periodId: $inspection['period']['id'],
                        year: $year,
                        month: $month,
                        sections: $sections,
                        lang: $lang,
                        actor: $actor,
                    );

                    $entryName = $result['filename'];
                    if (isset($usedFilenames[$entryName])) {
                        $usedFilenames[$entryName]++;
                        $entryName = str_replace('.pdf', "-{$tenant->id}.pdf", $entryName);
                    } else {
                        $usedFilenames[$entryName] = 1;
                    }

                    $zip->addFromString($entryName, $result['binary']);
                    $included++;
                } catch (\Throwable $e) {
                    $skipped[] = [
                        'tenant_id' => $tenant->id,
                        'tenant_name' => $tenant->name,
                        'tax_id' => $tenant->tax_id,
                        'reason' => $e->getMessage(),
                    ];
                }
            }

            if ($included === 0) {
                $zip->close();
                $zipOpen = false;
                @unlink($zipPath);

                $details = collect($skipped)
                    ->take(3)
                    ->map(fn ($s) => "{$s['tenant_name']}: {$s['reason']}")
                    ->implode(' | ');

                throw ValidationException::withMessages([
                    'tenants' => 'Nenhuma empresa está apta para gerar o relatório no mês selecionado (verifique se as folhas estão aprovadas e com comprovativo do INSS).'.($details !== '' ? " {$details}" : ''),
                ]);
            }

            // Include batch index summary PDF inside the ZIP
            $overview = $this->buildOverview($tenants, $range);
            $indexPdf = $this->renderGeneralSummaryPdf(
                overview: $overview,
                scopeLabel: count($tenants) === 1 ? $tenants->first()->name : "Lote de {$tenants->count()} empresas",
                lang: $lang,
                actor: $actor,
                skippedCompanies: $skipped,
            )->output();
            $zip->addFromString("00-indice-resumo-geral-{$ym}.pdf", $indexPdf);

            $zip->close();
            $zipOpen = false;
        } catch (\Throwable $e) {
            if ($zipOpen) {
                try {
                    $zip->close();
                } catch (\Throwable) {
                    // ignore cleanup close errors
                }
            }
            if (file_exists($zipPath)) {
                @unlink($zipPath);
            }
            throw $e;
        }

        return [
            'path' => $zipPath,
            'filename' => "relatorios-empresas-{$ym}.zip",
            'included_count' => $included,
            'skipped' => $skipped,
        ];
    }

    /**
     * Build consolidated multi-company (or single-company) compliance & financial overview for a periodicity.
     *
     * @param  Collection<int, Tenant>  $tenants
     * @param  array<string, mixed>  $range
     * @return array<string, mixed>
     */
    public function buildOverview(Collection $tenants, array $range): array
    {
        $tenantIds = $tenants->pluck('id')->all();

        $periods = empty($tenantIds)
            ? collect()
            : PayrollPeriod::withoutGlobalScope(TenantScope::class)
                ->whereIn('tenant_id', $tenantIds)
                ->whereIn('status', PayrollPeriodReport::REPORTABLE_PERIOD_STATUSES)
                ->whereDate('period_start', '<=', $range['end_date'])
                ->whereDate('period_end', '>=', $range['start_date'])
                ->with([
                    'tenant',
                    'records.employee.department',
                    'records.contract.position',
                    'records.items.deduction',
                    'report.documents',
                ])
                ->orderBy('period_start')
                ->orderBy('id')
                ->get();

        $periodsByTenant = $periods->groupBy('tenant_id');
        $companies = [];
        $periodRows = [];
        $monthlyTimeline = [];

        $grand = [
            'companies_total' => $tenants->count(),
            'companies_with_approved_payroll' => 0,
            'companies_ready_for_dossier' => 0,
            'periods_count' => 0,
            'reports_complete_count' => 0,
            'inss_paid_periods_count' => 0,
            'inss_proof_attached_count' => 0,
            'employees_count' => 0,
            'total_gross' => 0.0,
            'total_inss_employee' => 0.0,
            'total_inss_employer' => 0.0,
            'total_inss' => 0.0,
            'total_irt' => 0.0,
            'total_deductions' => 0.0,
            'total_net' => 0.0,
            'total_employer_cost' => 0.0,
        ];

        foreach ($tenants as $tenant) {
            $tPeriods = $periodsByTenant->get($tenant->id, collect());
            $cGross = 0.0;
            $cInssEmp = 0.0;
            $cInssEmployer = 0.0;
            $cInss = 0.0;
            $cIrt = 0.0;
            $cDeductions = 0.0;
            $cNet = 0.0;
            $cEmployerCost = 0.0;
            $cEmployees = 0;

            $completePeriods = 0;
            $inssPaidPeriods = 0;
            $inssGuideSentPeriods = 0;
            $inssProofSentPeriods = 0;
            $inssProofAttachedPeriods = 0;
            $payslipsSentPeriods = 0;
            $payrollSheetSentPeriods = 0;
            $docsTotal = 0;
            $companyPeriodDetails = [];

            foreach ($tPeriods as $p) {
                $fin = $this->extractPeriodFinancials($p);
                $report = $p->report;
                $mandatory = $report?->mandatoryStatus();

                $inssGuideSent = (bool) ($mandatory['inss_guide']['is_sent'] ?? false);
                $inssProofAttached = (bool) ($mandatory['has_inss_payment_proof'] ?? false);
                $inssProofSent = (bool) ($mandatory['inss_payment_proof']['is_sent'] ?? false);
                $inssPaid = (bool) ($mandatory['inss_paid'] ?? false);
                $payslipsSent = (bool) ($mandatory['payslips_summary_pdf']['is_sent'] ?? false);
                $payrollSheetSent = (bool) ($mandatory['payroll_sheet']['is_sent'] ?? false);
                $isComplete = (bool) ($mandatory['is_summary_complete'] ?? false);
                $docsCount = $report ? $report->documents->count() : 0;

                if ($inssGuideSent) {
                    $inssGuideSentPeriods++;
                }
                if ($inssProofAttached) {
                    $inssProofAttachedPeriods++;
                }
                if ($inssProofSent) {
                    $inssProofSentPeriods++;
                }
                if ($inssPaid) {
                    $inssPaidPeriods++;
                }
                if ($payslipsSent) {
                    $payslipsSentPeriods++;
                }
                if ($payrollSheetSent) {
                    $payrollSheetSentPeriods++;
                }
                if ($isComplete) {
                    $completePeriods++;
                }
                $docsTotal += $docsCount;

                $cGross += $fin['total_gross'];
                $cInssEmp += $fin['total_inss_employee'];
                $cInssEmployer += $fin['total_inss_employer'];
                $cInss += $fin['total_inss'];
                $cIrt += $fin['total_irt'];
                $cDeductions += $fin['total_deductions'];
                $cNet += $fin['total_net'];
                $cEmployerCost += $fin['total_employer_cost'];
                $cEmployees = max($cEmployees, $fin['employees_count']);

                $periodEntry = [
                    'period_id' => $p->id,
                    'tenant_id' => $tenant->id,
                    'tenant_name' => $tenant->name,
                    'tenant_tax_id' => $tenant->tax_id,
                    'period_name' => $p->displayName(),
                    'period_type' => $p->period_type,
                    'period_start' => $p->period_start?->format('Y-m-d'),
                    'period_end' => $p->period_end?->format('Y-m-d'),
                    'month_key' => $p->period_start?->format('Y-m') ?? '',
                    'status' => $p->status,
                    'employees_count' => $fin['employees_count'],
                    'total_gross' => $fin['total_gross'],
                    'total_inss_employee' => $fin['total_inss_employee'],
                    'total_inss_employer' => $fin['total_inss_employer'],
                    'total_inss' => $fin['total_inss'],
                    'total_irt' => $fin['total_irt'],
                    'total_deductions' => $fin['total_deductions'],
                    'total_net' => $fin['total_net'],
                    'total_employer_cost' => $fin['total_employer_cost'],
                    'inss_guide_sent' => $inssGuideSent,
                    'inss_payment_proof_attached' => $inssProofAttached,
                    'inss_payment_proof_sent' => $inssProofSent,
                    'inss_paid' => $inssPaid,
                    'payslips_summary_sent' => $payslipsSent,
                    'payroll_sheet_sent' => $payrollSheetSent,
                    'is_summary_complete' => $isComplete,
                    'documents_count' => $docsCount,
                ];

                $companyPeriodDetails[] = $periodEntry;
                $periodRows[] = $periodEntry;

                $monthKey = $periodEntry['month_key'];
                if ($monthKey !== '') {
                    if (! isset($monthlyTimeline[$monthKey])) {
                        $monthlyTimeline[$monthKey] = [
                            'month' => $monthKey,
                            'periods_count' => 0,
                            'employees_count' => 0,
                            'total_gross' => 0.0,
                            'total_inss' => 0.0,
                            'total_irt' => 0.0,
                            'total_net' => 0.0,
                            'inss_paid_count' => 0,
                            'complete_count' => 0,
                        ];
                    }
                    $monthlyTimeline[$monthKey]['periods_count']++;
                    $monthlyTimeline[$monthKey]['employees_count'] += $fin['employees_count'];
                    $monthlyTimeline[$monthKey]['total_gross'] = round($monthlyTimeline[$monthKey]['total_gross'] + $fin['total_gross'], 2);
                    $monthlyTimeline[$monthKey]['total_inss'] = round($monthlyTimeline[$monthKey]['total_inss'] + $fin['total_inss'], 2);
                    $monthlyTimeline[$monthKey]['total_irt'] = round($monthlyTimeline[$monthKey]['total_irt'] + $fin['total_irt'], 2);
                    $monthlyTimeline[$monthKey]['total_net'] = round($monthlyTimeline[$monthKey]['total_net'] + $fin['total_net'], 2);
                    if ($inssPaid) {
                        $monthlyTimeline[$monthKey]['inss_paid_count']++;
                    }
                    if ($isComplete) {
                        $monthlyTimeline[$monthKey]['complete_count']++;
                    }
                }
            }

            $pCount = $tPeriods->count();
            $hasApproved = $pCount > 0;
            $latestPeriod = $tPeriods->sortByDesc('period_end')->first();
            $latestReport = $latestPeriod?->report;
            $readyForDossier = $hasApproved && ($inssProofAttachedPeriods > 0);

            if ($hasApproved) {
                $grand['companies_with_approved_payroll']++;
            }
            if ($readyForDossier) {
                $grand['companies_ready_for_dossier']++;
            }

            $grand['periods_count'] += $pCount;
            $grand['reports_complete_count'] += $completePeriods;
            $grand['inss_paid_periods_count'] += $inssPaidPeriods;
            $grand['inss_proof_attached_count'] += $inssProofAttachedPeriods;
            $grand['employees_count'] += $cEmployees;
            $grand['total_gross'] = round($grand['total_gross'] + $cGross, 2);
            $grand['total_inss_employee'] = round($grand['total_inss_employee'] + $cInssEmp, 2);
            $grand['total_inss_employer'] = round($grand['total_inss_employer'] + $cInssEmployer, 2);
            $grand['total_inss'] = round($grand['total_inss'] + $cInss, 2);
            $grand['total_irt'] = round($grand['total_irt'] + $cIrt, 2);
            $grand['total_deductions'] = round($grand['total_deductions'] + $cDeductions, 2);
            $grand['total_net'] = round($grand['total_net'] + $cNet, 2);
            $grand['total_employer_cost'] = round($grand['total_employer_cost'] + $cEmployerCost, 2);

            $companies[] = [
                'tenant_id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'tax_id' => $tenant->tax_id,
                'inss_number' => $tenant->inss_number,
                'currency' => $tenant->currency ?? 'AOA',
                'periods_count' => $pCount,
                'has_approved_payroll' => $hasApproved,
                'ready_for_dossier' => $readyForDossier,
                'latest_period_id' => $latestPeriod?->id,
                'latest_period_name' => $latestPeriod?->displayName(),
                'latest_report_id' => $latestReport?->id,
                'employees_count' => $cEmployees,
                'total_gross' => round($cGross, 2),
                'total_inss_employee' => round($cInssEmp, 2),
                'total_inss_employer' => round($cInssEmployer, 2),
                'total_inss' => round($cInss, 2),
                'total_irt' => round($cIrt, 2),
                'total_deductions' => round($cDeductions, 2),
                'total_net' => round($cNet, 2),
                'total_employer_cost' => round($cEmployerCost, 2),
                'documents_count' => $docsTotal,
                'compliance' => [
                    'inss_guide_sent' => $hasApproved && $inssGuideSentPeriods === $pCount,
                    'inss_payment_proof_attached' => $hasApproved && $inssProofAttachedPeriods > 0,
                    'inss_payment_proof_sent' => $hasApproved && $inssProofSentPeriods === $pCount,
                    'inss_paid' => $hasApproved && $inssPaidPeriods === $pCount,
                    'payslips_summary_sent' => $hasApproved && $payslipsSentPeriods === $pCount,
                    'payroll_sheet_sent' => $hasApproved && $payrollSheetSentPeriods === $pCount,
                    'is_summary_complete' => $hasApproved && $completePeriods === $pCount,
                    'counts' => [
                        'inss_guide_sent' => $inssGuideSentPeriods,
                        'inss_payment_proof_attached' => $inssProofAttachedPeriods,
                        'inss_payment_proof_sent' => $inssProofSentPeriods,
                        'inss_paid' => $inssPaidPeriods,
                        'payslips_summary_sent' => $payslipsSentPeriods,
                        'payroll_sheet_sent' => $payrollSheetSentPeriods,
                        'complete' => $completePeriods,
                    ],
                ],
                'periods' => $companyPeriodDetails,
            ];
        }

        ksort($monthlyTimeline);

        return [
            'range' => [
                'periodicity' => $range['periodicity'],
                'year' => $range['year'],
                'month' => $range['month'],
                'quarter' => $range['quarter'],
                'semester' => $range['semester'],
                'start_date' => $range['start_date'],
                'end_date' => $range['end_date'],
                'label' => $range['label'],
                'label_zh' => $range['label_zh'],
                'code' => $range['code'],
            ],
            'totals' => $grand,
            'companies' => $companies,
            'period_rows' => $periodRows,
            'monthly_timeline' => array_values($monthlyTimeline),
        ];
    }

    /**
     * Render general or single-company summary PDF across any periodicity.
     *
     * @param  array<string, mixed>  $overview
     * @param  array<int, array<string, mixed>>  $skippedCompanies
     */
    public function renderGeneralSummaryPdf(
        array $overview,
        string $scopeLabel,
        ?string $lang,
        User $actor,
        array $skippedCompanies = [],
    ): DomPdfDocument {
        return PdfDocument::make(
            view: 'pdf.companies-general-summary',
            data: [
                'overview' => $overview,
                'scopeLabel' => $scopeLabel,
                'skippedCompanies' => $skippedCompanies,
                'operatorName' => $actor->name ?: 'Sistema',
            ],
            paper: 'a4',
            orientation: 'landscape',
            lang: $lang,
        );
    }

    /**
     * Render standalone INSS contribution map PDF for a single payroll period.
     *
     * @param  array<int, int>|null  $allowedDeptIds
     * @return array{pdf: DomPdfDocument, filename: string, period: PayrollPeriod, inss_paid: bool}
     */
    public function renderInssMapPdf(
        PayrollPeriod $period,
        ?string $lang,
        User $actor,
        ?array $allowedDeptIds = null,
    ): array {
        $tenant = $period->tenant ?? Tenant::query()->findOrFail($period->tenant_id);

        return $this->withTenantContext($tenant, function () use ($tenant, $period, $lang, $actor, $allowedDeptIds): array {
            $period->loadMissing(['tenant', 'processedBy:id,name', 'approvedBy:id,name', 'report.documents']);

            $records = $period->records()
                ->when($allowedDeptIds !== null, fn ($q) => $q->whereHas('employee', fn ($eq) => $eq->whereIn('department_id', $allowedDeptIds)))
                ->with(['employee.department', 'contract.position', 'items.deduction'])
                ->get();

            if ($records->isEmpty()) {
                throw ValidationException::withMessages([
                    'period' => 'Não existem registos salariais calculados neste período para gerar o mapa.',
                ]);
            }

            $financials = $this->extractPeriodFinancials($period, $records);
            $operatorName = $actor->name ?: 'Sistema';
            $report = $period->report;
            $proofDoc = $report?->inssPaymentProofDocument();
            $inssPaid = (bool) (($report?->inss_paid ?? false) || ($proofDoc?->is_paid ?? false));
            $inssProofSent = (bool) (($report?->inss_payment_proof_sent ?? false) || ($proofDoc?->is_sent ?? false));

            $pdf = PdfDocument::make(
                view: 'pdf.inss-map',
                data: [
                    'tenant' => $tenant,
                    'period' => $period,
                    'rows' => $financials['inss_rows'],
                    'totals' => $financials['totals'],
                    'inssPaid' => $inssPaid,
                    'inssProofSent' => $inssProofSent,
                    'operatorName' => $operatorName,
                ],
                paper: 'a4',
                orientation: 'landscape',
                lang: $lang,
            );

            $tenantSlug = $this->sanitizeFilenameSlug($tenant->slug ?: "empresa-{$tenant->id}");
            $periodCode = $period->period_start?->format('Y-m') ?? (string) $period->id;

            return [
                'pdf' => $pdf,
                'filename' => "mapa-inss-{$tenantSlug}-{$periodCode}.pdf",
                'period' => $period,
                'inss_paid' => $inssPaid,
            ];
        });
    }

    /**
     * Render standalone IRT withholding map PDF for a single payroll period.
     *
     * @param  array<int, int>|null  $allowedDeptIds
     * @return array{pdf: DomPdfDocument, filename: string, period: PayrollPeriod}
     */
    public function renderIrtMapPdf(
        PayrollPeriod $period,
        ?string $lang,
        User $actor,
        ?array $allowedDeptIds = null,
    ): array {
        $tenant = $period->tenant ?? Tenant::query()->findOrFail($period->tenant_id);

        return $this->withTenantContext($tenant, function () use ($tenant, $period, $lang, $actor, $allowedDeptIds): array {
            $period->loadMissing(['tenant', 'processedBy:id,name', 'approvedBy:id,name']);

            $records = $period->records()
                ->when($allowedDeptIds !== null, fn ($q) => $q->whereHas('employee', fn ($eq) => $eq->whereIn('department_id', $allowedDeptIds)))
                ->with(['employee.department', 'contract.position', 'items.deduction'])
                ->get();

            if ($records->isEmpty()) {
                throw ValidationException::withMessages([
                    'period' => 'Não existem registos salariais calculados neste período para gerar o mapa.',
                ]);
            }

            $financials = $this->extractPeriodFinancials($period, $records);
            $operatorName = $actor->name ?: 'Sistema';

            $pdf = PdfDocument::make(
                view: 'pdf.irt-map',
                data: [
                    'tenant' => $tenant,
                    'period' => $period,
                    'rows' => $financials['irt_rows'],
                    'totals' => $financials['totals'],
                    'operatorName' => $operatorName,
                ],
                paper: 'a4',
                orientation: 'landscape',
                lang: $lang,
            );

            $tenantSlug = $this->sanitizeFilenameSlug($tenant->slug ?: "empresa-{$tenant->id}");
            $periodCode = $period->period_start?->format('Y-m') ?? (string) $period->id;

            return [
                'pdf' => $pdf,
                'filename' => "mapa-irt-{$tenantSlug}-{$periodCode}.pdf",
                'period' => $period,
            ];
        });
    }

    /**
     * Resolve period for a tenant/month and build an independent INSS or IRT map PDF without blocking on INSS proof.
     *
     * @return array<string, mixed>
     */
    public function buildCompanyTaxMapPdf(
        Tenant $tenant,
        string $mapType,
        ?int $periodId,
        int $year,
        int $month,
        ?string $lang,
        User $actor,
    ): array {
        $period = $this->findPeriodForTenantMonth($tenant, $year, $month, $periodId);

        if (! $period) {
            throw ValidationException::withMessages([
                'period' => 'Nenhum período salarial encontrado para esta empresa no período indicado.',
            ]);
        }

        return $mapType === 'inss'
            ? $this->renderInssMapPdf($period, $lang, $actor)
            : $this->renderIrtMapPdf($period, $lang, $actor);
    }

    /**
     * Build attendance report data for a specific tenant without breaking the caller's TenantManager state.
     *
     * @return array<string, mixed>
     */
    private function buildTenantAttendanceReport(Tenant $tenant, PayrollPeriod $period): array
    {
        return $this->withTenantContext($tenant, function () use ($tenant, $period): array {
            $synthetic = Request::create('/api/v1/attendance/report', 'GET', [
                'period_type' => 'custom',
                'start_date' => $period->period_start?->format('Y-m-d') ?? now()->startOfMonth()->toDateString(),
                'end_date' => $period->period_end?->format('Y-m-d') ?? now()->endOfMonth()->toDateString(),
            ]);

            $report = $this->attendanceReport->build($synthetic, null);
            $report['tenant'] = $tenant;

            return $report;
        });
    }

    private function withTenantContext(Tenant $tenant, callable $callback): mixed
    {
        $previousTenant = $this->tenantManager->get();
        $this->tenantManager->set($tenant);

        try {
            return $callback();
        } finally {
            if ($previousTenant !== null) {
                $this->tenantManager->set($previousTenant);
            } else {
                $this->tenantManager->clear();
            }
        }
    }

    private function sanitizeFilenameSlug(string $value): string
    {
        $slug = trim((string) preg_replace('/[^a-z0-9-]+/i', '-', strtolower($value)), '-');

        return $slug !== '' ? $slug : 'doc';
    }
}
