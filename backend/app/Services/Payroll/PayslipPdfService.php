<?php

namespace App\Services\Payroll;

use App\Models\PayrollRecord;
use App\Models\PayrollPeriod;
use Barryvdh\DomPDF\Facade\Pdf;
use Barryvdh\DomPDF\PDF as DomPdfDocument;
use Illuminate\Support\Facades\File;

class PayslipPdfService
{
    public function render(PayrollRecord $record): DomPdfDocument
    {
        $operatorName = auth()->user()?->name
            ?? $record->period?->processedBy?->name
            ?? $record->approvedBy?->name
            ?? 'Sistema';

        return $this->pdf()
            ->loadView('pdf.payslip', [
                'record' => $record,
                'operatorName' => $operatorName,
            ])
            ->setPaper('a4', 'portrait');
    }

    public function renderPeriod(PayrollPeriod $period): DomPdfDocument
    {
        $operatorName = auth()->user()?->name
            ?? $period->processedBy?->name
            ?? $period->approvedBy?->name
            ?? 'Sistema';

        return $this->pdf()->loadView('pdf.payroll-period', [
            'period' => $period,
            'operatorName' => $operatorName,
        ]);
    }

    private function pdf(): DomPdfDocument
    {
        $fontCache = storage_path('framework/cache/dompdf/fonts');
        File::ensureDirectoryExists($fontCache);

        return Pdf::setOption([
            'font_dir' => $fontCache,
            'font_cache' => $fontCache,
            'chroot' => base_path(),
            'default_font' => 'Droid Sans Fallback',
        ]);
    }
}