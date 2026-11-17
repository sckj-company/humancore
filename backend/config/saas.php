<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Exigir Subscrição Ativa
    |--------------------------------------------------------------------------
    | Quando true, empresas sem subscrição configurada são bloqueadas nas
    | rotas operacionais (exceto gestão de plano/faturação e SuperAdmin).
    | Em testes automatizados legados, pode ser false salvo se houver
    | subscrição atribuída ou override explícito em config().
    */
    'require_subscription' => env('SAAS_REQUIRE_SUBSCRIPTION', env('APP_ENV') !== 'testing'),

    /*
    |--------------------------------------------------------------------------
    | Duração padrão de convites de utilizador (horas)
    |--------------------------------------------------------------------------
    */
    'invitation_ttl_hours' => (int) env('SAAS_INVITATION_TTL_HOURS', 72),

    /*
    |--------------------------------------------------------------------------
    | Cache de entitlements por tenant (segundos)
    |--------------------------------------------------------------------------
    */
    'entitlement_cache_ttl' => (int) env('SAAS_ENTITLEMENT_CACHE_TTL', 300),
];
