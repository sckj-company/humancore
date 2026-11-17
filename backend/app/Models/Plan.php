<?php

namespace App\Models;

use App\Support\PlanCatalog;
use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Plan extends Model
{
    use Auditable;
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'name',
        'slug',
        'code',
        'description',
        'badge_text',
        'visibility',
        'is_active',
        'sort_order',
        'billing_cycle',
        'custom_cycle_days',
        'currency',
        'base_price',
        'pricing_model',
        'included_employees',
        'extra_employee_price',
        'included_managed_tenants',
        'extra_managed_tenant_price',
        'setup_fee',
        'trial_days',
        'grace_period_days',
        'features',
        'limits',
        'agency_config',
        'custom_rules',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
            'custom_cycle_days' => 'integer',
            'base_price' => 'decimal:2',
            'included_employees' => 'integer',
            'extra_employee_price' => 'decimal:2',
            'included_managed_tenants' => 'integer',
            'extra_managed_tenant_price' => 'decimal:2',
            'setup_fee' => 'decimal:2',
            'trial_days' => 'integer',
            'grace_period_days' => 'integer',
            'features' => 'array',
            'limits' => 'array',
            'agency_config' => 'array',
            'custom_rules' => 'array',
        ];
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(TenantSubscription::class);
    }

    public function activeSubscriptions(): HasMany
    {
        return $this->hasMany(TenantSubscription::class)->whereIn('status', ['active', 'grace_period', 'past_due']);
    }

    /**
     * @return array<string, bool>
     */
    public function resolvedFeatures(): array
    {
        return array_merge(PlanCatalog::defaultFeatures(), $this->features ?? []);
    }

    /**
     * @return array<string, mixed>
     */
    public function resolvedLimits(): array
    {
        return array_merge(PlanCatalog::defaultLimits(), $this->limits ?? []);
    }

    /**
     * @return array<string, mixed>
     */
    public function resolvedAgencyConfig(): array
    {
        return array_merge(PlanCatalog::defaultAgencyConfig(), $this->agency_config ?? []);
    }
}
