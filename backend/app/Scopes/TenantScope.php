<?php

namespace App\Scopes;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $tenantId = app()->bound('currentTenant')
            ? app('currentTenant')?->id
            : null;

        if ($tenantId) {
            $builder->where($model->getTable().'.tenant_id', $tenantId);
        } elseif (! app()->runningInConsole()) {
            // Se uma requisição HTTP tentar consultar dados de tenant sem um tenant ativo no contexto,
            // bloqueia completamente o retorno para evitar vazamento ou conflito entre empresas.
            $builder->whereRaw('1 = 0');
        }
    }
}
