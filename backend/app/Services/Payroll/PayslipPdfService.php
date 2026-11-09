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
        return $this->pdf()->loadView('pdf.payslip', ['record' => $record]);
    }

    public function renderPeriod(PayrollPeriod $period): DomPdfDocument
    {
        return $this->pdf()->loadView('pdf.payroll-period', ['period' => $period]);
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