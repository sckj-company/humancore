<?php

namespace App\Models;

use App\Traits\Auditable;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Contracts\Permission as PermissionContract;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Traits\HasRoles;

#[Hidden(['password', 'remember_token', 'two_factor_secret', 'two_factor_recovery_codes'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use Auditable, HasApiTokens, HasFactory, Notifiable;
    use HasRoles {
        hasPermissionTo as spatieHasPermissionTo;
    }

    /** @var array<string, array<int, string>|null> */
    protected static array $departmentPermissionsCache = [];

    public static function clearDepartmentPermissionCache(): void
    {
        static::$departmentPermissionsCache = [];
    }

    protected static function booted(): void
    {
        static::saved(static fn () => static::clearDepartmentPermissionCache());
        static::deleted(static fn () => static::clearDepartmentPermissionCache());
    }

    public const PLATFORM_ONLY_PERMISSIONS = [
        'manage_platform',
        'manage_super_admins',
        'view_any_tenant',
        'view_tenant',
        'create_tenant',
        'update_tenant',
        'delete_tenant',
        'restore_tenant',
        'force_delete_tenant',
    ];

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'name',
        'email',
        'email_verified_at',
        'password',
        'locale',
        'timezone',
        'is_active',
        'last_login_at',
        'last_login_ip',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
            'last_login_at' => 'datetime',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function tenantAccesses()
    {
        return $this->hasMany(UserTenantAccess::class);
    }

    public function isSuperAdmin(): bool
    {
        return $this->hasAnyRole(['super-admin', 'super-admin-limited']);
    }

    public function activeTenantId(): ?int
    {
        $bound = app()->bound('currentTenant') ? app('currentTenant')?->id : null;
        if ($bound) {
            return (int) $bound;
        }

        return $this->tenant_id ? (int) $this->tenant_id : null;
    }

    public function activeTenantAccess(?int $tenantId = null): ?UserTenantAccess
    {
        $resolvedTenantId = $tenantId ?? $this->activeTenantId();
        if (! $resolvedTenantId) {
            return null;
        }

        $accesses = $this->relationLoaded('tenantAccesses')
            ? $this->tenantAccesses
            : $this->tenantAccesses()->with('permissionGroup')->get();

        $access = $accesses->first(
            fn (UserTenantAccess $access) => (int) $access->tenant_id === (int) $resolvedTenantId && $access->is_active !== false
        );

        if (! $access) {
            return null;
        }

        if ($access->granted_by_tenant_id) {
            $isRelActive = TenantRelationship::query()
                ->where('manager_tenant_id', $access->granted_by_tenant_id)
                ->where('managed_tenant_id', $resolvedTenantId)
                ->where('status', 'active')
                ->exists();

            if (! $isRelActive) {
                return null;
            }
        }

        return $access;
    }

    /**
     * @return array<int, string>|null
     */
    public function activeDepartmentPermissions(?int $tenantId = null): ?array
    {
        if ($this->hasRole('super-admin') || $this->hasRole('admin')) {
            return null;
        }

        $resolvedTenantId = $tenantId ?? $this->activeTenantId();
        if (! $resolvedTenantId) {
            return null;
        }

        $requestKey = app()->bound('request') ? (string) spl_object_id(app('request')) : 'cli';
        $cacheKey = "{$requestKey}:{$this->id}:{$resolvedTenantId}";
        if (array_key_exists($cacheKey, static::$departmentPermissionsCache)) {
            return static::$departmentPermissionsCache[$cacheKey];
        }

        $employee = null;
        if ($this->employee_id) {
            $employee = Employee::withoutGlobalScopes()
                ->where('id', $this->employee_id)
                ->where('tenant_id', $resolvedTenantId)
                ->first(['id', 'tenant_id', 'department_id', 'position_id']);
        }

        if (! $employee) {
            $employee = Employee::withoutGlobalScopes()
                ->where('user_id', $this->id)
                ->where('tenant_id', $resolvedTenantId)
                ->first(['id', 'tenant_id', 'department_id', 'position_id']);
        }

        if (! $employee) {
            return static::$departmentPermissionsCache[$cacheKey] = null;
        }

        $pivotDeptIds = DB::table('department_employee')
            ->where('employee_id', $employee->id)
            ->pluck('department_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $deptIds = array_values(array_unique(array_filter(array_merge(
            $employee->department_id ? [(int) $employee->department_id] : [],
            $pivotDeptIds,
        ))));

        $combined = [];
        $hasConfigured = false;

        if ($deptIds !== []) {
            $departments = Department::withoutGlobalScopes()
                ->with('permissionGroup')
                ->where('tenant_id', $resolvedTenantId)
                ->whereIn('id', $deptIds)
                ->get();

            foreach ($departments as $department) {
                if ($department->hasConfiguredPermissions()) {
                    $hasConfigured = true;
                    $combined = array_merge($combined, $department->resolvedPermissions());
                }
            }
        }

        if ($employee->position_id) {
            $position = Position::withoutGlobalScopes()
                ->with('permissionGroup')
                ->where('tenant_id', $resolvedTenantId)
                ->find($employee->position_id);

            if ($position && $position->hasConfiguredPermissions()) {
                $hasConfigured = true;
                $combined = array_merge($combined, $position->resolvedPermissions());
            }
        }

        if (! $hasConfigured) {
            return static::$departmentPermissionsCache[$cacheKey] = null;
        }

        return static::$departmentPermissionsCache[$cacheKey] = array_values(array_unique($combined));
    }

    public function hasTenantScopedAccess(?int $tenantId = null): bool
    {
        return $this->activeTenantAccess($tenantId) !== null
            || $this->activeDepartmentPermissions($tenantId) !== null;
    }

    public function hasExplicitTenantPermissions(?int $tenantId = null): bool
    {
        $access = $this->activeTenantAccess($tenantId);

        return ($access !== null && $access->hasExplicitPermissions())
            || $this->activeDepartmentPermissions($tenantId) !== null;
    }

    /**
     * @return Collection<int, string>
     */
    public function effectivePermissions(?int $tenantId = null): Collection
    {
        if ($this->hasRole('super-admin')) {
            return Permission::query()->pluck('name');
        }

        $resolvedTenantId = $tenantId ?? $this->activeTenantId();
        $access = $this->activeTenantAccess($resolvedTenantId);
        if ($access && $access->hasExplicitPermissions()) {
            $platformPerms = $this->hasRole('super-admin-limited')
                ? $this->getAllPermissions()
                    ->pluck('name')
                    ->filter(fn (string $name) => in_array($name, self::PLATFORM_ONLY_PERMISSIONS, true))
                    ->all()
                : [];

            return collect(array_merge($access->resolvedPermissions(), $platformPerms))->unique()->values();
        }

        $deptPerms = $this->activeDepartmentPermissions($resolvedTenantId);
        if ($deptPerms !== null) {
            return collect($deptPerms)->values();
        }

        // Caso esteja a aceder a uma empresa gerida através da sua empresa gestora (sem UserTenantAccess direto)
        if ($resolvedTenantId && $this->tenant_id && (int) $this->tenant_id !== (int) $resolvedTenantId) {
            $managerAccess = $this->activeTenantAccess((int) $this->tenant_id);
            if ($managerAccess && $managerAccess->hasExplicitPermissions()) {
                return collect($managerAccess->resolvedPermissions())->values();
            }
        }

        return $this->getAllPermissions()->pluck('name')->values();
    }

    public function hasEffectivePermission(string $permission, ?int $tenantId = null): bool
    {
        if ($this->hasRole('super-admin')) {
            return true;
        }

        if (in_array($permission, self::PLATFORM_ONLY_PERMISSIONS, true)) {
            return $this->getAllPermissions()->contains('name', $permission);
        }

        $resolvedTenantId = $tenantId ?? $this->activeTenantId();
        $access = $this->activeTenantAccess($resolvedTenantId);
        if ($access && $access->hasExplicitPermissions()) {
            return in_array($permission, $access->resolvedPermissions(), true);
        }

        $deptPerms = $this->activeDepartmentPermissions($resolvedTenantId);
        if ($deptPerms !== null) {
            return in_array($permission, $deptPerms, true);
        }

        if ($resolvedTenantId && $this->tenant_id && (int) $this->tenant_id !== (int) $resolvedTenantId) {
            $managerAccess = $this->activeTenantAccess((int) $this->tenant_id);
            if ($managerAccess && $managerAccess->hasExplicitPermissions()) {
                return in_array($permission, $managerAccess->resolvedPermissions(), true);
            }
        }

        return $this->getAllPermissions()->contains('name', $permission);
    }

    public function hasPermissionTo($permission, ?string $guardName = null): bool
    {
        if (! $this->hasRole('super-admin') && $this->hasExplicitTenantPermissions()) {
            $name = match (true) {
                is_string($permission) => $permission,
                $permission instanceof \BackedEnum => (string) $permission->value,
                $permission instanceof PermissionContract => $permission->name,
                default => null,
            };

            if ($name !== null) {
                return $this->hasEffectivePermission($name);
            }
        }

        return $this->spatieHasPermissionTo($permission, $guardName);
    }

    public function hasFieldPermission(string $resource, string $field, string $mode = 'view', ?int $tenantId = null): bool
    {
        if ($this->hasRole('super-admin')) {
            return true;
        }

        $permission = "field.{$resource}.{$field}.{$mode}";

        if ($this->hasExplicitTenantPermissions($tenantId)) {
            return $this->hasEffectivePermission($permission, $tenantId);
        }

        if ($this->hasRole('admin') || $this->hasRole('hr-manager')) {
            return true;
        }

        return $this->hasEffectivePermission($permission, $tenantId);
    }

    /**
     * @return array<int, int>|null Null significa acesso a todos os departamentos da empresa ativa.
     */
    public function allowedDepartmentIds(?int $tenantId = null): ?array
    {
        if ($this->hasRole('super-admin')) {
            return null;
        }

        $access = $this->activeTenantAccess($tenantId);
        if (! $access) {
            return null;
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', $access->department_ids ?? []))));

        return $ids === [] ? null : $ids;
    }

    public function canAccessTenant(int|string|null $tenantId): bool
    {
        if ($this->hasRole('super-admin')) {
            return true;
        }

        if ($tenantId === null || $tenantId === '') {
            return false;
        }

        $targetId = (int) $tenantId;

        if ($this->hasRole('super-admin-limited')) {
            $hasConfiguredAccesses = $this->relationLoaded('tenantAccesses')
                ? $this->tenantAccesses->isNotEmpty()
                : $this->tenantAccesses()->exists();

            if (! $hasConfiguredAccesses) {
                return true;
            }

            return ($this->tenant_id !== null && (int) $this->tenant_id === $targetId)
                || $this->activeTenantAccess($targetId) !== null;
        }

        if (($this->tenant_id !== null && (int) $this->tenant_id === $targetId)
            || $this->activeTenantAccess($targetId) !== null) {
            return true;
        }

        $managedIds = app(\App\Services\SaaS\TenantHierarchyService::class)->accessibleManagedTenantIdsForUser($this);

        return in_array($targetId, $managedIds, true);
    }

    /**
     * @return Collection<int, array{id: int, name: string, slug: string, tax_id: string|null, status: string, logo_path: string|null, is_managed?: bool}>
     */
    public function accessibleTenants(?string $search = null, ?string $status = null): Collection
    {
        $searchTerm = $search !== null ? trim($search) : '';
        $query = Tenant::query()
            ->when($status && $status !== 'all', fn ($q) => $q->where('status', $status))
            ->when($searchTerm !== '', function ($q) use ($searchTerm): void {
                $q->where(function ($sub) use ($searchTerm): void {
                    $sub->where('name', 'like', "%{$searchTerm}%")
                        ->orWhere('tax_id', 'like', "%{$searchTerm}%")
                        ->orWhere('slug', 'like', "%{$searchTerm}%");
                });
            })
            ->orderBy('name');

        $columns = ['id', 'name', 'slug', 'tax_id', 'status', 'logo_path'];
        $mapTenant = static fn (Tenant $t, bool $isManaged = false): array => [
            'id' => $t->id,
            'name' => $t->name,
            'slug' => $t->slug,
            'tax_id' => $t->tax_id,
            'status' => $t->status,
            'logo_path' => $t->logo_path,
            'is_managed' => $isManaged,
        ];

        if ($this->hasRole('super-admin')) {
            return $query->get($columns)->map(fn (Tenant $t) => $mapTenant($t));
        }

        $accessTenantIds = $this->tenantAccesses()
            ->where('is_active', true)
            ->pluck('tenant_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($this->hasRole('super-admin-limited') && $accessTenantIds === []) {
            return $query->get($columns)->map(fn (Tenant $t) => $mapTenant($t));
        }

        $managedIds = app(\App\Services\SaaS\TenantHierarchyService::class)->accessibleManagedTenantIdsForUser($this);

        $ids = collect($accessTenantIds)
            ->merge($managedIds)
            ->when($this->tenant_id, fn (Collection $c) => $c->push((int) $this->tenant_id))
            ->unique()
            ->values()
            ->all();

        if ($ids === []) {
            return collect();
        }

        return $query->whereIn('id', $ids)
            ->get($columns)
            ->map(fn (Tenant $t) => $mapTenant(
                $t,
                in_array((int) $t->id, $managedIds, true) && (int) $t->id !== (int) $this->tenant_id,
            ));
    }

    public function isActive(): bool
    {
        return $this->is_active && $this->email_verified_at !== null;
    }
}
