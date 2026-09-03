<?php

use App\Http\Controllers\Api\V1\Attendance\AttendanceController;
use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Contract\ContractController;
use App\Http\Controllers\Api\V1\Dashboard\DashboardController;
use App\Http\Controllers\Api\V1\Employee\EmployeeController;
use App\Http\Controllers\Api\V1\Leave\LeaveController;
use App\Http\Controllers\Api\V1\Organization\BranchController;
use App\Http\Controllers\Api\V1\Organization\DepartmentController;
use App\Http\Controllers\Api\V1\Organization\PositionController;
use App\Http\Controllers\Api\V1\Payroll\PayrollController;
use App\Http\Controllers\Api\V1\Payroll\PayslipController;
use App\Http\Controllers\Api\V1\Setting\SettingController;
use App\Http\Controllers\Api\V1\Tenant\TenantController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    // Rotas públicas
    Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

    // Rotas autenticadas
    Route::middleware(['auth:sanctum', 'tenant'])->group(function () {
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::get('auth/me', [AuthController::class, 'me']);

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

        // Contratos
        Route::apiResource('contracts', ContractController::class);

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

        // Presenças
        Route::post('attendance/toggle', [AttendanceController::class, 'toggle']);
        Route::get('attendance/today', [AttendanceController::class, 'today']);
        Route::get('attendance/my-history', [AttendanceController::class, 'myHistory']);
        Route::get('attendance', [AttendanceController::class, 'index']);
        Route::put('attendance/{record}', [AttendanceController::class, 'update']);

        // Férias / Ausências
        Route::get('leave/types', [LeaveController::class, 'types']);
        Route::get('leave/balance', [LeaveController::class, 'balance']);
        Route::get('leave/my-requests', [LeaveController::class, 'myRequests']);
        Route::get('leave', [LeaveController::class, 'index']);
        Route::post('leave', [LeaveController::class, 'store']);
        Route::post('leave/{leave}/approve', [LeaveController::class, 'approve']);
        Route::post('leave/{leave}/reject', [LeaveController::class, 'reject']);
        Route::post('leave/{leave}/cancel', [LeaveController::class, 'cancel']);

        // Settings
        Route::get('settings', [SettingController::class, 'index']);
        Route::put('settings', [SettingController::class, 'update']);
        Route::put('settings/bulk', [SettingController::class, 'bulkUpdate']);
    });
});
