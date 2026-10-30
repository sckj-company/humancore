<?php

use App\Http\Controllers\Api\V1\Admin\SuperAdminController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceQrController;
use App\Http\Controllers\Api\V1\Audit\AuditController;
use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Compensation\BenefitController;
use App\Http\Controllers\Api\V1\Compensation\DeductionController;
use App\Http\Controllers\Api\V1\Contract\ContractController;
use App\Http\Controllers\Api\V1\Dashboard\DashboardController;
use App\Http\Controllers\Api\V1\Document\EmployeeDocumentController;
use App\Http\Controllers\Api\V1\Employee\EmployeeController;
use App\Http\Controllers\Api\V1\Leave\LeaveController;
use App\Http\Controllers\Api\V1\Notification\NotificationController;
use App\Http\Controllers\Api\V1\Onboarding\OnboardingTaskController;
use App\Http\Controllers\Api\V1\Onboarding\OnboardingTemplateController;
use App\Http\Controllers\Api\V1\Organization\BranchController;
use App\Http\Controllers\Api\V1\Organization\DepartmentController;
use App\Http\Controllers\Api\V1\Organization\PositionController;
use App\Http\Controllers\Api\V1\Payroll\MyPayslipsController;
use App\Http\Controllers\Api\V1\Payroll\PayrollController;
use App\Http\Controllers\Api\V1\Payroll\PayslipController;
use App\Http\Controllers\Api\V1\Performance\PerformanceEvaluationController;
use App\Http\Controllers\Api\V1\Recruitment\CandidateController;
use App\Http\Controllers\Api\V1\Recruitment\JobOpeningController;
use App\Http\Controllers\Api\V1\Report\ReportController;
use App\Http\Controllers\Api\V1\Schedule\EmployeeScheduleController;
use App\Http\Controllers\Api\V1\Schedule\HolidayController;
use App\Http\Controllers\Api\V1\Schedule\ShiftController;
use App\Http\Controllers\Api\V1\Search\GlobalSearchController;
use App\Http\Controllers\Api\V1\Setting\EmailTemplateController;
use App\Http\Controllers\Api\V1\Setting\SettingController;
use App\Http\Controllers\Api\V1\Tenant\TenantController;
use App\Http\Controllers\Api\V1\Training\TrainingController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Rotas públicas
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

    // Rotas autenticadas
    Route::middleware(['auth:sanctum', 'tenant'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::put('auth/profile', [AuthController::class, 'updateProfile']);
        Route::put('auth/password', [AuthController::class, 'updatePassword']);
        Route::post('auth/avatar', [AuthController::class, 'uploadAvatar']);

        // Dashboard
        Route::get('dashboard/hr', [DashboardController::class, 'hr']);
        Route::get('dashboard/manager', [DashboardController::class, 'manager']);
        Route::get('dashboard/employee', [DashboardController::class, 'employee']);

        // Estrutura organizacional
        Route::apiResource('departments', DepartmentController::class);
        Route::apiResource('positions', PositionController::class);
        Route::apiResource('branches', BranchController::class);

        // Empresa / tenant
        Route::get('company', [TenantController::class, 'current']);

        // Funcionários
        Route::apiResource('employees', EmployeeController::class);
        Route::get('employees/{employee}/contracts', [EmployeeController::class, 'contracts']);
        Route::get('employees/{employee}/timeline', [EmployeeController::class, 'timeline']);
        Route::post('employees/{employee}/contracts', [EmployeeController::class, 'storeContract']);

        // Importação de Funcionários via Excel
        Route::post('imports/employees/preview', [\App\Http\Controllers\Api\V1\Import\EmployeeImportController::class, 'preview']);
        Route::post('imports/employees/process', [\App\Http\Controllers\Api\V1\Import\EmployeeImportController::class, 'process']);
        Route::get('imports/employees/template', [\App\Http\Controllers\Api\V1\Import\EmployeeImportController::class, 'downloadTemplate']);

        // Contratos
        Route::apiResource('contracts', ContractController::class);
        Route::post('contracts/{contract}/deactivate', [ContractController::class, 'deactivate']);

        // Payroll
        Route::get('payroll/periods', [PayrollController::class, 'index']);
        Route::post('payroll/periods', [PayrollController::class, 'store']);
        Route::get('payroll/periods/{period}', [PayrollController::class, 'show']);
        Route::post('payroll/periods/{period}/process', [PayrollController::class, 'process']);
        Route::post('payroll/periods/{period}/approve', [PayrollController::class, 'approve']);
        Route::post('payroll/periods/{period}/close', [PayrollController::class, 'close']);
        Route::get('payroll/periods/{period}/records', [PayrollController::class, 'records']);
        Route::get('payroll/records/{record}/payslip', [PayslipController::class, 'show']);
        Route::get('payroll/records/{record}/payslip.pdf', [PayslipController::class, 'download']);
        Route::get('payroll/my-payslips', [MyPayslipsController::class, 'index']);

        // Presenças
        Route::post('attendance/toggle', [AttendanceController::class, 'toggle']);
        Route::post('attendance/manual', [AttendanceController::class, 'storeManual']);
        Route::get('attendance/today', [AttendanceController::class, 'today']);
        Route::get('attendance/my-history', [AttendanceController::class, 'myHistory']);
        Route::get('attendance', [AttendanceController::class, 'index']);
        Route::put('attendance/{record}', [AttendanceController::class, 'update']);
        Route::post('attendance/{record}/justify', [AttendanceController::class, 'justify']);

        // Presenças — QR Code
        Route::post('attendance/qr/issue', [AttendanceQrController::class, 'issue']);
        Route::post('attendance/qr/scan', [AttendanceQrController::class, 'scan']);

        // Recrutamento
        Route::apiResource('recruitment/jobs', JobOpeningController::class);
        Route::post('recruitment/jobs/{job}/publish', [JobOpeningController::class, 'publish']);
        Route::post('recruitment/jobs/{job}/close', [JobOpeningController::class, 'close']);
        Route::get('recruitment/jobs/{job}/candidates', [CandidateController::class, 'byJobOpening']);

        Route::apiResource('recruitment/candidates', CandidateController::class);
        Route::post('recruitment/candidates/{candidate}/move', [CandidateController::class, 'move']);
        Route::post('recruitment/candidates/{candidate}/hire', [CandidateController::class, 'hire']);

        // Férias / Ausências
        Route::get('leave/types', [LeaveController::class, 'types']);
        Route::get('leave/balance', [LeaveController::class, 'balance']);
        Route::get('leave/my-requests', [LeaveController::class, 'myRequests']);
        Route::get('leave', [LeaveController::class, 'index']);
        Route::post('leave', [LeaveController::class, 'store']);
        Route::post('leave/{leave}/approve', [LeaveController::class, 'approve']);
        Route::post('leave/{leave}/reject', [LeaveController::class, 'reject']);
        Route::post('leave/{leave}/cancel', [LeaveController::class, 'cancel']);
        // Aliases para plural (leaves)
        Route::get('leaves/types', [LeaveController::class, 'types']);
        Route::get('leaves/balance', [LeaveController::class, 'balance']);
        Route::get('leaves', [LeaveController::class, 'index']);
        Route::post('leaves', [LeaveController::class, 'store']);

        // Settings
        Route::get('settings', [SettingController::class, 'index']);
        Route::put('settings', [SettingController::class, 'update']);
        Route::put('settings/bulk', [SettingController::class, 'bulkUpdate']);

        // Documentos
        Route::get('documents', [EmployeeDocumentController::class, 'index']);
        Route::post('documents', [EmployeeDocumentController::class, 'store']);
        Route::get('documents/{document}/download', [EmployeeDocumentController::class, 'download']);
        Route::delete('documents/{document}', [EmployeeDocumentController::class, 'destroy']);

        // Notificações
        Route::get('notifications', [NotificationController::class, 'index']);
        Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
        Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);
        Route::post('notifications/{notification}/read', [NotificationController::class, 'markRead']);

        // Pesquisa global
        Route::get('search', [GlobalSearchController::class, 'search']);

        // Auditoria
        Route::get('audits', [AuditController::class, 'index']);
        Route::get('audits/{audit}', [AuditController::class, 'show']);

        // Relatórios
        Route::get('reports/headcount', [ReportController::class, 'headcount']);
        Route::get('reports/turnover', [ReportController::class, 'turnover']);
        Route::get('reports/payroll-summary', [ReportController::class, 'payrollSummary']);
        Route::get('reports/attendance-summary', [ReportController::class, 'attendanceSummary']);
        Route::get('reports/absenteeism', [ReportController::class, 'absenteeism']);
        Route::get('reports/cost', [ReportController::class, 'cost']);
        Route::get('reports/{type}/export', [ReportController::class, 'export']);

        // Horários e Turnos
        Route::apiResource('shifts', ShiftController::class);
        Route::apiResource('employee-schedules', EmployeeScheduleController::class);
        Route::get('my-schedule', [EmployeeScheduleController::class, 'mySchedule']);
        Route::apiResource('holidays', HolidayController::class)->except(['show']);

        // Avaliação de Desempenho
        Route::apiResource('performance', PerformanceEvaluationController::class);
        Route::post('performance/{evaluation}/approve', [PerformanceEvaluationController::class, 'approve']);
        Route::post('performance/{evaluation}/reject', [PerformanceEvaluationController::class, 'reject']);

        // Onboarding
        Route::apiResource('onboarding/templates', OnboardingTemplateController::class);
        Route::post('onboarding/templates/{template}/assign', [OnboardingTemplateController::class, 'assign']);
        Route::apiResource('onboarding/tasks', OnboardingTaskController::class);
        Route::post('onboarding/tasks/{task}/complete', [OnboardingTaskController::class, 'complete']);

        // Formação
        Route::apiResource('trainings', TrainingController::class);
        Route::post('trainings/{training}/enroll', [TrainingController::class, 'enroll']);
        Route::post('trainings/assignments/{assignment}/complete', [TrainingController::class, 'complete']);

        // Super Admin — gestão da plataforma
        Route::get('superadmin/dashboard', [SuperAdminController::class, 'dashboard']);
        Route::get('superadmin/tenants', [SuperAdminController::class, 'tenants']);
        Route::post('superadmin/tenants', [SuperAdminController::class, 'storeTenant']);
        Route::get('superadmin/tenants/{tenant}', [SuperAdminController::class, 'showTenant']);
        Route::put('superadmin/tenants/{tenant}', [SuperAdminController::class, 'updateTenant']);
        Route::delete('superadmin/tenants/{tenant}', [SuperAdminController::class, 'destroyTenant']);
        Route::get('superadmin/tenants/{tenant}/users', [SuperAdminController::class, 'listTenantUsers']);
        Route::post('superadmin/tenants/{tenant}/users', [SuperAdminController::class, 'storeUser']);
        Route::delete('superadmin/tenants/{tenant}/users/{user}', [SuperAdminController::class, 'destroyUser']);

        // Benefícios e Descontos
        Route::apiResource('benefits', BenefitController::class);
        Route::apiResource('deductions', DeductionController::class);
        Route::post('deductions/{deduction}/approve', [DeductionController::class, 'approve']);

        // Templates de Email
        Route::apiResource('email-templates', EmailTemplateController::class);
        Route::post('email-templates/{email_template}/preview', [EmailTemplateController::class, 'preview']);
    });
});
