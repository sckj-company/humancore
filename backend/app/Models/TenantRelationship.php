<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantRelationship extends Model
{
    use Auditable;
    use HasFactory;

    protected $fillable = [
        'manager_tenant_id',
        'managed_tenant_id',
        'relationship_type',
        'status',
        'management_scope',
        'notes',
        'created_by_user_id',
        'accepted_at',
        'revoked_at',
    ];

    protected function casts(): array
    {
        return [
            'management_scope' => 'array',
            'accepted_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    public function managerTenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'manager_tenant_id');
    }

    public function managedTenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'managed_tenant_id');
    }

    public function createdByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
