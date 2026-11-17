<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Tenant extends Model
{
    use Auditable;
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'name',
        'slug',
        'email',
        'phone',
        'tax_id',           // NIF angolano (10 dígitos numéricos)
        'inss_number',      // Nº INSS
        'legal_entity_type',// lda, sa, unipessoal, em, cooperativa, epe, ong
        'economic_sector',  // Sector de actividade económica
        'logo_path',
        'address',
        'city',
        'province',         // Província angolana
        'country',
        'postal_code',
        'website',
        'currency',
        'locale',
        'timezone',
        'date_format',
        'fiscal_year_start',
        'status',
        'created_by_tenant_id',
        'origin_type',
        'billing_email',
        'config',
        'branding',
    ];

    protected function casts(): array
    {
        return [
            'fiscal_year_start' => 'date',
            'config' => 'array',
            'branding' => 'array',
        ];
    }

    public function createdByTenant()
    {
        return $this->belongsTo(Tenant::class, 'created_by_tenant_id');
    }

    public function subscriptions()
    {
        return $this->hasMany(TenantSubscription::class)->latest('id');
    }

    public function activeSubscription()
    {
        return $this->hasOne(TenantSubscription::class)
            ->whereIn('status', TenantSubscription::ACTIVE_STATUSES)
            ->latest('id');
    }

    public function latestSubscription()
    {
        return $this->hasOne(TenantSubscription::class)->latestOfMany();
    }

    public function managedRelationships()
    {
        return $this->hasMany(TenantRelationship::class, 'manager_tenant_id');
    }

    public function activeManagedRelationships()
    {
        return $this->hasMany(TenantRelationship::class, 'manager_tenant_id')
            ->where('status', 'active');
    }

    public function managerRelationships()
    {
        return $this->hasMany(TenantRelationship::class, 'managed_tenant_id');
    }

    public function activeManagerRelationship()
    {
        return $this->hasOne(TenantRelationship::class, 'managed_tenant_id')
            ->where('status', 'active')
            ->latestOfMany();
    }

    public function managedTenants()
    {
        return $this->belongsToMany(Tenant::class, 'tenant_relationships', 'manager_tenant_id', 'managed_tenant_id')
            ->withPivot(['id', 'relationship_type', 'status', 'management_scope', 'accepted_at', 'revoked_at'])
            ->withTimestamps();
    }

    public function invoices()
    {
        return $this->hasMany(SubscriptionInvoice::class);
    }

    public function payments()
    {
        return $this->hasMany(SubscriptionPayment::class);
    }

    public function branches()
    {
        return $this->hasMany(Branch::class);
    }

    public function departments()
    {
        return $this->hasMany(Department::class);
    }

    public function positions()
    {
        return $this->hasMany(Position::class);
    }

    public function employees()
    {
        return $this->hasMany(Employee::class);
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function settings()
    {
        return $this->hasMany(Setting::class);
    }

    public function getSetting(string $key, mixed $default = null): mixed
    {
        $setting = $this->settings()
            ->where('key', $key)
            ->first();

        return $setting?->value ?? $default;
    }
}
