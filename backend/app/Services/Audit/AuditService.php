<?php

namespace App\Services\Audit;

use App\Models\Audit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

class AuditService
{
    public static function record(string $event, ?Model $model = null, ?array $payload = null): void
    {
        $tenantId = $model?->tenant_id
            ?? (app()->bound('currentTenant') ? app('currentTenant')?->id : null);

        $audit = Audit::query()->withoutGlobalScopes()->create([
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

        Log::channel('audit')->info('audit.business_event', [
            'audit_id' => $audit->id,
            'event' => $event,
            'user_id' => $audit->user_id,
            'tenant_id' => $audit->tenant_id,
            'auditable_type' => $audit->auditable_type,
            'auditable_id' => $audit->auditable_id,
        ]);
    }
}