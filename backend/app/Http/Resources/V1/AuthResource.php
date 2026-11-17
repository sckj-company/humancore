<?php

namespace App\Http\Resources\V1;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuthResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var User $this */
        $activeTenantId = $this->activeTenantId();
        $tenant = null;

        if ($activeTenantId) {
            $tenant = Tenant::query()->find($activeTenantId);
        }

        $activeAccess = $this->activeTenantAccess($activeTenantId);
        $accessibleTenants = $this->accessibleTenants();
        $roles = $activeAccess?->role_name
            ? collect([$activeAccess->role_name])
            : $this->getRoleNames();

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'locale' => $this->locale,
            'timezone' => $this->timezone,
            'is_active' => $this->is_active,
            'tenant_id' => $activeTenantId ?? $this->tenant_id,
            'tenant' => $tenant ? [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'currency' => $tenant->currency,
                'locale' => $tenant->locale,
                'timezone' => $tenant->timezone,
                'logo_path' => $tenant->logo_path,
            ] : null,
            'accessible_tenants' => $accessibleTenants->values(),
            'active_department_ids' => $this->allowedDepartmentIds($activeTenantId),
            'active_permission_group_id' => $activeAccess?->permission_group_id,
            'employee_id' => $this->employee_id,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
                'photo_path' => $this->employee->photo_path,
                'position' => $this->employee->position?->title,
                'department' => $this->employee->department?->name,
            ]),
            'roles' => $roles->values(),
            'permissions' => $this->effectivePermissions($activeTenantId)->values(),
        ];
    }
}
