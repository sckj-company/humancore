<?php

use App\Http\Controllers\Api\V1\Admin\CompanyPayrollReportController;
use App\Http\Controllers\Api\V1\Admin\PlanController;
use App\Http\Controllers\Api\V1\Admin\PlatformBillingController;
use App\Http\Controllers\Api\V1\Admin\SuperAdminController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceQrController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceReportController;
use App\Http\Controllers\Api\V1\Audit\AuditController;
use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Auth\PasswordResetController;
use App\Http\Controllers\Api\V1\Compensation\BenefitController;
use App\Http\Controllers\Api\V1\Compensation\DeductionController;
use App\Http\Controllers\Api\V1\Contract\ContractController;
use App\Http\Controllers\Api\V1\Dashboard\DashboardController;
use App\Http\Controllers\Api\V1\Document\EmployeeDocumentController;
use App\Http\Controllers\Api\V1\Employee\EmployeeController;
use App\Http\Controllers\Api\V1\Employee\EmployeeEducationController;
use App\Http\Controllers\Api\V1\Employee\EmployeeIdentityOcrController;
use App\Http\Controllers\Api\V1\Import\EmployeeImportController;
use App\Http\Controllers\Api\V1\Integration\BiometricIntegrationController;
use App\Http\Controllers\Api\V1\Leave\LeaveController;
use App\Http\Controllers\Api\V1\Notification\NotificationController;
use App\Http\Controllers\Api\V1\Onboarding\OnboardingTaskController;
use App\Http\Controllers\Api\V1\Onboarding\OnboardingTemplateController;
use App\Http\Controllers\Api\V1\Organization\BranchController;
use App\Http\Controllers\Api\V1\Organization\DepartmentController;
use App\Http\Controllers\Api\V1\Organization\PositionController;
use App\Http\Controllers\Api\V1\Payroll\EmployeePayrollSettingsController;
use App\Http\Controllers\Api\V1\Payroll\MyPayslipsController;
use App\Http\Controllers\Api\V1\Payroll\PayrollController;
use App\Http\Controllers\Api\V1\Payroll\PayrollInssRuleController;
use App\Http\Controllers\Api\V1\Payroll\PayrollIrtTableController;
use App\Http\Controllers\Api\V1\Payroll\PayrollPeriodReportController;
use App\Http\Controllers\Api\V1\Payroll\PayslipController;
use App\Http\Controllers\Api\V1\Payroll\SalaryComponentRegulationController;
use App\Http\Controllers\Api\V1\Performance\PerformanceEvaluationController;
use App\Http\Controllers\Api\V1\Recruitment\CandidateController;
use App\Http\Controllers\Api\V1\Recruitment\JobOpeningController;
use App\Http\Controllers\Api\V1\Report\ReportController;
use App\Http\Controllers\Api\V1\SaaS\CompanyBillingController;
use App\Http\Controllers\Api\V1\SaaS\PortfolioController;
use App\Http\Controllers\Api\V1\SaaS\TeamController;
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
    Route::post('auth/password-reset/request', [PasswordResetController::class, 'requestCode'])->middleware('throttle:password-reset-request');
    Route::post('auth/password-reset/verify', [PasswordResetController::class, 'verifyCode'])->middleware('throttle:password-reset');
    Route::post('auth/password-reset/reset', [PasswordResetController::class, 'resetPassword'])->middleware('throttle:password-reset');
    Route::get('invitations/{token}', [TeamController::class, 'showPublicInvitation']);
    Route::post('invitations/{token}/accept', [TeamController::class, 'acceptPublicInvitation']);

    // Rotas autenticadas (acessíveis mesmo se subscrição estiver suspensa para permitir pagamento/consulta)
    Route::middleware(['auth:sanctum', 'tenant'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);
        Route::put('auth/profile', [AuthController::class, 'updateProfile']);
        Route::put('auth/password', [AuthController::class, 'updatePassword']);
        Route::post('auth/avatar', [AuthController::class, 'uploadAvatar']);

        // Empresa / subscrição / faturação própria
        Route::get('company', [TenantController::class, 'current']);
        Route::get('company/subscription', [CompanyBillingController::class, 'subscription']);
        Route::get('company/billing/invoices', [CompanyBillingController::class, 'invoices']);
        Route::post('company/billing/invoices/{invoice}/payments', [CompanyBillingController::class, 'submitPayment']);
        Route::get('company/billing/payments/{payment}/proof', [CompanyBillingController::class, 'downloadProof']);

        // Notificações
        Route::get('notifications', [NotificationController::class, 'index']);
        Route::get('notifications/unread-count', [NotificationController::class, 'unreadCount']);
        Route::post('notifications/read-all', [NotificationController::class, 'markAllRead']);
        Route::post('notifications/{notification}/read', [NotificationController::class, 'markRead']);

        // Super Admin — gestão global da plataforma
        Route::prefix('superadmin')->group(function () {
            Route::get('dashboard', [SuperAdminController::class, 'dashboard']);
            Route::get('tenants', [SuperAdminController::class, 'tenants']);
            Route::post('tenants', [SuperAdminController::class, 'storeTenant']);
            Route::get('tenants/{tenant}', [SuperAdminController::class, 'showTenant']);
            Route::put('tenants/{tenant}', [SuperAdminController::class, 'updateTenant']);
            Route::delete('tenants/{tenant}', [SuperAdminController::class, 'destroyTenant']);
            Route::get('tenants/{tenant}/subscription', [PlanController::class, 'tenantSubscription']);
            Route::put('tenants/{tenant}/subscription', [PlanController::class, 'updateTenantSubscription']);
            Route::post('tenants/{tenant}/invoices', [PlatformBillingController::class, 'generateInvoice']);

            // Planos customizados
            Route::get('plans/catalog', [PlanController::class, 'catalog']);
            Route::get('plans', [PlanController::class, 'index']);
            Route::post('plans', [PlanController::class, 'store']);
            Route::get('plans/{plan}', [PlanController::class, 'show']);
            Route::put('plans/{plan}', [PlanController::class, 'update']);
            Route::post('plans/{plan}/duplicate', [PlanController::class, 'duplicate']);
            Route::delete('plans/{plan}', [PlanController::class, 'destroy']);
            Route::post('plans/{plan}/assign-tenants', [PlanController::class, 'assignToTenants']);

            // Relações entre empresas (Gestoras <-> Geridas)
            Route::get('relationships', [SuperAdminController::class, 'relationships']);
            Route::post('relationships', [SuperAdminController::class, 'attachRelationship']);
            Route::delete('relationships/{relationship}', [SuperAdminController::class, 'revokeRelationship']);

            // Faturação & Pagamentos da Plataforma
            Route::get('billing/invoices', [PlatformBillingController::class, 'invoices']);
            Route::get('billing/payments', [PlatformBillingController::class, 'payments']);
            Route::post('billing/payments/{payment}/approve', [PlatformBillingController::class, 'approvePayment']);
            Route::post('billing/payments/{payment}/reject', [PlatformBillingController::class, 'rejectPayment']);
            Route::get('billing/payments/{payment}/proof', [PlatformBillingController::class, 'downloadProof']);
            Route::post('billing/process-lifecycle', [PlatformBillingController::class, 'runLifecycle']);

            // Permissões, utilizadores e super-admins
            Route::get('tenant-permissions', [SuperAdminController::class, 'tenantPermissions']);
            Route::get('permission-groups', [SuperAdminController::class, 'permissionGroups']);
            Route::post('permission-groups', [SuperAdminController::class, 'storePermissionGroup']);
            Route::put('permission-groups/{group}', [SuperAdminController::class, 'updatePermissionGroup']);
            Route::delete('permission-groups/{group}', [SuperAdminController::class, 'destroyPermissionGroup']);
            Route::get('tenants/{tenant}/departments', [SuperAdminController::class, 'tenantDepartments']);
            Route::get('tenants/{tenant}/users', [SuperAdminController::class, 'listTenantUsers']);
            Route::post('tenants/{tenant}/users', [SuperAdminController::class, 'storeUser']);
            Route::put('tenants/{tenant}/users/{user}', [SuperAdminController::class, 'updateUser']);
            Route::delete('tenants/{tenant}/users/{user}', [SuperAdminController::class, 'destroyUser']);
            Route::put('users/{user}/password', [SuperAdminController::class, 'updateUserPassword']);
            Route::get('platform-users', [SuperAdminController::class, 'platformUsers']);
            Route::post('platform-users', [SuperAdminController::class, 'storePlatformUser']);
            Route::put('platform-users/{user}', [SuperAdminController::class, 'updatePlatformUser']);
            Route::delete('platform-users/{user}', [SuperAdminController::class, 'destroyPlatformUser']);

            // Relatórios, Dossiês Completos & Resumos Salariais Multi-empresa
            Route::get('payroll-reports/overview', [CompanyPayrollReportController::class, 'overview']);
            Route::get('payroll-reports/tenants/{tenant}/inspect', [CompanyPayrollReportController::class, 'inspectTenant']);
            Route::post('payroll-reports/tenants/{tenant}/dossier.pdf', [CompanyPayrollReportController::class, 'downloadCompanyDossier']);
            Route::get('payroll-reports/tenants/{tenant}/inss-map.pdf', [CompanyPayrollReportController::class, 'downloadCompanyInssMap']);
            Route::get('payroll-reports/tenants/{tenant}/irt-map.pdf', [CompanyPayrollReportController::class, 'downloadCompanyIrtMap']);
            Route::post('payroll-reports/bulk-singular.zip', [CompanyPayrollReportController::class, 'downloadBulkSingular']);
            Route::post('payroll-reports/general-summary.pdf', [CompanyPayrollReportController::class, 'downloadGeneralSummaryPdf']);
        });

        // Rotas operacionais protegidas pela subscrição ativa do tenant
        Route::middleware('subscription.active')->group(function () {
            // Dashboard
            Route::get('dashboard/hr', [DashboardController::class, 'hr']);
            Route::get('dashboard/manager', [DashboardController::class, 'manager']);
            Route::get('dashboard/employee', [DashboardController::class, 'employee']);

            // Pesquisa global
            Route::get('search', [GlobalSearchController::class, 'search']);

            // Gestão de equipa da empresa (Admin do tenant / Gestora)
            Route::prefix('team')->group(function () {
                Route::get('/', [TeamController::class, 'index']);
                Route::post('users', [TeamController::class, 'storeUser'])->middleware('plan.quota:max_users');
                Route::put('users/{user}', [TeamController::class, 'updateUser']);
                Route::post('invitations', [TeamController::class, 'invite'])->middleware('plan.quota:max_users');
                Route::delete('invitations/{invitation}', [TeamController::class, 'cancelInvitation']);
                Route::post('permission-groups', [TeamController::class, 'storePermissionGroup']);
                Route::delete('permission-groups/{group}', [TeamController::class, 'destroyPermissionGroup']);
            });

            // Carteira de Empresas Geridas (para Empresas Gestoras habilitadas pelo plano)
            Route::prefix('portfolio')->middleware('plan.feature:can_manage_other_tenants')->group(function () {
                Route::get('dashboard', [PortfolioController::class, 'dashboard']);
                Route::get('tenants', [PortfolioController::class, 'index']);
                Route::post('tenants', [PortfolioController::class, 'store']);
                Route::put('tenants/{managedTenant}', [PortfolioController::class, 'update']);
                Route::delete('tenants/{managedTenant}', [PortfolioController::class, 'revoke']);
                Route::get('tenants/{managedTenant}/team-access', [PortfolioController::class, 'teamAccesses']);
                Route::post('tenants/{managedTenant}/team-access', [PortfolioController::class, 'syncTeamAccess']);
            });

            // Estrutura organizacional
            Route::middleware('plan.feature:departments_positions')->group(function () {
                Route::apiResource('departments', DepartmentController::class)->middleware('plan.quota:max_departments');
                Route::apiResource('positions', PositionController::class);
            });
            Route::apiResource('branches', BranchController::class)
                ->middleware(['plan.feature:branches', 'plan.quota:max_branches']);

            // Funcionários
            Route::post('employees/ocr-id', EmployeeIdentityOcrController::class)
                ->middleware(['throttle:10,1', 'plan.feature:ocr_identity', 'plan.quota:max_ocr_requests_per_month']);
            Route::middleware('plan.feature:employees')->group(function () {
                Route::apiResource('employees', EmployeeController::class)->middleware('plan.quota:max_employees');
                Route::patch('employees/{employee}/approval', [EmployeeController::class, 'updateApproval'])
                    ->middleware('plan.feature:employee_approvals');
                Route::get('employees/{employee}/contracts', [EmployeeController::class, 'contracts']);
                Route::get('employees/{employee}/timeline', [EmployeeController::class, 'timeline']);
                Route::post('employees/{employee}/contracts', [EmployeeController::class, 'storeContract']);

                // Contratos
                Route::apiResource('contracts', ContractController::class);
                Route::post('contracts/{contract}/deactivate', [ContractController::class, 'deactivate']);
            });

            // Educação / Advertências
            Route::middleware('plan.feature:employee_educations')->group(function () {
                Route::get('employees/{employee}/educations', [EmployeeEducationController::class, 'index']);
                Route::post('employees/{employee}/educations', [EmployeeEducationController::class, 'store']);
                Route::put('employees/{employee}/educations/{education}', [EmployeeEducationController::class, 'update']);
                Route::delete('employees/{employee}/educations/{education}', [EmployeeEducationController::class, 'destroy']);
                Route::get('employees/{employee}/educations/{education}/receipt.pdf', [EmployeeEducationController::class, 'receiptPdf']);
                Route::post('employees/{employee}/educations/{education}/document', [EmployeeEducationController::class, 'uploadDocument']);
                Route::post('employees/{employee}/educations/{education}/signed-document', [EmployeeEducationController::class, 'uploadSignedDocument']);
                Route::get('employees/{employee}/educations/{education}/documents/{kind}', [EmployeeEducationController::class, 'downloadDocument'])->whereIn('kind', ['attachment', 'signed']);

                Route::get('educations', [EmployeeEducationController::class, 'indexGeneral']);
                Route::post('educations', [EmployeeEducationController::class, 'storeGeneral']);
                Route::put('educations/{education}', [EmployeeEducationController::class, 'updateGeneral']);
                Route::delete('educations/{education}', [EmployeeEducationController::class, 'destroyGeneral']);
                Route::get('educations/{education}/receipt.pdf', [EmployeeEducationController::class, 'receiptPdfGeneral']);
                Route::post('educations/{education}/document', [EmployeeEducationController::class, 'uploadDocumentGeneral']);
                Route::post('educations/{education}/signed-document', [EmployeeEducationController::class, 'uploadSignedDocumentGeneral']);
                Route::get('educations/{education}/documents/{kind}', [EmployeeEducationController::class, 'downloadDocumentGeneral'])->whereIn('kind', ['attachment', 'signed']);
            });

            // Importação Excel
            Route::middleware('plan.feature:excel_import')->group(function () {
                Route::post('imports/employees/preview', [EmployeeImportController::class, 'preview']);
                Route::post('imports/employees/process', [EmployeeImportController::class, 'process']);
                Route::get('imports/employees/template', [EmployeeImportController::class, 'downloadTemplate']);
            });

            // Payroll
            Route::middleware('plan.feature:payroll')->group(function () {
                Route::get('payroll/periods', [PayrollController::class, 'index']);
                Route::post('payroll/periods', [PayrollController::class, 'store']);
                Route::get('payroll/periods/{period}', [PayrollController::class, 'show']);
                Route::post('payroll/periods/{period}/process', [PayrollController::class, 'process']);
                Route::post('payroll/periods/{period}/recalculate', [PayrollController::class, 'recalculate']);
                Route::get('payroll/periods/{period}/progress', [PayrollController::class, 'progress']);
                Route::get('payroll/periods/{period}/processable-employees', [PayrollController::class, 'processableEmployees']);
                Route::get('payroll/periods/{period}/validations', [PayrollController::class, 'validations']);
                Route::post('payroll/periods/{period}/submit', [PayrollController::class, 'submit']);
                Route::post('payroll/periods/{period}/approve', [PayrollController::class, 'approve']);
                Route::post('payroll/periods/{period}/reject', [PayrollController::class, 'reject']);
                Route::post('payroll/periods/{period}/close', [PayrollController::class, 'close']);
                Route::post('payroll/periods/{period}/reopen', [PayrollController::class, 'reopen']);
                Route::post('payroll/periods/{period}/pay', [PayrollController::class, 'pay']);
                Route::get('payroll/periods/{period}/records', [PayrollController::class, 'records']);
                Route::get('payroll/periods/{period}/events', [PayrollController::class, 'events']);
                Route::get('payroll/periods/{period}/report', [PayrollPeriodReportController::class, 'show']);
                Route::put('payroll/periods/{period}/report', [PayrollPeriodReportController::class, 'upsert']);
                Route::post('payroll/periods/{period}/report/documents', [PayrollPeriodReportController::class, 'storeDocument']);
                Route::post('payroll/periods/{period}/report/documents/attach-system', [PayrollPeriodReportController::class, 'attachSystemDocument']);
                Route::patch('payroll/periods/{period}/report/documents/{document}', [PayrollPeriodReportController::class, 'updateDocument']);
                Route::get('payroll/periods/{period}/report/documents/{document}/download', [PayrollPeriodReportController::class, 'downloadDocument']);
                Route::delete('payroll/periods/{period}/report/documents/{document}', [PayrollPeriodReportController::class, 'destroyDocument']);
                Route::get('employees/{employee}/payroll-settings', [EmployeePayrollSettingsController::class, 'show']);
                Route::put('employees/{employee}/payroll-settings', [EmployeePayrollSettingsController::class, 'update']);

                Route::middleware('plan.feature:salary_regulations')->group(function () {
                    Route::get('payroll/salary-components', [SalaryComponentRegulationController::class, 'components']);
                    Route::post('payroll/salary-components', [SalaryComponentRegulationController::class, 'storeComponent']);
                    Route::post('payroll/salary-component-regulations/initialize-angola', [SalaryComponentRegulationController::class, 'initializeAngolaDefaults']);
                    Route::get('payroll/salary-component-regulations', [SalaryComponentRegulationController::class, 'index']);
                    Route::post('payroll/salary-component-regulations', [SalaryComponentRegulationController::class, 'store']);
                    Route::put('payroll/salary-component-regulations/{regulation}', [SalaryComponentRegulationController::class, 'update']);
                    Route::post('payroll/salary-component-regulations/{regulation}/validate', [SalaryComponentRegulationController::class, 'validateRegulation']);
                    Route::post('payroll/salary-component-regulations/{regulation}/activate', [SalaryComponentRegulationController::class, 'activate']);
                    Route::delete('payroll/salary-component-regulations/{regulation}', [SalaryComponentRegulationController::class, 'destroy']);
                    Route::post('payroll/salary-component-regulations/{regulation}/revoke', [SalaryComponentRegulationController::class, 'revoke']);
                    Route::get('payroll/salary-component-regulations/{regulation}/document', [SalaryComponentRegulationController::class, 'downloadDocument']);
                });

                Route::middleware('plan.feature:payroll_inss_irt_custom')->group(function () {
                    Route::get('payroll/inss-rules', [PayrollInssRuleController::class, 'index']);
                    Route::post('payroll/inss-rules', [PayrollInssRuleController::class, 'store']);
                    Route::get('payroll/inss-rules/{rule}', [PayrollInssRuleController::class, 'show']);
                    Route::get('payroll/inss-rules/{rule}/document', [PayrollInssRuleController::class, 'downloadDocument']);
                    Route::put('payroll/inss-rules/{rule}', [PayrollInssRuleController::class, 'update']);
                    Route::post('payroll/inss-rules/{rule}/validate', [PayrollInssRuleController::class, 'validateRule']);
                    Route::post('payroll/inss-rules/{rule}/activate', [PayrollInssRuleController::class, 'activate']);
                    Route::post('payroll/inss-rules/{rule}/revoke', [PayrollInssRuleController::class, 'revoke']);
                    Route::delete('payroll/inss-rules/{rule}', [PayrollInssRuleController::class, 'destroy']);

                    Route::get('payroll/irt-tables', [PayrollIrtTableController::class, 'index']);
                    Route::post('payroll/irt-tables', [PayrollIrtTableController::class, 'store']);
                    Route::get('payroll/irt-tables/{irtTable}', [PayrollIrtTableController::class, 'show']);
                    Route::get('payroll/irt-tables/{irtTable}/document', [PayrollIrtTableController::class, 'downloadDocument']);
                    Route::put('payroll/irt-tables/{irtTable}', [PayrollIrtTableController::class, 'update']);
                    Route::post('payroll/irt-tables/{irtTable}/validate', [PayrollIrtTableController::class, 'validateTable']);
                    Route::post('payroll/irt-tables/{irtTable}/activate', [PayrollIrtTableController::class, 'activate']);
                    Route::post('payroll/irt-tables/{irtTable}/revoke', [PayrollIrtTableController::class, 'revoke']);
                    Route::delete('payroll/irt-tables/{irtTable}', [PayrollIrtTableController::class, 'destroy']);
                });

                Route::middleware('plan.feature:payslips_pdf')->group(function () {
                    Route::get('payroll/records/{record}/payslip', [PayslipController::class, 'show']);
                    Route::get('payroll/records/{record}/payslip.pdf', [PayslipController::class, 'download']);
                    Route::get('payroll/periods/{period}/payslip.pdf', [PayslipController::class, 'downloadPeriod']);
                    Route::get('payroll/periods/{period}/inss-map.pdf', [PayslipController::class, 'downloadInssMap']);
                    Route::get('payroll/periods/{period}/irt-map.pdf', [PayslipController::class, 'downloadIrtMap']);
                    Route::post('payroll/periods/{period}/payslips/bulk.pdf', [PayslipController::class, 'downloadBulk']);
                    Route::get('payroll/my-payslips', [MyPayslipsController::class, 'index']);
                });
            });

            // Presenças
            Route::middleware('plan.feature:attendance_manual')->group(function () {
                Route::post('attendance/toggle', [AttendanceController::class, 'toggle']);
                Route::post('attendance/manual', [AttendanceController::class, 'storeManual']);
                Route::get('attendance/today', [AttendanceController::class, 'today']);
                Route::get('attendance/my-history', [AttendanceController::class, 'myHistory']);
                Route::get('attendance/report', [AttendanceReportController::class, 'index']);
                Route::get('attendance/report.pdf', [AttendanceReportController::class, 'pdf']);
                Route::get('attendance', [AttendanceController::class, 'index']);
                Route::put('attendance/{record}', [AttendanceController::class, 'update']);
                Route::post('attendance/{record}/justify', [AttendanceController::class, 'justify']);
            });

            // Presenças — QR Code
            Route::middleware('plan.feature:attendance_qr')->group(function () {
                Route::post('attendance/qr/issue', [AttendanceQrController::class, 'issue']);
                Route::post('attendance/qr/scan', [AttendanceQrController::class, 'scan']);
            });

            // Integração Biométrica
            Route::prefix('integrations/biometric')->middleware('plan.feature:biometric_integration')->group(function () {
                Route::get('employees', [BiometricIntegrationController::class, 'employees']);
                Route::post('employees/sync', [BiometricIntegrationController::class, 'syncEmployees']);
                Route::post('attendance', [BiometricIntegrationController::class, 'attendance']);
                Route::post('attendance/close-day', [BiometricIntegrationController::class, 'closeDay']);
            });

            // Recrutamento
            Route::middleware('plan.feature:recruitment')->group(function () {
                Route::apiResource('recruitment/jobs', JobOpeningController::class);
                Route::post('recruitment/jobs/{job}/publish', [JobOpeningController::class, 'publish']);
                Route::post('recruitment/jobs/{job}/close', [JobOpeningController::class, 'close']);
                Route::get('recruitment/jobs/{job}/candidates', [CandidateController::class, 'byJobOpening']);

                Route::apiResource('recruitment/candidates', CandidateController::class);
                Route::post('recruitment/candidates/{candidate}/move', [CandidateController::class, 'move']);
                Route::post('recruitment/candidates/{candidate}/hire', [CandidateController::class, 'hire']);
            });

            // Férias / Ausências
            Route::middleware('plan.feature:leave_management')->group(function () {
                Route::get('leave/types', [LeaveController::class, 'types']);
                Route::post('leave/types', [LeaveController::class, 'storeType']);
                Route::get('leave/balance', [LeaveController::class, 'balance']);
                Route::get('leave/my-requests', [LeaveController::class, 'myRequests']);
                Route::get('leave', [LeaveController::class, 'index']);
                Route::post('leave', [LeaveController::class, 'store']);
                Route::put('leave/{leave}', [LeaveController::class, 'update']);
                Route::get('leave/{leave}/receipt.pdf', [LeaveController::class, 'receiptPdf']);
                Route::post('leave/receipt-preview.pdf', [LeaveController::class, 'receiptPreviewPdf']);
                Route::get('leave/{leave}/documents/{kind}', [LeaveController::class, 'downloadDocument'])->whereIn('kind', ['justification', 'signed']);
                Route::post('leave/{leave}/documents/{kind}', [LeaveController::class, 'uploadDocument'])->whereIn('kind', ['justification', 'signed']);
                Route::post('leave/{leave}/approve', [LeaveController::class, 'approve']);
                Route::post('leave/{leave}/reject', [LeaveController::class, 'reject']);
                Route::post('leave/{leave}/cancel', [LeaveController::class, 'cancel']);

                Route::get('leaves/types', [LeaveController::class, 'types']);
                Route::get('leaves/balance', [LeaveController::class, 'balance']);
                Route::get('leaves', [LeaveController::class, 'index']);
                Route::post('leaves', [LeaveController::class, 'store']);
                Route::put('leaves/{leave}', [LeaveController::class, 'update']);
                Route::get('leaves/{leave}/receipt.pdf', [LeaveController::class, 'receiptPdf']);
                Route::post('leaves/receipt-preview.pdf', [LeaveController::class, 'receiptPreviewPdf']);
            });

            // Settings
            Route::get('settings', [SettingController::class, 'index']);
            Route::put('settings', [SettingController::class, 'update']);
            Route::put('settings/bulk', [SettingController::class, 'bulkUpdate']);

            // Documentos
            Route::middleware('plan.feature:documents_storage')->group(function () {
                Route::get('documents', [EmployeeDocumentController::class, 'index']);
                Route::post('documents', [EmployeeDocumentController::class, 'store'])->middleware('plan.quota:max_storage_mb');
                Route::patch('documents/{document}/verify', [EmployeeDocumentController::class, 'toggleVerify']);
                Route::get('documents/{document}/download', [EmployeeDocumentController::class, 'download']);
                Route::delete('documents/{document}', [EmployeeDocumentController::class, 'destroy']);
            });

            // Auditoria
            Route::middleware('plan.feature:audits')->group(function () {
                Route::get('audits', [AuditController::class, 'index']);
                Route::get('audits/{audit}', [AuditController::class, 'show']);
            });

            // Relatórios
            Route::middleware('plan.feature:reports_basic')->group(function () {
                Route::get('reports/headcount', [ReportController::class, 'headcount']);
                Route::get('reports/turnover', [ReportController::class, 'turnover']);
                Route::get('reports/payroll-summary', [ReportController::class, 'payrollSummary']);
                Route::get('reports/payroll-period-summary', [ReportController::class, 'payrollPeriodSummary']);
                Route::post('reports/payroll-period-summary.pdf', [ReportController::class, 'payrollPeriodSummaryPdf']);
                Route::get('reports/attendance-summary', [ReportController::class, 'attendanceSummary']);
                Route::get('reports/absenteeism', [ReportController::class, 'absenteeism']);
                Route::get('reports/cost', [ReportController::class, 'cost']);
                Route::get('reports/{type}/export', [ReportController::class, 'export'])
                    ->middleware('plan.feature:reports_advanced_export');
            });

            // Horários e Turnos
            Route::middleware('plan.feature:schedules_shifts')->group(function () {
                Route::apiResource('shifts', ShiftController::class);
                Route::apiResource('employee-schedules', EmployeeScheduleController::class);
                Route::get('my-schedule', [EmployeeScheduleController::class, 'mySchedule']);
            });
            Route::apiResource('holidays', HolidayController::class)
                ->except(['show'])
                ->middleware('plan.feature:holidays');

            // Avaliação de Desempenho
            Route::middleware('plan.feature:performance')->group(function () {
                Route::apiResource('performance', PerformanceEvaluationController::class);
                Route::post('performance/{evaluation}/approve', [PerformanceEvaluationController::class, 'approve']);
                Route::post('performance/{evaluation}/reject', [PerformanceEvaluationController::class, 'reject']);
            });

            // Onboarding
            Route::middleware('plan.feature:onboarding')->group(function () {
                Route::apiResource('onboarding/templates', OnboardingTemplateController::class);
                Route::post('onboarding/templates/{template}/assign', [OnboardingTemplateController::class, 'assign']);
                Route::apiResource('onboarding/tasks', OnboardingTaskController::class);
                Route::post('onboarding/tasks/{task}/complete', [OnboardingTaskController::class, 'complete']);
            });

            // Formação
            Route::middleware('plan.feature:trainings')->group(function () {
                Route::apiResource('trainings', TrainingController::class);
                Route::post('trainings/{training}/enroll', [TrainingController::class, 'enroll']);
                Route::post('trainings/assignments/{assignment}/complete', [TrainingController::class, 'complete']);
            });

            // Benefícios e Descontos
            Route::apiResource('benefits', BenefitController::class)->middleware('plan.feature:benefits');
            Route::middleware('plan.feature:deductions_installments')->group(function () {
                Route::apiResource('deductions', DeductionController::class);
                Route::post('deductions/{deduction}/approve', [DeductionController::class, 'approve']);
                Route::post('deductions/{deduction}/cancel', [DeductionController::class, 'cancel']);
                Route::get('deductions/{deduction}/receipt.pdf', [DeductionController::class, 'receiptPdf']);
                Route::post('deductions/{deduction}/signed-document', [DeductionController::class, 'uploadSignedDocument']);
                Route::get('deductions/{deduction}/signed-document', [DeductionController::class, 'downloadSignedDocument']);
            });

            // Templates de Email
            Route::middleware('plan.feature:email_templates')->group(function () {
                Route::apiResource('email-templates', EmailTemplateController::class);
                Route::post('email-templates/{email_template}/preview', [EmailTemplateController::class, 'preview']);
            });
        });
    });
});
