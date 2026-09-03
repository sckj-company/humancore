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
        $tenant = null;

        if ($this->tenant_id) {
            $tenant = Tenant::query()->find($this->tenant_id);
        }

        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'locale' => $this->locale,
            'timezone' => $this->timezone,
            'is_active' => $this->is_active,
            'tenant_id' => $this->tenant_id,
            'tenant' => $tenant ? [
                'id' => $tenant->id,
                'name' => $tenant->name,
                'slug' => $tenant->slug,
                'currency' => $tenant->currency,
                'locale' => $tenant->locale,
                'timezone' => $tenant->timezone,
                'logo_path' => $tenant->logo_path,
            ] : null,
            'employee_id' => $this->employee_id,
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
                'photo_path' => $this->employee->photo_path,
                'position' => $this->employee->position?->title,
                'department' => $this->employee->department?->name,
            ]),
            'roles' => $this->getRoleNames(),
            'permissions' => $this->getAllPermissions()->pluck('name'),
        ];
    }
}
