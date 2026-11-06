<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\PayrollRecord;
use App\Services\Payroll\PayslipPdfService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class PayslipController extends BaseController
{
    public function show(PayrollRecord $record, Request $request, PayslipPdfService $payslips): SymfonyResponse
    {
        $this->authorize('view', $record);

        $record->loadMissing('employee', 'period', 'tenant', 'contract.position', 'items');

        $filename = 'recibo-'.$record->employee?->employee_code.'-'.($record->period?->displayName() ?? $record->id).'.pdf';
        $filename = str_replace(['/', '\\', ' '], '-', $filename);

        $pdf = $payslips->render($record);

        if ($request->boolean('download')) {
            return $pdf->download($filename);
        }

        return $pdf->stream($filename);
    }

    public function download(PayrollRecord $record, PayslipPdfService $payslips): SymfonyResponse
    {
        $this->authorize('view', $record);

        $record->loadMissing('employee', 'period', 'tenant', 'contract.position', 'items');

        $filename = 'recibo-'.$record->employee?->employee_code.'-'.($record->period?->displayName() ?? $record->id).'.pdf';
        $filename = str_replace(['/', '\\', ' '], '-', $filename);

        $pdf = $payslips->render($record);

        return $pdf->download($filename);
    }
}
