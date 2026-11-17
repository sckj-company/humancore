<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TenantSubscription extends Model
{
    use Auditable;
    use HasFactory;

    public const ACTIVE_STATUSES = ['active', 'grace_period', 'past_due'];

    protected $fillable = [
        'tenant_id',
        'plan_id',
        'status',
        'starts_at',
        'ends_at',
        'grace_until',
        'cancelled_at',
        'auto_renew',
        'custom_price',
        'billing_cycle_override',
        'overrides',
        'notes',
        'assigned_by',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'grace_until' => 'datetime',
            'cancelled_at' => 'datetime',
            'auto_renew' => 'boolean',
            'custom_price' => 'decimal:2',
            'overrides' => 'array',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function plan(): BelongsTo
    {
        return $this->belongsTo(Plan::class);
    }

    public function assignedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(SubscriptionInvoice::class, 'subscription_id');
    }

    public function isOperational(): bool
    {
        if (! in_array($this->status, self::ACTIVE_STATUSES, true)) {
            return false;
        }

        if ($this->status === 'grace_period' && $this->grace_until && $this->grace_until->isPast()) {
            return false;
        }

        return true;
    }

    public function effectiveBillingCycle(): string
    {
        return $this->billing_cycle_override ?: ($this->plan?->billing_cycle ?? 'monthly');
    }

    public function effectiveBasePrice(): float
    {
        if ($this->custom_price !== null) {
            return (float) $this->custom_price;
        }

        return (float) ($this->plan?->base_price ?? 0);
    }
}
