<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class UserTenantAccess extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'tenant_id',
        'granted_by_tenant_id',
        'permission_group_id',
        'role_name',
        'permissions',
        'department_ids',
        'is_active',
        'is_exception',
    ];

    protected function casts(): array
    {
        return [
            'permissions' => 'array',
            'department_ids' => 'array',
            'is_active' => 'boolean',
            'is_exception' => 'boolean',
        ];
    }

    public function grantedByTenant()
    {
        return $this->belongsTo(Tenant::class, 'granted_by_tenant_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function permissionGroup()
    {
        return $this->belongsTo(PermissionGroup::class);
    }

    public function hasExplicitPermissions(): bool
    {
        return $this->permission_group_id !== null
            || (is_array($this->permissions) && ($this->permissions !== [] || (bool) $this->is_exception));
    }

    /**
     * @return array<int, string>
     */
    public function resolvedPermissions(): array
    {
        $groupPermissions = $this->permissionGroup?->permissions ?? [];
        $customPermissions = $this->permissions;

        if ($customPermissions === null) {
            return array_values(array_unique(array_map('strval', $groupPermissions)));
        }

        return array_values(array_unique(array_map('strval', array_merge($groupPermissions, $customPermissions))));
    }
}
