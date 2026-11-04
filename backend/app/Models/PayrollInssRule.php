<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PayrollInssRule extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'country_code',
        'regime_code',
        'version',
        'employee_rate',
        'employer_rate',
        'max_base',
        'effective_from',
        'effective_to',
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
            'employee_rate' => 'decimal:4',
            'employer_rate' => 'decimal:4',
            'max_base' => 'decimal:2',
            'effective_from' => 'date',
            'effective_to' => 'date',
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

    /**
     * Regra válida para todo o período (start..end).
     * Permite regras definidas uma única vez para o ano/todo o período.
     */
    public function scopeEffectiveForPeriod(
        Builder $query,
        DateTimeInterface $start,
        DateTimeInterface $end,
        string $countryCode = 'AO',
        string $regimeCode = 'standard'
    ): Builder {
        return $query
            ->where('status', 'active')
            ->where('country_code', strtoupper($countryCode))
            ->where('regime_code', $regimeCode)
            ->whereDate('effective_from', '<=', $start)
            ->where(function (Builder $query) use ($end): void {
                $query->whereNull('effective_to')
                    ->orWhereDate('effective_to', '>=', $end);
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
