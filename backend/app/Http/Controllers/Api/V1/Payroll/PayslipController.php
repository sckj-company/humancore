<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\PayrollRecord;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class PayslipController extends BaseController
{
    public function show(PayrollRecord $record, Request $request): SymfonyResponse
    {
        $this->authorize('view', $record);

        $record->loadMissing('employee', 'period', 'tenant', 'contract.position');

        $filename = 'recibo-'.$record->employee?->employee_code.'-'.($record->period?->name ?? $record->id).'.pdf';
        $filename = str_replace(['/', '\\', ' '], '-', $filename);

        $pdf = Pdf::loadView('pdf.payslip', ['record' => $record]);

        if ($request->boolean('download')) {
            return $pdf->download($filename);
        }

        return $pdf->stream($filename);
    }

    public function download(PayrollRecord $record): SymfonyResponse
    {
        $this->authorize('view', $record);

        $record->loadMissing('employee', 'period', 'tenant', 'contract.position');

        $filename = 'recibo-'.$record->employee?->employee_code.'-'.($record->period?->name ?? $record->id).'.pdf';
        $filename = str_replace(['/', '\\', ' '], '-', $filename);

        $pdf = Pdf::loadView('pdf.payslip', ['record' => $record]);

        return $pdf->download($filename);
    }
}
