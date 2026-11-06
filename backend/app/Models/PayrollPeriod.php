<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

class PayrollPeriod extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    /**
     * Transições válidas de estado do período de folha salarial.
     *
     * Compatível com o estado legado (open/processing/completed) e o fluxo
     * completo da Fase 3 (pending_validation → pending_approval → approved).
     */
    public const TRANSITIONS = [
        'open' => ['processing', 'pending_approval', 'pending_validation', 'cancelled'],
        'processing' => ['completed', 'pending_validation', 'failed', 'open'],
        'completed' => ['pending_approval', 'pending_validation', 'approved', 'processing', 'open', 'closed'],
        'pending_validation' => ['pending_approval', 'processing', 'failed', 'completed'],
        'pending_approval' => ['approved', 'pending_validation', 'completed'],
        'approved' => ['closed', 'paid'],
        'closed' => ['paid', 'open'],
        'paid' => [],
        'failed' => ['processing', 'open'],
        'cancelled' => [],
    ];

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
        'approved_by',
        'approved_at',
        'closed_at',
        'rejection_reason',
        'totals_snapshot',
        'notes',
        'progress_total',
        'progress_done',
        'progress_message',
    ];

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'payment_date' => 'date',
            'processed_at' => 'datetime',
            'approved_at' => 'datetime',
            'closed_at' => 'datetime',
            'totals_snapshot' => 'array',
            'progress_total' => 'integer',
            'progress_done' => 'integer',
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

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function records()
    {
        return $this->hasMany(PayrollRecord::class);
    }

    public function displayName(): string
    {
        if ($this->period_type === 'monthly' && $this->period_start !== null) {
            return $this->period_start->locale('pt_BR')->translatedFormat('F/Y');
        }

        return $this->name;
    }

    public function events()
    {
        return $this->hasMany(PayrollPeriodEvent::class)->orderByDesc('created_at');
    }

    public function recordEvent(string $type, ?int $actorId = null, ?string $notes = null, ?array $metadata = null): PayrollPeriodEvent
    {
        return $this->events()->create([
            'tenant_id' => $this->tenant_id,
            'event_type' => $type,
            'actor_id' => $actorId ?? auth()->id(),
            'notes' => $notes,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }

    public function transitionTo(string $status, ?string $reason = null): void
    {
        if ($this->status === $status) {
            return;
        }

        $allowed = self::TRANSITIONS[$this->status] ?? [];
        if (! in_array($status, $allowed, true)) {
            throw new InvalidArgumentException("Transição inválida: {$this->status} → {$status}");
        }

        $this->update(['status' => $status]);
    }

    public function canTransitionTo(string $status): bool
    {
        return in_array($status, self::TRANSITIONS[$this->status] ?? [], true);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', ['open', 'processing']);
    }

    public function isClosed(): bool
    {
        return in_array($this->status, ['closed', 'cancelled', 'paid'], true);
    }

    public function isApprovable(): bool
    {
        return in_array($this->status, ['completed', 'pending_approval'], true);
    }

    public function isProcessable(): bool
    {
        return in_array($this->status, ['open', 'failed', 'processing', 'completed', 'pending_validation'], true)
            && ! $this->isClosed();
    }
}
