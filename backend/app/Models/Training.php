<?php

namespace App\Models;

use App\Traits\HasTenant;
use Database\Factories\TrainingFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Training extends Model
{
    /** @use HasFactory<TrainingFactory> */
    use HasFactory;

    use HasTenant;
    use SoftDeletes;

    public const STATUSES = [
        'planned' => 'Planejada',
        'open' => 'Aberta para inscrições',
        'in_progress' => 'Em curso',
        'completed' => 'Concluída',
        'cancelled' => 'Cancelada',
    ];

    public const CATEGORIES = [
        'technical' => 'Técnica',
        'soft_skills' => 'Competências pessoais',
        'leadership' => 'Liderança',
        'compliance' => 'Conformidade',
        'safety' => 'Segurança',
        'onboarding' => 'Integração',
        'other' => 'Outra',
    ];

    protected $fillable = [
        'tenant_id',
        'created_by',
        'title',
        'description',
        'category',
        'duration_hours',
        'provider',
        'location',
        'cost',
        'currency',
        'max_participants',
        'start_date',
        'end_date',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'cost' => 'decimal:2',
            'duration_hours' => 'integer',
            'max_participants' => 'integer',
            'start_date' => 'date',
            'end_date' => 'date',
        ];
    }

    public function assignments()
    {
        return $this->hasMany(TrainingAssignment::class);
    }

    public function participants()
    {
        return $this->belongsToMany(Employee::class, 'training_assignments')
            ->withPivot(['status', 'enrolled_at', 'completed_at', 'score', 'notes'])
            ->withTimestamps();
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'open', 'in_progress' => 'info',
            'completed' => 'success',
            'cancelled' => 'destructive',
            default => 'secondary',
        };
    }

    public function getCategoryLabelAttribute(): string
    {
        return self::CATEGORIES[$this->category] ?? $this->category;
    }

    public function getEnrolledCountAttribute(): int
    {
        return $this->assignments()->count();
    }
}
