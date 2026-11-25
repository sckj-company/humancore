<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Position extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'department_id',
        'parent_id',
        'level',
        'title',
        'code',
        'description',
        'requirements',
        'salary_min',
        'salary_max',
        'is_management',
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
            'is_management' => 'boolean',
            'salary_min' => 'decimal:2',
            'salary_max' => 'decimal:2',
            'default_permissions' => 'array',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function permissionGroup()
    {
        return $this->belongsTo(PermissionGroup::class);
    }

    public function employees()
    {
        return $this->hasMany(Employee::class);
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
