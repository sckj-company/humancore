<?php

namespace App\Services\Payroll;

use App\Models\PayrollRecord;
use Barryvdh\DomPDF\Facade\Pdf;
use Barryvdh\DomPDF\PDF as DomPdfDocument;
use Illuminate\Support\Facades\File;

class PayslipPdfService
{
    public function render(PayrollRecord $record): DomPdfDocument
    {
        $fontCache = storage_path('framework/cache/dompdf/fonts');
        File::ensureDirectoryExists($fontCache);

        return Pdf::setOption([
            'font_dir' => $fontCache,
            'font_cache' => $fontCache,
            'chroot' => base_path(),
            'default_font' => 'Droid Sans Fallback',
        ])->loadView('pdf.payslip', ['record' => $record]);
    }
}