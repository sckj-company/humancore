<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('humancore:deactivate-expired-contracts')->dailyAt('00:05');
Schedule::command('attendance:mark-biometric-absences')->dailyAt('23:50');
Schedule::command('saas:process-subscriptions')->dailyAt('01:00');
