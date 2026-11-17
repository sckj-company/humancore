<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\AttendanceRecord;
use App\Models\Employee;
use App\Services\Attendance\AttendanceReportService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

class AttendanceReportController extends BaseController
{
    public function index(Request $request, AttendanceReportService $service): JsonResponse
    {
        $this->authorizeReportAccess($request);

        $report = $service->build($request, $request->user());
        unset($report['tenant']);

        return $this->success($report, 'Relatório de presenças gerado com sucesso.');
    }

    public function pdf(Request $request, AttendanceReportService $service): SymfonyResponse
    {
        $this->authorizeReportAccess($request);

        $report = $service->build($request, $request->user());

        $fontCache = storage_path('framework/cache/dompdf/fonts');
        File::ensureDirectoryExists($fontCache);

        $isSingleEmployee = count($report['employees']) === 1 || ! empty($report['filters']['employee_id']);
        $orientation = $isSingleEmployee ? 'portrait' : 'landscape';

        $pdf = Pdf::setOption([
            'font_dir' => $fontCache,
            'font_cache' => $fontCache,
            'chroot' => base_path(),
            'default_font' => 'Droid Sans Fallback',
        ])->loadView('pdf.attendance-report', [
            'report' => $report,
            'operatorName' => $request->user()?->name ?? 'Sistema',
            'isSingleEmployee' => $isSingleEmployee,
        ])->setPaper('a4', $orientation);

        $scope = ! empty($report['filters']['employee_name'])
            ? str_replace(' ', '-', strtolower((string) $report['filters']['employee_name']))
            : 'geral';
        $filename = sprintf(
            'relatorio-presencas-%s-%s-%s.pdf',
            $report['period']['type'],
            $scope,
            str_replace('-', '', $report['period']['start_date'])
        );

        return $pdf->download($filename);
    }

    private function authorizeReportAccess(Request $request): void
    {
        $user = $request->user();
        if (
            $user
            && (
                $user->can('view_attendance')
                || $user->can('view_report')
                || $user->can('view_employee')
                || $user->can('viewAny', AttendanceRecord::class)
                || $user->can('viewAny', Employee::class)
            )
        ) {
            return;
        }

        $this->authorize('viewAny', AttendanceRecord::class);
    }
}
