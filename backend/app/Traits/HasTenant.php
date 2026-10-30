<?php

namespace App\Traits;

use App\Scopes\TenantScope;
use Illuminate\Database\Eloquent\Builder;

trait HasTenant
{
    protected static function bootHasTenant(): void
    {
        static::addGlobalScope(new TenantScope);

        static::creating(function ($model) {
            if (empty($model->tenant_id)) {
                if (app()->bound('currentTenant') && app('currentTenant')?->id) {
                    $model->tenant_id = app('currentTenant')->id;
                } elseif (! app()->runningInConsole()) {
                    throw new \RuntimeException(
                        'Segurança Multitenant: Não é possível registar ['.class_basename($model).'] sem um tenant ativo.'
                    );
                }
            } elseif (app()->bound('currentTenant') && app('currentTenant')?->id) {
                // Em requisições HTTP, impede qualquer tentativa de forjar tenant_id de outra empresa
                if (! app()->runningInConsole() && (int) $model->tenant_id !== (int) app('currentTenant')->id) {
                    $model->tenant_id = app('currentTenant')->id;
                }
            }
        });

        static::updating(function ($model) {
            if (app()->bound('currentTenant') && app('currentTenant')?->id && ! app()->runningInConsole()) {
                if ($model->isDirty('tenant_id') && (int) $model->tenant_id !== (int) app('currentTenant')->id) {
                    $model->tenant_id = app('currentTenant')->id;
                }
            }
        });
    }

    public function scopeForTenant(Builder $query, int $tenantId): Builder
    {
        return $query->withoutGlobalScope(TenantScope::class)
            ->where($this->getTable().'.tenant_id', $tenantId);
    }
}
