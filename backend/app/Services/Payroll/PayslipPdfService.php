<?php

namespace App\Services\Payroll;

use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Support\PdfDocument;
use App\Support\PdfMergerService;
use Barryvdh\DomPDF\PDF as DomPdfDocument;
use Illuminate\Support\Collection;

class PayslipPdfService
{
    public function __construct(private readonly ?PdfMergerService $merger = null) {}

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

    /**
     * Render large batches of payslips in bounded memory chunks and merge them into one PDF binary.
     *
     * @param  Collection<int, PayrollRecord>  $records
     */
    public function renderBulkBinary(Collection $records, ?string $lang = null, int $chunkSize = 15): string
    {
        if ($records->count() <= $chunkSize) {
            return $this->renderBulk($records, $lang)->output();
        }

        $merger = $this->merger ?? app(PdfMergerService::class);
        $chunks = [];

        foreach ($records->chunk(max(1, $chunkSize)) as $slice) {
            $pdf = $this->renderBulk($slice->values(), $lang);
            $chunks[] = $pdf->output();
            unset($pdf);
            gc_collect_cycles();
        }

        return $merger->merge($chunks);
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
