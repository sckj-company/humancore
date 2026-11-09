<?php

namespace App\Providers;

use App\Services\Tenant\TenantManager;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
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

        RateLimiter::for('password-reset-request', function (Request $request) {
            return Limit::perMinute(3)->by(hash('sha256', Str::lower((string) $request->input('email')).'|'.$request->ip()));
        });

        RateLimiter::for('password-reset', function (Request $request) {
            return Limit::perMinute(10)->by(hash('sha256', Str::lower((string) $request->input('email')).'|'.$request->ip()));
        });

        RateLimiter::for('api', function ($job) {
            return Limit::perMinute(120)->by($job->user()?->id ?: $job->ip());
        });
    }
}
