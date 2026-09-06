<?php

namespace App\Services\Audit;

use App\Models\Audit;
use Illuminate\Database\Eloquent\Model;

class AuditService
{
    public static function record(string $event, ?Model $model = null, ?array $payload = null): void
    {
        $tenantId = $model?->tenant_id
            ?? (app()->bound('currentTenant') ? app('currentTenant')?->id : null);

        Audit::query()->withoutGlobalScopes()->create([
            'user_id' => auth()->id(),
            'tenant_id' => $tenantId,
            'event' => $event,
            'auditable_type' => $model ? $model->getMorphClass() : null,
            'auditable_id' => $model?->getKey(),
            'old_values' => null,
            'new_values' => $payload,
            'ip_address' => request()->ip(),
            'user_agent' => substr((string) request()->userAgent(), 0, 1000),
        ]);
    }
}