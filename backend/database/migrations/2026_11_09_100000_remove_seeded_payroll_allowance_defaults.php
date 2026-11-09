<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('salary_components')
            ->whereIn('code', ['meal_allowance', 'meal_subsidy', 'transport_allowance'])
            ->whereIn('default_value', [5000, 30000])
            ->update([
                'default_value' => 0,
                'is_mandatory' => false,
            ]);

        DB::table('settings')
            ->where('group', 'payroll')
            ->whereIn('key', [
                'subsidies.meal.daily',
                'subsidies.transport.monthly',
                'inss.employer_rate',
                'discounts.lateness_free_occurrences_per_week',
            ])
            ->get(['id', 'key', 'value'])
            ->each(function (object $setting): void {
                $value = (float) json_decode($setting->value, true);
                $replacement = match ($setting->key) {
                    'subsidies.meal.daily' => $value === 5000.0 ? 0 : null,
                    'subsidies.transport.monthly' => $value === 30000.0 ? 0 : null,
                    'inss.employer_rate' => $value === 5.5 ? 8 : null,
                    'discounts.lateness_free_occurrences_per_week' => $value === 1.0 ? 0 : null,
                    default => null,
                };

                if ($replacement !== null) {
                    DB::table('settings')
                        ->where('id', $setting->id)
                        ->update(['value' => json_encode($replacement)]);
                }
            });

        DB::table('tenants')
            ->get(['id', 'config'])
            ->each(function (object $tenant): void {
                $config = json_decode($tenant->config ?? 'null', true);
                if (! is_array($config) || ! is_array($config['payroll'] ?? null)) {
                    return;
                }

                $changed = false;
                if (($config['payroll']['meal_allowance'] ?? null) === 5000) {
                    $config['payroll']['meal_allowance'] = 0;
                    $changed = true;
                }
                if (($config['payroll']['inss_rate'] ?? null) === 7.5) {
                    $config['payroll']['inss_rate'] = 3.0;
                    $changed = true;
                }

                if ($changed) {
                    DB::table('tenants')
                        ->where('id', $tenant->id)
                        ->update(['config' => json_encode($config)]);
                }
            });
    }

    public function down(): void
    {
        // Existing tenant-configured allowance values cannot be reliably distinguished from seeded defaults.
    }
};
