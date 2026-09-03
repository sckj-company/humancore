<?php

namespace App\Jobs;

use App\Models\PayrollRecord;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

class GeneratePayslipPdfJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(public int $payrollRecordId) {}

    public function handle(): void
    {
        $record = PayrollRecord::with(['employee', 'period', 'tenant', 'contract'])->findOrFail($this->payrollRecordId);

        $pdf = Pdf::loadView('pdf.payslip', ['record' => $record]);
        $path = "tenants/{$record->tenant_id}/payslips/{$record->period->name}/{$record->employee->employee_code}.pdf";
        Storage::disk('public')->put($path, $pdf->output());
        $record->update(['payslip_path' => $path]);
    }
}
