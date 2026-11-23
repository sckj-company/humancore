<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\PayrollPeriod;
use App\Models\PayrollPeriodReportDocument;
use App\Services\DocumentStorageService;
use App\Services\Payroll\PayrollPeriodReportService;
use App\Services\Payroll\PayslipPdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class PayrollPeriodReportController extends BaseController
{
    public function __construct(
        private readonly PayrollPeriodReportService $reportService,
        private readonly DocumentStorageService $storage,
    ) {}

    public function show(PayrollPeriod $period): JsonResponse
    {
        $this->authorize('view', $period);

        return $this->success($this->reportService->getPayload($period));
    }

    public function upsert(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->reportService->assertReportable($period);
        $this->authorize('manageReport', $period);

        $this->normalizeBooleanInputs($request, [
            'inss_guide_sent',
            'inss_payment_proof_sent',
            'inss_paid',
            'payslips_summary_sent',
            'payroll_sheet_sent',
            'is_summary_complete',
        ]);

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:200'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'inss_guide_sent' => ['required', 'boolean'],
            'inss_payment_proof_sent' => ['required', 'boolean'],
            'inss_paid' => ['required', 'boolean'],
            'payslips_summary_sent' => ['required', 'boolean'],
            'payroll_sheet_sent' => ['required', 'boolean'],
            'is_summary_complete' => ['required', 'boolean'],
        ]);

        $this->reportService->upsertReport($period, $validated, $request->user());

        return $this->success(
            $this->reportService->getPayload($period->fresh()),
            'Estados do relatório da folha guardados com sucesso.'
        );
    }

    public function storeDocument(Request $request, PayrollPeriod $period): JsonResponse
    {
        $this->reportService->assertReportable($period);
        $this->authorize('manageReport', $period);

        $this->normalizeBooleanInputs($request, ['is_paid', 'is_sent']);

        $validated = $request->validate([
            'document_type' => ['required', 'string', Rule::in(PayrollPeriodReportDocument::TYPES)],
            'title' => ['required', 'string', 'max:200'],
            'is_paid' => ['required', 'boolean'],
            'is_sent' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $document = $this->reportService->addDocument($period, $validated, $request, $request->user());

        return $this->success([
            'document' => [
                'id' => $document->id,
                'document_type' => $document->document_type,
                'title' => $document->title,
                'file_name' => $document->file_name,
                'is_paid' => (bool) $document->is_paid,
                'is_sent' => (bool) $document->is_sent,
            ],
            'report' => $this->reportService->getPayload($period->fresh()),
        ], 'Documento anexado ao relatório com sucesso.', 201);
    }

    public function attachSystemDocument(
        Request $request,
        PayrollPeriod $period,
        PayslipPdfService $payslips,
    ): JsonResponse {
        $this->reportService->assertReportable($period);
        $this->authorize('manageReport', $period);

        $this->normalizeBooleanInputs($request, ['is_sent', 'is_paid']);

        $validated = $request->validate([
            'document_type' => ['required', 'string', Rule::in(['payroll_sheet', 'payslips_summary_pdf', 'attendance_report'])],
            'is_sent' => ['sometimes', 'boolean'],
            'is_paid' => ['sometimes', 'boolean'],
            'lang' => ['nullable', 'string'],
        ]);

        $document = $this->reportService->attachSystemDocument(
            period: $period,
            documentType: (string) $validated['document_type'],
            isSent: (bool) ($validated['is_sent'] ?? false),
            isPaid: (bool) ($validated['is_paid'] ?? false),
            lang: $validated['lang'] ?? null,
            actor: $request->user(),
            payslips: $payslips,
        );

        return $this->success([
            'document' => [
                'id' => $document->id,
                'document_type' => $document->document_type,
                'title' => $document->title,
                'file_name' => $document->file_name,
                'is_paid' => (bool) $document->is_paid,
                'is_sent' => (bool) $document->is_sent,
            ],
            'report' => $this->reportService->getPayload($period->fresh()),
        ], 'PDF do sistema anexado ao relatório com sucesso.', 201);
    }

    public function updateDocument(
        Request $request,
        PayrollPeriod $period,
        PayrollPeriodReportDocument $document,
    ): JsonResponse {
        $this->reportService->assertReportable($period);
        $this->authorize('manageReport', $period);
        $this->assertDocumentBelongsToPeriod($period, $document);

        $this->normalizeBooleanInputs($request, ['is_paid', 'is_sent']);

        $validated = $request->validate([
            'document_type' => ['sometimes', 'string', Rule::in(PayrollPeriodReportDocument::TYPES)],
            'title' => ['sometimes', 'string', 'max:200'],
            'is_paid' => ['sometimes', 'boolean'],
            'is_sent' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $this->reportService->updateDocument($document, $validated, $request->user());

        return $this->success(
            $this->reportService->getPayload($period->fresh()),
            'Estado do documento atualizado com sucesso.'
        );
    }

    public function downloadDocument(
        Request $request,
        PayrollPeriod $period,
        PayrollPeriodReportDocument $document,
    ): SymfonyResponse {
        $this->authorize('view', $period);
        $this->assertDocumentBelongsToPeriod($period, $document);

        return $this->storage->download($document->file_path, $document->file_name, $request->boolean('inline'));
    }

    public function destroyDocument(
        Request $request,
        PayrollPeriod $period,
        PayrollPeriodReportDocument $document,
    ): JsonResponse {
        $this->reportService->assertReportable($period);
        $this->authorize('manageReport', $period);
        $this->assertDocumentBelongsToPeriod($period, $document);

        $this->reportService->deleteDocument($document, $request->user());

        return $this->success(
            $this->reportService->getPayload($period->fresh()),
            'Documento removido do relatório.'
        );
    }

    private function assertDocumentBelongsToPeriod(PayrollPeriod $period, PayrollPeriodReportDocument $document): void
    {
        $document->loadMissing('report:id,payroll_period_id');
        if ((int) ($document->report?->payroll_period_id ?? 0) !== (int) $period->id) {
            abort(404, 'Documento não pertence a este período salarial.');
        }
    }

    /**
     * @param  array<int, string>  $keys
     */
    private function normalizeBooleanInputs(Request $request, array $keys): void
    {
        $patch = [];
        foreach ($keys as $key) {
            if (! $request->exists($key)) {
                continue;
            }
            $raw = $request->input($key);
            if (is_bool($raw)) {
                continue;
            }
            if ($raw === 'true' || $raw === '1' || $raw === 1) {
                $patch[$key] = true;
            } elseif ($raw === 'false' || $raw === '0' || $raw === 0) {
                $patch[$key] = false;
            }
        }

        if ($patch !== []) {
            $request->merge($patch);
        }
    }
}
