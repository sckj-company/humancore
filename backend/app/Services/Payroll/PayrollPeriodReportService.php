<?php

namespace App\Services\Payroll;

use App\Models\PayrollPeriod;
use App\Models\PayrollPeriodReport;
use App\Models\PayrollPeriodReportDocument;
use App\Models\User;
use App\Services\Attendance\AttendanceReportService;
use App\Services\DocumentStorageService;
use App\Services\Tenant\TenantManager;
use App\Support\PdfDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PayrollPeriodReportService
{
    public function __construct(private readonly DocumentStorageService $storage) {}

    public function assertReportable(PayrollPeriod $period): void
    {
        if (! $period->isReportable()) {
            throw ValidationException::withMessages([
                'payroll_period_id' => 'O relatório de conformidade e anexos só está disponível para folhas aprovadas, fechadas ou pagas.',
            ]);
        }
    }

    /**
     * Load existing report payload or build default checklist structure for a period.
     *
     * @return array<string, mixed>
     */
    public function getPayload(PayrollPeriod $period): array
    {
        $report = $period->report()
            ->with(['documents.uploadedBy:id,name', 'updatedBy:id,name'])
            ->first();

        if (! $report) {
            return [
                'id' => null,
                'tenant_id' => $period->tenant_id,
                'payroll_period_id' => $period->id,
                'is_reportable' => $period->isReportable(),
                'title' => null,
                'notes' => null,
                'inss_guide_sent' => false,
                'inss_payment_proof_sent' => false,
                'inss_paid' => false,
                'payslips_summary_sent' => false,
                'payroll_sheet_sent' => false,
                'is_summary_complete' => false,
                'submitted_at' => null,
                'updated_by' => null,
                'updated_by_user' => null,
                'has_inss_payment_proof' => false,
                'mandatory_status' => [
                    'inss_guide' => ['attached' => false, 'document_id' => null, 'file_name' => null, 'is_sent' => false, 'is_paid' => false],
                    'inss_payment_proof' => ['attached' => false, 'document_id' => null, 'file_name' => null, 'is_sent' => false, 'is_paid' => false],
                    'payslips_summary_pdf' => ['attached' => false, 'document_id' => null, 'file_name' => null, 'is_sent' => false, 'is_paid' => false],
                    'payroll_sheet' => ['attached' => false, 'document_id' => null, 'file_name' => null, 'is_sent' => false, 'is_paid' => false],
                    'all_mandatory_attached' => false,
                    'all_mandatory_sent' => false,
                    'has_inss_payment_proof' => false,
                    'inss_paid' => false,
                    'is_summary_complete' => false,
                ],
                'documents_count' => 0,
                'documents' => [],
            ];
        }

        return [
            'id' => $report->id,
            'tenant_id' => $report->tenant_id,
            'payroll_period_id' => $report->payroll_period_id,
            'is_reportable' => $period->isReportable(),
            'title' => $report->title,
            'notes' => $report->notes,
            'inss_guide_sent' => (bool) $report->inss_guide_sent,
            'inss_payment_proof_sent' => (bool) $report->inss_payment_proof_sent,
            'inss_paid' => (bool) $report->inss_paid,
            'payslips_summary_sent' => (bool) $report->payslips_summary_sent,
            'payroll_sheet_sent' => (bool) $report->payroll_sheet_sent,
            'is_summary_complete' => (bool) $report->is_summary_complete,
            'submitted_at' => $report->submitted_at?->toIso8601String(),
            'updated_by' => $report->updated_by,
            'updated_by_user' => $report->updatedBy ? [
                'id' => $report->updatedBy->id,
                'name' => $report->updatedBy->name,
            ] : null,
            'has_inss_payment_proof' => $report->hasInssPaymentProof(),
            'mandatory_status' => $report->mandatoryStatus(),
            'documents_count' => $report->documents->count(),
            'documents' => $report->documents->map(fn (PayrollPeriodReportDocument $doc) => [
                'id' => $doc->id,
                'document_type' => $doc->document_type,
                'title' => $doc->title,
                'file_name' => $doc->file_name,
                'mime_type' => $doc->mime_type,
                'file_size' => $doc->file_size,
                'is_paid' => (bool) $doc->is_paid,
                'is_sent' => (bool) $doc->is_sent,
                'paid_at' => $doc->paid_at?->toIso8601String(),
                'sent_at' => $doc->sent_at?->toIso8601String(),
                'notes' => $doc->notes,
                'uploaded_by' => $doc->uploaded_by,
                'uploaded_by_user' => $doc->uploadedBy ? [
                    'id' => $doc->uploadedBy->id,
                    'name' => $doc->uploadedBy->name,
                ] : null,
                'created_at' => $doc->created_at?->toIso8601String(),
                'updated_at' => $doc->updated_at?->toIso8601String(),
            ])->values()->all(),
        ];
    }

    /**
     * Create or update the mandatory checklist statuses and summary flags for a period report.
     *
     * @param  array<string, mixed>  $data
     */
    public function upsertReport(PayrollPeriod $period, array $data, User $actor): PayrollPeriodReport
    {
        $this->assertReportable($period);

        return DB::transaction(function () use ($period, $data, $actor): PayrollPeriodReport {
            $report = PayrollPeriodReport::query()->firstOrNew([
                'payroll_period_id' => $period->id,
            ]);
            $report->tenant_id = $period->tenant_id;

            $isComplete = (bool) $data['is_summary_complete'];
            $report->fill([
                'title' => $data['title'] ?? $report->title,
                'notes' => $data['notes'] ?? $report->notes,
                'inss_guide_sent' => (bool) $data['inss_guide_sent'],
                'inss_payment_proof_sent' => (bool) $data['inss_payment_proof_sent'],
                'inss_paid' => (bool) $data['inss_paid'],
                'payslips_summary_sent' => (bool) $data['payslips_summary_sent'],
                'payroll_sheet_sent' => (bool) $data['payroll_sheet_sent'],
                'is_summary_complete' => $isComplete,
                'submitted_at' => $isComplete ? ($report->submitted_at ?? now()) : null,
                'updated_by' => $actor->id,
            ]);
            $report->save();

            // Sync matching mandatory document types with checklist changes
            $this->syncDocumentTypeFlags($report, 'inss_guide', (bool) $data['inss_guide_sent'], null);
            $this->syncDocumentTypeFlags($report, 'inss_payment_proof', (bool) $data['inss_payment_proof_sent'], (bool) $data['inss_paid']);
            $this->syncDocumentTypeFlags($report, 'payslips_summary_pdf', (bool) $data['payslips_summary_sent'], null);
            $this->syncDocumentTypeFlags($report, 'payroll_sheet', (bool) $data['payroll_sheet_sent'], null);

            $period->recordEvent('report_updated', $actor->id, 'Estados do relatório da folha atualizados.', [
                'is_summary_complete' => $report->is_summary_complete,
                'inss_paid' => $report->inss_paid,
                'inss_payment_proof_sent' => $report->inss_payment_proof_sent,
            ]);

            return $report->fresh(['documents.uploadedBy:id,name', 'updatedBy:id,name']);
        });
    }

    /**
     * Store a new uploaded document under the payroll period report.
     *
     * @param  array<string, mixed>  $validated
     */
    public function addDocument(PayrollPeriod $period, array $validated, Request $request, User $actor): PayrollPeriodReportDocument
    {
        $this->assertReportable($period);

        $stored = $this->storage->storeFromRequest(
            request: $request,
            fileField: 'file',
            localDir: "payroll-reports/tenant-{$period->tenant_id}/period-{$period->id}",
            cloudinaryFolder: "hrms/tenant-{$period->tenant_id}/payroll-reports",
            prefix: 'report_',
            mimes: 'pdf,jpg,jpeg,png,webp,doc,docx,xls,xlsx',
            maxKb: 20480,
        );

        if (! $stored) {
            throw ValidationException::withMessages([
                'file' => 'Selecione um ficheiro válido para anexar ao relatório.',
            ]);
        }

        return DB::transaction(function () use ($period, $validated, $stored, $actor): PayrollPeriodReportDocument {
            $report = $this->firstOrCreateReport($period, $actor);

            $isPaid = (bool) $validated['is_paid'];
            $isSent = (bool) $validated['is_sent'];

            $document = $report->documents()->create([
                'tenant_id' => $period->tenant_id,
                'document_type' => (string) $validated['document_type'],
                'title' => (string) $validated['title'],
                'file_path' => $stored['path'],
                'file_name' => $stored['name'],
                'mime_type' => $stored['mime'],
                'file_size' => $stored['size'] ?? null,
                'is_paid' => $isPaid,
                'is_sent' => $isSent,
                'paid_at' => $isPaid ? now() : null,
                'sent_at' => $isSent ? now() : null,
                'notes' => $validated['notes'] ?? null,
                'uploaded_by' => $actor->id,
            ]);

            $this->syncReportFromMandatoryDocument($report, $document, $actor);

            $period->recordEvent('report_document_uploaded', $actor->id, "Documento anexado ao relatório: {$document->title}", [
                'document_id' => $document->id,
                'document_type' => $document->document_type,
                'is_paid' => $document->is_paid,
                'is_sent' => $document->is_sent,
            ]);

            return $document->load('uploadedBy:id,name');
        });
    }

    /**
     * Render and attach a system-generated PDF directly into the period report.
     */
    public function attachSystemDocument(
        PayrollPeriod $period,
        string $documentType,
        bool $isSent,
        bool $isPaid,
        ?string $lang,
        User $actor,
        PayslipPdfService $payslips,
    ): PayrollPeriodReportDocument {
        $this->assertReportable($period);

        if (! in_array($documentType, ['payroll_sheet', 'payslips_summary_pdf', 'attendance_report'], true)) {
            throw ValidationException::withMessages([
                'document_type' => 'Só é possível gerar automaticamente pelo sistema a Folha de Salário, o PDF de Recibos ou o Relatório de Assiduidade.',
            ]);
        }

        $period->loadMissing([
            'tenant',
            'processedBy:id,name',
            'approvedBy:id,name',
            'records.employee',
            'records.contract.position',
            'records.items.deduction',
        ]);

        if ($documentType === 'payroll_sheet') {
            $binary = $payslips->renderPeriod($period, $lang)->output();
            $filename = "folha-salarios-periodo-{$period->id}.pdf";
            $title = 'Folha de Salário — '.($period->displayName() ?: "#{$period->id}");
        } elseif ($documentType === 'payslips_summary_pdf') {
            $records = $period->records
                ->sortBy(fn ($r) => mb_strtolower((string) ($r->employee?->full_name ?? '')))
                ->values();

            if ($records->isEmpty()) {
                throw ValidationException::withMessages([
                    'document_type' => 'A folha selecionada não possui recibos de funcionários para anexar.',
                ]);
            }

            $binary = $payslips->renderBulkBinary($records, $lang);
            $filename = "resumo-recibos-periodo-{$period->id}.pdf";
            $title = 'PDF Resumo de Todos os Recibos — '.($period->displayName() ?: "#{$period->id}");
        } else {
            $binary = $this->renderAttendancePdfBinary($period, $actor, $lang);
            $filename = "assiduidade-periodo-{$period->id}.pdf";
            $title = 'Relatório de Assiduidade — '.($period->displayName() ?: "#{$period->id}");
        }

        $stored = $this->storage->storeBinary(
            binary: $binary,
            filename: $filename,
            mime: 'application/pdf',
            localDir: "payroll-reports/tenant-{$period->tenant_id}/period-{$period->id}",
            cloudinaryFolder: "hrms/tenant-{$period->tenant_id}/payroll-reports",
            prefix: 'sys_',
        );

        return DB::transaction(function () use ($period, $documentType, $title, $stored, $isPaid, $isSent, $actor): PayrollPeriodReportDocument {
            $report = $this->firstOrCreateReport($period, $actor);

            $document = $report->documents()->create([
                'tenant_id' => $period->tenant_id,
                'document_type' => $documentType,
                'title' => $title,
                'file_path' => $stored['path'],
                'file_name' => $stored['name'],
                'mime_type' => $stored['mime'],
                'file_size' => $stored['size'],
                'is_paid' => $isPaid,
                'is_sent' => $isSent,
                'paid_at' => $isPaid ? now() : null,
                'sent_at' => $isSent ? now() : null,
                'notes' => 'Gerado automaticamente pelo sistema.',
                'uploaded_by' => $actor->id,
            ]);

            $this->syncReportFromMandatoryDocument($report, $document, $actor);

            $period->recordEvent('report_document_uploaded', $actor->id, "Documento do sistema anexado: {$document->title}", [
                'document_id' => $document->id,
                'document_type' => $document->document_type,
                'system_generated' => true,
            ]);

            return $document->load('uploadedBy:id,name');
        });
    }

    /**
     * Update an attached document's metadata or paid/sent flags.
     *
     * @param  array<string, mixed>  $validated
     */
    public function updateDocument(PayrollPeriodReportDocument $document, array $validated, User $actor): PayrollPeriodReportDocument
    {
        return DB::transaction(function () use ($document, $validated, $actor): PayrollPeriodReportDocument {
            $updates = [];

            if (array_key_exists('document_type', $validated)) {
                $updates['document_type'] = $validated['document_type'];
            }
            if (array_key_exists('title', $validated)) {
                $updates['title'] = $validated['title'];
            }
            if (array_key_exists('notes', $validated)) {
                $updates['notes'] = $validated['notes'];
            }
            if (array_key_exists('is_paid', $validated)) {
                $isPaid = (bool) $validated['is_paid'];
                $updates['is_paid'] = $isPaid;
                $updates['paid_at'] = $isPaid ? ($document->paid_at ?? now()) : null;
            }
            if (array_key_exists('is_sent', $validated)) {
                $isSent = (bool) $validated['is_sent'];
                $updates['is_sent'] = $isSent;
                $updates['sent_at'] = $isSent ? ($document->sent_at ?? now()) : null;
            }

            $document->update($updates);
            $document->refresh();

            $report = $document->report;
            if ($report) {
                $this->syncReportFromMandatoryDocument($report, $document, $actor);
            }

            return $document->load('uploadedBy:id,name');
        });
    }

    public function deleteDocument(PayrollPeriodReportDocument $document, User $actor): void
    {
        $report = $document->report;
        $docType = $document->document_type;
        $filePath = $document->file_path;

        DB::transaction(function () use ($document, $report, $docType, $actor): void {
            $document->delete();

            if (! $report) {
                return;
            }

            $remaining = $report->documents()->where('document_type', $docType)->get();
            $sentColumn = $this->sentColumnForType($docType);
            $patch = ['updated_by' => $actor->id];

            if ($sentColumn !== null) {
                $patch[$sentColumn] = $remaining->contains('is_sent', true);
            }
            if ($docType === 'inss_payment_proof') {
                $patch['inss_paid'] = $remaining->contains('is_paid', true);
            }

            $report->update($patch);
        });

        $this->storage->delete($filePath);
    }

    private function renderAttendancePdfBinary(PayrollPeriod $period, User $actor, ?string $lang): string
    {
        $tenantManager = app(TenantManager::class);
        $previousTenant = $tenantManager->get();
        if ($period->tenant) {
            $tenantManager->set($period->tenant);
        }

        try {
            $synthetic = Request::create('/api/v1/attendance/report', 'GET', [
                'period_type' => 'custom',
                'start_date' => $period->period_start?->format('Y-m-d') ?? now()->startOfMonth()->toDateString(),
                'end_date' => $period->period_end?->format('Y-m-d') ?? now()->endOfMonth()->toDateString(),
            ]);

            $report = app(AttendanceReportService::class)->build($synthetic, null);
            $report['tenant'] = $period->tenant;

            return PdfDocument::make(
                view: 'pdf.attendance-report',
                data: [
                    'report' => $report,
                    'operatorName' => $actor->name ?: 'Sistema',
                    'isSingleEmployee' => false,
                ],
                paper: 'a4',
                orientation: 'landscape',
                lang: $lang,
            )->output();
        } finally {
            if ($previousTenant !== null) {
                $tenantManager->set($previousTenant);
            } else {
                $tenantManager->clear();
            }
        }
    }

    private function firstOrCreateReport(PayrollPeriod $period, User $actor): PayrollPeriodReport
    {
        $report = PayrollPeriodReport::query()->firstOrCreate(
            ['payroll_period_id' => $period->id],
            [
                'tenant_id' => $period->tenant_id,
                'updated_by' => $actor->id,
            ],
        );

        return $report;
    }

    private function syncReportFromMandatoryDocument(PayrollPeriodReport $report, PayrollPeriodReportDocument $document, User $actor): void
    {
        $patch = ['updated_by' => $actor->id];
        $sentColumn = $this->sentColumnForType($document->document_type);

        if ($sentColumn !== null) {
            $patch[$sentColumn] = (bool) $document->is_sent;
        }
        if ($document->document_type === 'inss_payment_proof') {
            $patch['inss_paid'] = (bool) $document->is_paid;
        }

        $report->update($patch);
    }

    private function syncDocumentTypeFlags(PayrollPeriodReport $report, string $type, bool $isSent, ?bool $isPaid): void
    {
        $docs = $report->documents()->where('document_type', $type)->get();
        foreach ($docs as $doc) {
            $updates = [
                'is_sent' => $isSent,
                'sent_at' => $isSent ? ($doc->sent_at ?? now()) : null,
            ];
            if ($isPaid !== null) {
                $updates['is_paid'] = $isPaid;
                $updates['paid_at'] = $isPaid ? ($doc->paid_at ?? now()) : null;
            }
            $doc->update($updates);
        }
    }

    private function sentColumnForType(string $type): ?string
    {
        return match ($type) {
            'inss_guide' => 'inss_guide_sent',
            'inss_payment_proof' => 'inss_payment_proof_sent',
            'payslips_summary_pdf' => 'payslips_summary_sent',
            'payroll_sheet' => 'payroll_sheet_sent',
            default => null,
        };
    }
}
