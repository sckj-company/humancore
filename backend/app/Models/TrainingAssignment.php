<?php

namespace App\Models;

use App\Traits\HasTenant;
use Database\Factories\TrainingAssignmentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class TrainingAssignment extends Model
{
    /** @use HasFactory<TrainingAssignmentFactory> */
    use HasFactory;

    use HasTenant;

    public const STATUSES = [
        'enrolled' => 'Inscrito',
        'in_progress' => 'Em curso',
        'completed' => 'Concluído',
        'cancelled' => 'Cancelado',
        'no_show' => 'Não compareceu',
    ];

    protected $fillable = [
        'tenant_id',
        'training_id',
        'employee_id',
        'status',
        'enrolled_at',
        'completed_at',
        'score',
        'notes',
        'completed_by',
    ];

    protected function casts(): array
    {
        return [
            'enrolled_at' => 'datetime',
            'completed_at' => 'datetime',
            'score' => 'decimal:2',
        ];
    }

    public function training()
    {
        return $this->belongsTo(Training::class);
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function completer()
    {
        return $this->belongsTo(User::class, 'completed_by');
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'completed' => 'success',
            'in_progress' => 'info',
            'cancelled', 'no_show' => 'destructive',
            default => 'secondary',
        };
    }
}
