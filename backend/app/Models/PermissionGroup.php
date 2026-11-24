<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PermissionGroup extends Model
{
    use HasFactory;

    protected static function booted(): void
    {
        static::saved(static fn () => User::clearDepartmentPermissionCache());
        static::deleted(static fn () => User::clearDepartmentPermissionCache());
    }

    protected $fillable = [
        'tenant_id',
        'name',
        'description',
        'permissions',
        'is_system',
        'created_by',
    ];

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    protected function casts(): array
    {
        return [
            'permissions' => 'array',
            'is_system' => 'boolean',
        ];
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function userTenantAccesses()
    {
        return $this->hasMany(UserTenantAccess::class);
    }
}
