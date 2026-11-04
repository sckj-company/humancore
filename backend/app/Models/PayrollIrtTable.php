<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PayrollIrtTable extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'country_code',
        'regime_code',
        'version',
        'effective_from',
        'effective_to',
        'brackets',
        'status',
        'legal_source',
        'legal_reference',
        'legal_document_path',
        'validated_at',
        'validated_by',
        'revoked_at',
        'revoked_by',
        'revocation_reason',
    ];

    protected function casts(): array
    {
        return [
            'version' => 'integer',
            'effective_from' => 'date',
            'effective_to' => 'date',
            'brackets' => 'array',
            'validated_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function scopeEffectiveFor(
        Builder $query,
        DateTimeInterface $date,
        string $countryCode = 'AO',
        string $regimeCode = 'standard'
    ): Builder {
        return $query
            ->where('status', 'active')
            ->where('country_code', strtoupper($countryCode))
            ->where('regime_code', $regimeCode)
            ->whereDate('effective_from', '<=', $date)
            ->where(function (Builder $query) use ($date): void {
                $query->whereNull('effective_to')
                    ->orWhereDate('effective_to', '>=', $date);
            })
            ->whereNotNull('validated_at')
            ->whereNotNull('validated_by');
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function validatedBy()
    {
        return $this->belongsTo(User::class, 'validated_by');
    }

    public function revokedBy()
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }
}

