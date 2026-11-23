<?php

namespace App\Http\Controllers\Api\V1\Payroll;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\PayrollPeriod;
use App\Models\PayrollRecord;
use App\Services\Payroll\PayslipPdfService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class PayslipController extends BaseController
{
    public function downloadPeriod(Request $request, PayrollPeriod $period, PayslipPdfService $payslips): SymfonyResponse
    {
        $this->authorize('view', $period);

        $period->load([
            'tenant',
            'processedBy:id,name',
            'approvedBy:id,name',
            'records.employee',
            'records.contract.position',
            'records.items.deduction',
        ]);

        $filename = 'folha-salarial-'.$period->id.'.pdf';

        return $payslips->renderPeriod($period, $request->query('lang'))->download($filename);
    }

    public function downloadBulk(Request $request, PayrollPeriod $period, PayslipPdfService $payslips): SymfonyResponse
    {
        $this->authorize('view', $period);

        $validated = $request->validate([
            'record_ids' => ['sometimes', 'array', 'min:1'],
            'record_ids.*' => ['integer'],
            'employee_ids' => ['sometimes', 'array', 'min:1'],
            'employee_ids.*' => ['integer'],
            'lang' => ['nullable', 'string'],
            'disposition' => ['nullable', 'in:inline,attachment'],
        ]);

        $allowedDeptIds = $request->user()?->allowedDepartmentIds();

        $records = $period->records()
            ->when($allowedDeptIds !== null, fn ($q) => $q->whereHas('employee', fn ($eq) => $eq->whereIn('department_id', $allowedDeptIds)))
            ->when(! empty($validated['record_ids']), fn ($q) => $q->whereIn('id', $validated['record_ids']))
            ->when(! empty($validated['employee_ids']), fn ($q) => $q->whereIn('employee_id', $validated['employee_ids']))
            ->with([
                'employee',
                'period.processedBy:id,name',
                'period.approvedBy:id,name',
                'approvedBy:id,name',
                'tenant',
                'contract.position',
                'items',
            ])
            ->get()
            ->sortBy(fn (PayrollRecord $record) => mb_strtolower((string) ($record->employee?->full_name ?? '')))
            ->values();

        if ($records->isEmpty()) {
            return $this->error('Nenhum recibo encontrado para os funcionários selecionados.', 422);
        }

        $lang = $validated['lang'] ?? $request->query('lang');
        $pdf = $payslips->renderBulk($records, is_string($lang) ? $lang : null);

        $filename = 'recibos-lote-'.($period->displayName() ?: $period->id).'.pdf';
        $filename = str_replace(['/', '\\', ' '], '-', $filename);

        $disposition = $validated['disposition'] ?? $request->query('disposition', 'attachment');
        if ($disposition === 'inline') {
            return $pdf->stream($filename);
        }

        return $pdf->download($filename);
    }

    public function show(PayrollRecord $record, Request $request, PayslipPdfService $payslips): SymfonyResponse
    {
        $this->authorize('view', $record);

        $record->loadMissing(
            'employee',
            'period.processedBy:id,name',
            'period.approvedBy:id,name',
            'approvedBy:id,name',
            'tenant',
            'contract.position',
            'items'
        );

        $filename = 'recibo-'.$record->employee?->employee_code.'-'.($record->period?->displayName() ?? $record->id).'.pdf';
        $filename = str_replace(['/', '\\', ' '], '-', $filename);

        $pdf = $payslips->render($record, $request->query('lang'));

        if ($request->boolean('download')) {
            return $pdf->download($filename);
        }

        return $pdf->stream($filename);
    }

    public function download(PayrollRecord $record, Request $request, PayslipPdfService $payslips): SymfonyResponse
    {
        $this->authorize('view', $record);

        $record->loadMissing(
            'employee',
            'period.processedBy:id,name',
            'period.approvedBy:id,name',
            'approvedBy:id,name',
            'tenant',
            'contract.position',
            'items'
        );

        $filename = 'recibo-'.$record->employee?->employee_code.'-'.($record->period?->displayName() ?? $record->id).'.pdf';
        $filename = str_replace(['/', '\\', ' '], '-', $filename);

        $pdf = $payslips->render($record, $request->query('lang'));

        return $pdf->download($filename);
    }
}
