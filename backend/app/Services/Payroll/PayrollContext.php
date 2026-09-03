<?php

namespace App\Services\Payroll;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollPeriod;
use App\Models\Tenant;
use Illuminate\Support\Collection;

class PayrollContext
{
    public Collection $attendance;

    public Collection $overtime;

    public Collection $absences;

    public Collection $leaves;

    public Collection $salaryComponents;

    public float $workDays = 0;

    public float $absentDays = 0;

    public float $lateMinutes = 0;

    public float $overtimeHours = 0;

    public array $settings;

    public function __construct(
        public Employee $employee,
        public EmployeeContract $contract,
        public PayrollPeriod $period,
    ) {
        $this->settings = $period->tenant
            ? $this->collectSettings($period->tenant)
            : [];
    }

    protected function collectSettings(Tenant $tenant): array
    {
        return $tenant->settings()
            ->get()
            ->mapWithKeys(fn ($s) => ["{$s->group}.{$s->key}" => $s->value])
            ->all();
    }

    public function setting(string $key, mixed $default = null): mixed
    {
        return $this->settings[$key] ?? $default;
    }
}
