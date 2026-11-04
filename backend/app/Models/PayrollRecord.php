<?php

namespace App\Models;

use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PayrollRecord extends Model
{
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'payroll_period_id',
        'employee_id',
        'contract_id',
        'base_salary',
        'gross_salary',
        'total_earnings',
        'total_deductions',
        'total_taxes',
        'net_salary',
        'inss_base',
        'employer_inss_base',
        'employer_inss',
        'irt_taxable_base',
        'employer_cost',
        'currency',
        'work_days',
        'absent_days',
        'overtime_hours',
        'overtime_amount',
        'status',
        'approved_by',
        'approved_at',
        'paid_at',
        'details',
        'snapshot',
        'engine_version',
        'validation_errors',
    ];

    protected function casts(): array
    {
        return [
            'base_salary' => 'decimal:2',
            'gross_salary' => 'decimal:2',
            'total_earnings' => 'decimal:2',
            'total_deductions' => 'decimal:2',
            'total_taxes' => 'decimal:2',
            'net_salary' => 'decimal:2',
            'inss_base' => 'decimal:2',
            'employer_inss_base' => 'decimal:2',
            'employer_inss' => 'decimal:2',
            'irt_taxable_base' => 'decimal:2',
            'employer_cost' => 'decimal:2',
            'overtime_hours' => 'decimal:2',
            'overtime_amount' => 'decimal:2',
            'details' => 'array',
            'snapshot' => 'array',
            'validation_errors' => 'array',
            'approved_at' => 'datetime',
            'paid_at' => 'datetime',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function period()
    {
        return $this->belongsTo(PayrollPeriod::class, 'payroll_period_id');
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function contract()
    {
        return $this->belongsTo(EmployeeContract::class, 'contract_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function items(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(PayrollRecordItem::class);
    }
}
