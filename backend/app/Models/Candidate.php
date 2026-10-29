<?php

namespace App\Models;

use App\Traits\HasTenant;
use Database\Factories\CandidateFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Candidate extends Model
{
    /** @use HasFactory<CandidateFactory> */
    use HasFactory;

    use HasTenant;
    use SoftDeletes;

    public const STATUSES = [
        'applied' => 'Candidatura recebida',
        'screening' => 'Triagem curricular',
        'interview' => 'Em entrevista',
        'test' => 'Em avaliação',
        'offer' => 'Oferta enviada',
        'hired' => 'Contratado',
        'rejected' => 'Rejeitado',
        'withdrawn' => 'Desistiu',
    ];

    protected $fillable = [
        'tenant_id',
        'job_opening_id',
        'first_name',
        'last_name',
        'email',
        'phone',
        'location',
        'source',
        'resume_path',
        'cover_letter',
        'linkedin_url',
        'years_experience',
        'status',
        'expected_salary',
        'rating',
        'notes',
        'applied_at',
        'last_status_at',
    ];

    protected function casts(): array
    {
        return [
            'expected_salary' => 'decimal:2',
            'years_experience' => 'integer',
            'rating' => 'integer',
            'applied_at' => 'datetime',
            'last_status_at' => 'datetime',
        ];
    }

    public function jobOpening()
    {
        return $this->belongsTo(JobOpening::class);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeOpen($query)
    {
        return $query->whereNotIn('status', ['rejected', 'withdrawn', 'hired']);
    }

    public function getFullNameAttribute(): string
    {
        return trim($this->first_name.' '.$this->last_name);
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }
}
