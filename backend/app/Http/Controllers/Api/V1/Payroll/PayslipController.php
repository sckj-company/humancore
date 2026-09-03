<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\PayrollRecord;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Response;

class PayslipController extends BaseController
{
    public function show(PayrollRecord $record): Response
    {
        $this->authorize('view', $record);

        $record->load('employee', 'period', 'tenant', 'contract.position');

        $filename = 'recibo-'.$record->employee->employee_code.'-'.$record->period->name.'.pdf';
        $filename = str_replace(['/', '\\'], '-', $filename);

        $pdf = Pdf::loadView('pdf.payslip', ['record' => $record]);

        return $pdf->stream($filename);
    }

    public function download(PayrollRecord $record): Response
    {
        $this->authorize('view', $record);

        $record->load('employee', 'period', 'tenant', 'contract.position');

        $filename = 'recibo-'.$record->employee->employee_code.'-'.$record->period->name.'.pdf';
        $filename = str_replace(['/', '\\'], '-', $filename);

        $pdf = Pdf::loadView('pdf.payslip', ['record' => $record]);

        return $pdf->download($filename);
    }
}
