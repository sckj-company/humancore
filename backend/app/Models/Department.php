<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Department extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'branch_id',
        'name',
        'code',
        'parent_id',
        'level',
        'manager_id',
        'cost_center',
        'description',
        'status',
        'permission_group_id',
        'default_permissions',
        'default_role_name',
    ];

    protected static function booted(): void
    {
        static::saved(static fn () => User::clearDepartmentPermissionCache());
        static::deleted(static fn () => User::clearDepartmentPermissionCache());
    }

    protected function casts(): array
    {
        return [
            'level' => 'integer',
            'default_permissions' => 'array',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function manager()
    {
        return $this->belongsTo(Employee::class, 'manager_id');
    }

    public function permissionGroup()
    {
        return $this->belongsTo(PermissionGroup::class);
    }

    public function positions()
    {
        return $this->hasMany(Position::class);
    }

    public function employees()
    {
        return $this->belongsToMany(Employee::class, 'department_employee')->withTimestamps();
    }

    public function hasConfiguredPermissions(): bool
    {
        return $this->permission_group_id !== null
            || (is_array($this->default_permissions) && $this->default_permissions !== []);
    }

    /**
     * @return array<int, string>
     */
    public function resolvedPermissions(): array
    {
        $groupPermissions = $this->permissionGroup?->permissions ?? [];
        $customPermissions = is_array($this->default_permissions) ? $this->default_permissions : [];

        return array_values(array_unique(array_map('strval', array_merge($groupPermissions, $customPermissions))));
    }
}
