<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PositionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'department_id' => $this->department_id,
            'parent_id' => $this->parent_id,
            'level' => (int) ($this->level ?? 1),
            'title' => $this->title,
            'code' => $this->code,
            'description' => $this->description,
            'requirements' => $this->requirements,
            'salary_min' => $this->salary_min,
            'salary_max' => $this->salary_max,
            'is_management' => $this->is_management,
            'permission_group_id' => $this->permission_group_id,
            'permission_group_name' => $this->whenLoaded('permissionGroup', fn () => $this->permissionGroup?->name),
            'default_permissions' => $this->default_permissions ?? [],
            'default_role_name' => $this->default_role_name,
            'effective_permissions_count' => count($this->resolvedPermissions()),
            'employee_count' => $this->whenCounted('employees'),
            'department' => $this->whenLoaded('department', fn () => $this->department ? [
                'id' => $this->department->id,
                'name' => $this->department->name,
            ] : null),
            'parent' => $this->whenLoaded('parent', fn () => $this->parent ? [
                'id' => $this->parent->id,
                'title' => $this->parent->title,
                'level' => (int) ($this->parent->level ?? 1),
            ] : null),
        ];
    }
}
