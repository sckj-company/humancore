<?php

namespace App\Http\Controllers\Api\V1\Search;

use App\Http\Controllers\Api\V1\BaseController;
use App\Models\Department;
use App\Models\Employee;
use App\Models\PayrollRecord;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GlobalSearchController extends BaseController
{
    public function search(Request $request): JsonResponse
    {
        $term = $request->string('search', $request->string('q'));
        $limit = min($request->integer('limit', 10), 25);

        if (strlen($term) < 2) {
            return $this->success([
                'employees' => [],
                'departments' => [],
                'payroll_records' => [],
            ]);
        }

        $employees = Employee::query()
            ->search($term)
            ->limit($limit)
            ->get(['id', 'first_name', 'last_name', 'employee_code', 'email', 'status', 'photo_path'])
            ->map(fn ($e) => [
                'type' => 'employee',
                'id' => $e->id,
                'title' => $e->full_name,
                'subtitle' => $e->employee_code.' — '.$e->email,
                'status' => $e->status,
                'avatar' => $e->photo_path,
            ]);

        $departments = Department::query()
            ->where('name', 'like', "%{$term}%")
            ->orWhere('code', 'like', "%{$term}%")
            ->limit($limit)
            ->get(['id', 'name', 'code'])
            ->map(fn ($d) => [
                'type' => 'department',
                'id' => $d->id,
                'title' => $d->name,
                'subtitle' => $d->code,
            ]);

        $payrollRecords = PayrollRecord::query()
            ->with(['employee:id,first_name,last_name,employee_code'])
            ->whereHas('employee', function ($q) use ($term) {
                $q->where('first_name', 'like', "%{$term}%")
                    ->orWhere('last_name', 'like', "%{$term}%")
                    ->orWhere('employee_code', 'like', "%{$term}%");
            })
            ->limit($limit)
            ->get(['id', 'employee_id', 'net_salary', 'status', 'payroll_period_id'])
            ->map(fn ($r) => [
                'type' => 'payroll_record',
                'id' => $r->id,
                'title' => $r->employee->full_name.' — Recibo',
                'subtitle' => number_format((float) $r->net_salary, 2, ',', '.').' AOA',
                'status' => $r->status,
            ]);

        return $this->success([
            'employees' => $employees,
            'departments' => $departments,
            'payroll_records' => $payrollRecords,
        ]);
    }
}
