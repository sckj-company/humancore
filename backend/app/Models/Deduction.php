<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Database\Factories\DeductionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Deduction extends Model
{
    /** @use HasFactory<DeductionFactory> */
    use HasFactory;

    use Auditable;
    use HasTenant;
    use SoftDeletes;

    public const TYPES = [
        'loan' => 'Empréstimo',
        'advance' => 'Adiantamento',
        'fine' => 'Multa',
        'pension' => 'Pensão Alimentícia',
        'insurance' => 'Seguro',
        'garnishment' => 'Penhora',
        'union_fee' => 'Quota Sindical',
        'other' => 'Outro',
    ];

    public const STATUSES = [
        'active' => 'Ativa',
        'paused' => 'Pausada',
        'completed' => 'Concluída',
        'cancelled' => 'Cancelada',
    ];

    public const AMOUNT_TYPES = [
        'fixed' => 'Valor fixo',
        'percentage' => 'Percentagem',
    ];

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'name',
        'deduction_type',
        'amount_type',
        'amount',
        'percentage',
        'total_amount',
        'paid_amount',
        'installment_count',
        'installment_amount',
        'starts_at',
        'requested_at',
        'is_recurring',
        'is_mandatory',
        'legal_basis',
        'signed_document_path',
        'signed_document_uploaded_at',
        'status',
        'approved_by',
        'approved_at',
        'notes',
        'cancellation_reason',
        'cancelled_at',
        'cancelled_by',
        'deletion_reason',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'percentage' => 'decimal:2',
            'total_amount' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'installment_amount' => 'decimal:2',
            'starts_at' => 'date',
            'requested_at' => 'datetime',
            'is_recurring' => 'boolean',
            'is_mandatory' => 'boolean',
            'signed_document_uploaded_at' => 'datetime',
            'approved_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function installments()
    {
        return $this->hasMany(DeductionInstallment::class)->orderBy('installment_number');
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function cancelledBy()
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function getTypeLabelAttribute(): string
    {
        return self::TYPES[$this->deduction_type] ?? $this->deduction_type;
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'active' => 'success',
            'paused' => 'warning',
            'completed' => 'info',
            'cancelled' => 'destructive',
            default => 'secondary',
        };
    }

    public function getAmountTypeLabelAttribute(): string
    {
        return self::AMOUNT_TYPES[$this->amount_type] ?? $this->amount_type;
    }

    public function getAmountLabelAttribute(): string
    {
        if ($this->amount_type === 'percentage') {
            return $this->percentage.'%';
        }

        return number_format((float) $this->amount, 2, ',', '.').' Kz';
    }

    public function getProgressLabelAttribute(): string
    {
        if (! $this->total_amount || $this->total_amount <= 0) {
            return $this->status_label;
        }

        $percent = round(((float) $this->paid_amount / (float) $this->total_amount) * 100);

        return $percent.'% pago';
    }
}
