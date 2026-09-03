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
                'inss.employee_rate' => 3.0,
                'inss.employer_rate' => 5.5,
                'irt.enabled' => true,
                'irt.brackets' => [
                    ['min' => 0, 'max' => 100000, 'rate' => 0],
                    ['min' => 100000, 'max' => 200000, 'rate' => 7],
                    ['min' => 200000, 'max' => 500000, 'rate' => 11],
                    ['min' => 500000, 'max' => 1000000, 'rate' => 15],
                    ['min' => 1000000, 'rate' => 19],
                ],
                'subsidies.meal.daily' => 5000,
                'subsidies.transport.monthly' => 30000,
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
