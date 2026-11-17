<?php

namespace App\Services\Payroll;

use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Support\PdfDocument;
use Barryvdh\DomPDF\PDF as DomPdfDocument;

class PayslipPdfService
{
    public function render(PayrollRecord $record, ?string $lang = null): DomPdfDocument
    {
        $operatorName = auth()->user()?->name
            ?? $record->period?->processedBy?->name
            ?? $record->approvedBy?->name
            ?? 'Sistema';

        return PdfDocument::make(
            view: 'pdf.payslip',
            data: [
                'record' => $record,
                'operatorName' => $operatorName,
            ],
            paper: 'a4',
            orientation: 'portrait',
            lang: $lang,
        );
    }

    public function renderPeriod(PayrollPeriod $period, ?string $lang = null): DomPdfDocument
    {
        $operatorName = auth()->user()?->name
            ?? $period->processedBy?->name
            ?? $period->approvedBy?->name
            ?? 'Sistema';

        return PdfDocument::make(
            view: 'pdf.payroll-period',
            data: [
                'period' => $period,
                'operatorName' => $operatorName,
            ],
            paper: 'a4',
            orientation: 'landscape',
            lang: $lang,
        );
    }
}