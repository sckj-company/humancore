<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class DepartmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'branch_id' => $this->branch_id,
            'name' => $this->name,
            'code' => $this->code,
            'parent_id' => $this->parent_id,
            'level' => (int) ($this->level ?? 1),
            'manager_id' => $this->manager_id,
            'cost_center' => $this->cost_center,
            'description' => $this->description,
            'status' => $this->status,
            'permission_group_id' => $this->permission_group_id,
            'permission_group_name' => $this->whenLoaded('permissionGroup', fn () => $this->permissionGroup?->name),
            'default_permissions' => $this->default_permissions ?? [],
            'default_role_name' => $this->default_role_name,
            'effective_permissions_count' => count($this->resolvedPermissions()),
            'employee_count' => $this->whenCounted('employees'),
            'branch' => $this->whenLoaded('branch', fn () => $this->branch ? [
                'id' => $this->branch->id,
                'name' => $this->branch->name,
            ] : null),
            'parent' => $this->whenLoaded('parent', fn () => $this->parent ? [
                'id' => $this->parent->id,
                'name' => $this->parent->name,
                'level' => (int) ($this->parent->level ?? 1),
            ] : null),
            'children' => self::collection($this->whenLoaded('children')),
            'manager' => $this->whenLoaded('manager', fn () => $this->manager ? [
                'id' => $this->manager->id,
                'full_name' => $this->manager->full_name,
            ] : null),
        ];
    }
}
