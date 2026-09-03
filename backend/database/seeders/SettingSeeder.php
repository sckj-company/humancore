<?php

namespace Database\Seeders;

use App\Models\Setting;
use App\Models\Tenant;
use Illuminate\Database\Seeder;

class SettingSeeder extends Seeder
{
    public function run(): void
    {
        $tenants = Tenant::all();

        $defaults = [
            'company' => [
                'branding' => ['primary_color' => '#2563eb', 'logo_url' => null],
            ],
            'hr' => [
                'workweek' => ['mon', 'tue', 'wed', 'thu', 'fri'],
                'daily_hours' => 8,
                'late_grace_minutes' => 10,
                'overtime_enabled' => true,
                'overtime_rate_normal' => 1.5,
                'overtime_rate_holiday' => 2.0,
            ],
            'leave' => [
                'vacation_days_per_year' => 22,
                'requires_approval' => true,
                'allow_negative_balance' => false,
            ],
            'payroll' => [
                'inss_rate' => 7.5,
                'irt_enabled' => true,
                'irt_tables' => [],
                'payment_date' => 5,
            ],
            'communication' => [
                'email_enabled' => true,
                'sender_name' => null,
                'sender_email' => null,
            ],
        ];

        foreach ($tenants as $tenant) {
            foreach ($defaults as $group => $values) {
                foreach ($values as $key => $value) {
                    Setting::updateOrCreate(
                        ['tenant_id' => $tenant->id, 'group' => $group, 'key' => $key],
                        ['value' => $value, 'type' => is_bool($value) ? 'boolean' : (is_array($value) ? 'json' : 'string')],
                    );
                }
            }
        }
    }
}
