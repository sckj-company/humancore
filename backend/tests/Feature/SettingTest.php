<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SettingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    protected function setupAdmin(): array
    {
        $tenant = Tenant::factory()->create();
        app(TenantManager::class)->set($tenant);

        $user = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $user->assignRole('admin');

        return [$tenant, $user];
    }

    public function test_admin_can_bulk_update_settings(): void
    {
        [$tenant, $user] = $this->setupAdmin();

        $this->actingAs($user, 'sanctum');

        $this->putJson('/api/v1/settings/bulk', [
            'group' => 'hr',
            'values' => [
                'late_grace_minutes' => 15,
                'work_start_time' => '08:30',
            ],
        ])->assertOk()->assertJson(['success' => true]);

        $grace = Setting::where('tenant_id', $tenant->id)->where('group', 'hr')->where('key', 'late_grace_minutes')->first();
        $this->assertSame(15, $grace->value);

        $start = Setting::where('tenant_id', $tenant->id)->where('group', 'hr')->where('key', 'work_start_time')->first();
        $this->assertSame('08:30', $start->value);
    }

    public function test_employee_cannot_update_settings(): void
    {
        [$tenant, $user] = $this->setupAdmin();

        $employee = User::factory()->create([
            'tenant_id' => $tenant->id,
            'password' => Hash::make('password'),
            'email_verified_at' => now(),
            'is_active' => true,
        ]);
        $employee->assignRole('employee');

        $this->actingAs($employee, 'sanctum');

        $this->putJson('/api/v1/settings/bulk', [
            'group' => 'hr',
            'values' => ['late_grace_minutes' => 15],
        ])->assertForbidden();
    }

    public function test_settings_are_scoped_to_tenant(): void
    {
        [$tenant, $user] = $this->setupAdmin();
        $other = Tenant::factory()->create();

        Setting::updateOrCreate(
            ['tenant_id' => $tenant->id, 'group' => 'hr', 'key' => 'late_grace_minutes'],
            ['value' => 10]
        );
        Setting::updateOrCreate(
            ['tenant_id' => $other->id, 'group' => 'hr', 'key' => 'late_grace_minutes'],
            ['value' => 99]
        );

        $this->actingAs($user, 'sanctum');

        $response = $this->getJson('/api/v1/settings?group=hr')->assertOk();

        $items = collect($response->json('data.hr'));
        $this->assertTrue(
            $items->contains(fn ($s) => $s['key'] === 'late_grace_minutes' && (int) $s['value'] === 10)
        );
        $this->assertFalse(
            $items->contains(fn ($s) => $s['key'] === 'late_grace_minutes' && (int) $s['value'] === 99)
        );
    }
}
