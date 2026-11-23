<?php

namespace App\Models;

use App\Services\Payroll\PayrollSyncService;
use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeContract extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;
    use SoftDeletes;

    protected static function booted(): void
    {
        static::saved(function (self $contract): void {
            if (
                $contract->wasChanged(['base_salary', 'start_date', 'end_date', 'is_active'])
                || ($contract->wasRecentlyCreated && $contract->is_active)
            ) {
                app(PayrollSyncService::class)->syncOnContractSalaryChanged($contract);
            }
        });
    }

    protected $fillable = [
        'employee_id',
        'tenant_id',
        'position_id',
        'department_id',
        'manager_id',
        'contract_type',
        'base_salary',
        'salary_frequency',
        'work_hours_per_week',
        'start_date',
        'end_date',
        'is_active',
        'signed_at',
        'document_path',
        'notes',
        'termination_type',
        'termination_reason',
        'termination_date',
        'notice_days_required',
        'notice_days_served',
        'unused_vacation_days',
        'settlement_breakdown',
        'gross_settlement',
        'total_deductions_settlement',
        'net_settlement',
        'terminated_by',
        'terminated_at',
    ];

    protected function casts(): array
    {
        return [
            'base_salary' => 'decimal:2',
            'work_hours_per_week' => 'decimal:2',
            'start_date' => 'date',
            'end_date' => 'date',
            'signed_at' => 'date',
            'termination_date' => 'date',
            'terminated_at' => 'datetime',
            'is_active' => 'boolean',
            'unused_vacation_days' => 'decimal:2',
            'settlement_breakdown' => 'array',
            'gross_settlement' => 'decimal:2',
            'total_deductions_settlement' => 'decimal:2',
            'net_settlement' => 'decimal:2',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function position()
    {
        return $this->belongsTo(Position::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function manager()
    {
        return $this->belongsTo(Employee::class, 'manager_id');
    }

    public function salaryComponents()
    {
        return $this->hasMany(EmployeeSalaryComponent::class, 'contract_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopeExpired(Builder $query): Builder
    {
        return $query
            ->whereNotNull('end_date')
            ->whereDate('end_date', '<', today());
    }

    /**
     * Desativa contratos com data de fim anterior à data atual.
     * Não altera o estado do funcionário.
     */
    public static function deactivateExpired(): int
    {
        return static::query()
            ->active()
            ->expired()
            ->update(['is_active' => false]);
    }
}
