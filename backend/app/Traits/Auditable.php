<?php

namespace App\Traits;

use App\Models\Audit;
use Illuminate\Support\Facades\Log;

trait Auditable
{
    protected static function bootAuditable(): void
    {
        $events = ['created', 'updated', 'deleted', 'restored'];

        foreach ($events as $event) {
            if (method_exists(static::class, $event)) {
                static::{$event}(function ($model) use ($event) {
                    $model->recordAudit($event);
                });
            } else {
                static::registerAuditEvent($event);
            }
        }
    }

    protected static function registerAuditEvent(string $event): void
    {
        $dispatcher = static::getEventDispatcher();

        $dispatcher->listen("eloquent.{$event}: ".static::class, function ($model) use ($event) {
            $model->recordAudit($event);
        });
    }

    protected function recordAudit(string $event): void
    {
        $old = $this->getAuditSnapshot('old');
        $new = $this->getAuditSnapshot('new');

        if ($event === 'created') {
            $old = null;
        }

        if ($event === 'deleted') {
            $new = null;
        }

        $tenantId = $this->tenant_id
            ?? (app()->bound('currentTenant') ? app('currentTenant')?->id : null);
        $actingTenantId = auth()->check() ? auth()->user()?->tenant_id : null;
        $employeeId = $this->resolveAuditEmployeeId($old, $new);

        $audit = Audit::query()->withoutGlobalScopes()->create([
            'user_id' => auth()->id(),
            'tenant_id' => $tenantId,
            'acting_tenant_id' => ($actingTenantId && $tenantId && (int) $actingTenantId !== (int) $tenantId) ? $actingTenantId : null,
            'employee_id' => $employeeId,
            'event' => $event,
            'auditable_type' => $this->getMorphClass(),
            'auditable_id' => $this->getKey(),
            'old_values' => $old,
            'new_values' => $new,
            'ip_address' => request()->ip(),
            'user_agent' => substr((string) request()->userAgent(), 0, 1000),
        ]);

        Log::channel('audit')->info('audit.model_event', [
            'audit_id' => $audit->id,
            'event' => $event,
            'user_id' => $audit->user_id,
            'tenant_id' => $audit->tenant_id,
            'auditable_type' => $audit->auditable_type,
            'auditable_id' => $audit->auditable_id,
        ]);
    }

    protected function getAuditSnapshot(string $side): ?array
    {
        $dirty = $this->getDirty();

        if ($side === 'old') {
            $data = $this->getOriginal();
        } else {
            $data = array_merge($this->getOriginal(), $dirty);
        }

        $hidden = $this->getHidden();

        $data = collect($data)
            ->except($hidden)
            ->filter(fn ($value) => ! is_object($value) || $value instanceof \DateTimeInterface)
            ->map(fn ($value) => $value instanceof \DateTimeInterface
                ? $value->format('Y-m-d H:i:s')
                : $value)
            ->all();

        return $data === [] ? null : $data;
    }

    protected function resolveAuditEmployeeId(?array $old, ?array $new): ?int
    {
        if ($this instanceof \App\Models\Employee) {
            $id = $this->getKey();

            return $id ? (int) $id : null;
        }

        $candidate = $this->getAttribute('employee_id')
            ?? ($new['employee_id'] ?? null)
            ?? ($old['employee_id'] ?? null);

        if ($candidate) {
            return (int) $candidate;
        }

        if ($this instanceof \App\Models\PayrollRecordItem) {
            $record = $this->relationLoaded('payrollRecord')
                ? $this->payrollRecord
                : \App\Models\PayrollRecord::query()->withoutGlobalScopes()->select(['id', 'employee_id'])->find($this->payroll_record_id);

            if ($record && $record->employee_id) {
                return (int) $record->employee_id;
            }
        }

        return null;
    }
}
