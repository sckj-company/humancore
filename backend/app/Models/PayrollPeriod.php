<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PayrollPeriod extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'period_type',
        'period_start',
        'period_end',
        'payment_date',
        'status',
        'processed_by',
        'processed_at',
        'closed_at',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'payment_date' => 'date',
            'processed_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function processedBy()
    {
        return $this->belongsTo(User::class, 'processed_by');
    }

    public function records()
    {
        return $this->hasMany(PayrollRecord::class);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['open', 'processing']);
    }

    public function isClosed(): bool
    {
        return in_array($this->status, ['closed', 'cancelled']);
    }
}
