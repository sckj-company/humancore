<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DeductionInstallment extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    public const STATUSES = [
        'pending' => 'Pendente',
        'paid' => 'Pago / Descontado',
        'cancelled' => 'Cancelado',
    ];

    protected $fillable = [
        'tenant_id',
        'deduction_id',
        'employee_id',
        'installment_number',
        'reference_month',
        'percentage',
        'amount',
        'status',
        'payroll_period_id',
        'payroll_record_id',
        'paid_at',
    ];

    protected function casts(): array
    {
        return [
            'installment_number' => 'integer',
            'percentage' => 'decimal:2',
            'amount' => 'decimal:2',
            'paid_at' => 'datetime',
        ];
    }

    public function deduction(): BelongsTo
    {
        return $this->belongsTo(Deduction::class);
    }

    public function employee(): BelongsTo
    {
        return $this->belongsTo(Employee::class);
    }

    public function payrollPeriod(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class);
    }

    public function payrollRecord(): BelongsTo
    {
        return $this->belongsTo(PayrollRecord::class);
    }
}
