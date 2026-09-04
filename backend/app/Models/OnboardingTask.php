<?php

namespace App\Models;

use App\Traits\HasTenant;
use Database\Factories\OnboardingTaskFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OnboardingTask extends Model
{
    /** @use HasFactory<OnboardingTaskFactory> */
    use HasFactory;

    use HasTenant;

    public const STATUSES = [
        'pending' => 'Pendente',
        'in_progress' => 'Em curso',
        'completed' => 'Concluída',
        'cancelled' => 'Cancelada',
    ];

    protected $fillable = [
        'tenant_id',
        'template_id',
        'employee_id',
        'assignee_id',
        'title',
        'description',
        'due_days',
        'due_date',
        'sort_order',
        'status',
        'completed_at',
        'completed_by',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'due_date' => 'date',
            'completed_at' => 'datetime',
        ];
    }

    public function template()
    {
        return $this->belongsTo(OnboardingTemplate::class, 'template_id');
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assignee_id');
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
            'cancelled' => 'destructive',
            default => 'secondary',
        };
    }
}
