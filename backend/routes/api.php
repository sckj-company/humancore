<?php

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Contract\ContractController;
use App\Http\Controllers\Api\V1\Dashboard\DashboardController;
use App\Http\Controllers\Api\V1\Employee\EmployeeController;
use App\Http\Controllers\Api\V1\Organization\BranchController;
use App\Http\Controllers\Api\V1\Organization\DepartmentController;
use App\Http\Controllers\Api\V1\Organization\PositionController;
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
    });
});
