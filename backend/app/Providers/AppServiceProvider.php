<?php

namespace App\Providers;

use App\Services\Tenant\TenantManager;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(TenantManager::class);
        $this->app->alias(TenantManager::class, 'tenant.manager');
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function ($job) {
            return Limit::perMinute(10)->by($job->ip());
        });

        RateLimiter::for('api', function ($job) {
            return Limit::perMinute(120)->by($job->user()?->id ?: $job->ip());
        });
    }
}
