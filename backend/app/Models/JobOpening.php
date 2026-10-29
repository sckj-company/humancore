<?php

namespace App\Models;

use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class JobOpening extends Model
{
    use HasFactory;
    use HasTenant;
    use SoftDeletes;

    public const STATUSES = [
        'draft' => 'Rascunho',
        'open' => 'Aberta',
        'on_hold' => 'Em pausa',
        'closed' => 'Fechada',
        'cancelled' => 'Cancelada',
    ];

    public const EMPLOYMENT_TYPES = [
        'full_time' => 'Tempo integral',
        'part_time' => 'Tempo parcial',
        'contract' => 'Contrato',
        'temporary' => 'Temporário',
        'internship' => 'Estágio',
    ];

    public const EXPERIENCE_LEVELS = [
        'intern' => 'Estagiário',
        'junior' => 'Júnior',
        'mid' => 'Pleno',
        'senior' => 'Sénior',
        'lead' => 'Lead',
    ];

    protected $fillable = [
        'tenant_id',
        'department_id',
        'position_id',
        'created_by',
        'title',
        'slug',
        'description',
        'requirements',
        'location',
        'employment_type',
        'experience_level',
        'salary_min',
        'salary_max',
        'currency',
        'openings_count',
        'status',
        'published_at',
        'closes_at',
        'closed_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'salary_min' => 'decimal:2',
            'salary_max' => 'decimal:2',
            'openings_count' => 'integer',
            'published_at' => 'date',
            'closes_at' => 'date',
            'closed_at' => 'date',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (JobOpening $job): void {
            if (empty($job->slug)) {
                $job->slug = Str::slug($job->title).'-'.Str::lower(Str::random(6));
            }
        });
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function position()
    {
        return $this->belongsTo(Position::class);
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function candidates()
    {
        return $this->hasMany(Candidate::class);
    }

    public function isOpen(): bool
    {
        return $this->status === 'open';
    }

    public function scopeOpen($query)
    {
        return $query->where('status', 'open');
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['open', 'on_hold', 'draft']);
    }

    public function getCandidatesCountAttribute(): int
    {
        return $this->candidates()->count();
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }

    public function getStatusVariantAttribute(): string
    {
        return match ($this->status) {
            'open' => 'success',
            'draft' => 'secondary',
            'on_hold' => 'warning',
            'closed' => 'info',
            'cancelled' => 'destructive',
            default => 'secondary',
        };
    }

    public function getSalaryRangeAttribute(): ?string
    {
        if (! $this->salary_min && ! $this->salary_max) {
            return null;
        }

        $currency = $this->currency ?? 'AOA';
        $min = $this->salary_min ? number_format((float) $this->salary_min, 0, '.', ' ') : '?';
        $max = $this->salary_max ? number_format((float) $this->salary_max, 0, '.', ' ') : '?';

        return "{$min} - {$max} {$currency}";
    }
}
