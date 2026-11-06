<?php

namespace App\Models;

use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollRecordItem extends Model
{
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'payroll_record_id',
        'category',
        'code',
        'name',
        'salary_component_id',
        'deduction_id',
        'regulation_id',
        'inss_rule_id',
        'irt_table_id',
        'base_amount',
        'quantity',
        'rate',
        'amount',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'base_amount' => 'decimal:2',
            'quantity' => 'decimal:4',
            'rate' => 'decimal:6',
            'amount' => 'decimal:2',
        ];
    }

    public function payrollRecord(): BelongsTo
    {
        return $this->belongsTo(PayrollRecord::class);
    }

    public function salaryComponent(): BelongsTo
    {
        return $this->belongsTo(SalaryComponent::class);
    }

    public function deduction(): BelongsTo
    {
        return $this->belongsTo(Deduction::class);
    }

    public function regulation(): BelongsTo
    {
        return $this->belongsTo(SalaryComponentRegulation::class, 'regulation_id');
    }

    public function inssRule(): BelongsTo
    {
        return $this->belongsTo(PayrollInssRule::class, 'inss_rule_id');
    }

    public function irtTable(): BelongsTo
    {
        return $this->belongsTo(PayrollIrtTable::class, 'irt_table_id');
    }
}
