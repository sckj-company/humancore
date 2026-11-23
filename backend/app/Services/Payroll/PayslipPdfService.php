<?php

namespace App\Services\Payroll;

use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Support\PdfDocument;
use Barryvdh\DomPDF\PDF as DomPdfDocument;
use Illuminate\Support\Collection;

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

    /**
     * @param  Collection<int, PayrollRecord>  $records
     */
    public function renderBulk(Collection $records, ?string $lang = null): DomPdfDocument
    {
        $first = $records->first();
        $operatorName = auth()->user()?->name
            ?? $first?->period?->processedBy?->name
            ?? $first?->approvedBy?->name
            ?? 'Sistema';

        return PdfDocument::make(
            view: 'pdf.payslips-bulk',
            data: [
                'records' => $records,
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