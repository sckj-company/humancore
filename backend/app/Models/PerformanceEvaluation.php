<?php

namespace App\Models;

use App\Traits\HasTenant;
use Database\Factories\PerformanceEvaluationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class PerformanceEvaluation extends Model
{
    /** @use HasFactory<PerformanceEvaluationFactory> */
    use HasFactory;

    use HasTenant;
    use SoftDeletes;

    public const STATUSES = [
        'draft' => 'Rascunho',
        'submitted' => 'Submetida',
        'approved' => 'Aprovada',
        'rejected' => 'Rejeitada',
    ];

    public const CYCLES = [
        'monthly' => 'Mensal',
        'quarterly' => 'Trimestral',
        'semi_annual' => 'Semestral',
        'annual' => 'Anual',
        'probation' => 'Período experimental',
    ];

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'evaluator_id',
        'period',
        'cycle',
        'period_start',
        'period_end',
        'score',
        'criteria',
        'strengths',
        'improvements',
        'goals',
        'comments',
        'status',
        'submitted_at',
        'approved_at',
        'approved_by',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'score' => 'decimal:2',
            'criteria' => 'array',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function evaluator()
    {
        return $this->belongsTo(User::class, 'evaluator_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function scopeForTenant($query)
    {
        return $query;
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'approved' => 'success',
            'submitted' => 'info',
            'rejected' => 'destructive',
            default => 'secondary',
        };
    }
}
