<?php

namespace App\Services\Payroll;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\PayrollInssRule;
use App\Models\PayrollIrtTable;
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

    public Collection $deductions;

    public ?PayrollInssRule $inssRule = null;

    public ?PayrollIrtTable $irtTable = null;

    public float $workDays = 0;

    public float $absentDays = 0;

    public float $lateMinutes = 0;

    public float $overtimeHours = 0;

    public float $inssAmount = 0;

    public float $inssBase = 0;

    public float $employerInssBase = 0;

    public float $irtBase = 0;

    public array $latenessEvents = [];

    public array $settings;

    public function __construct(
        public Employee $employee,
        public ?EmployeeContract $contract,
        public PayrollPeriod $period,
    ) {
        $this->attendance = collect();
        $this->overtime = collect();
        $this->absences = collect();
        $this->leaves = collect();
        $this->salaryComponents = collect();
        $this->deductions = collect();

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
