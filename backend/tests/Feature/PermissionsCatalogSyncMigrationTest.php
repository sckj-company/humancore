<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\FieldPermissions;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\SettingSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;
use Tests\TestCase;

class PermissionsCatalogSyncMigrationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(PermissionSeeder::class);
        $this->seed(SettingSeeder::class);
    }

    public function test_migration_restores_missing_field_and_portfolio_permissions_idempotently(): void
    {
        $superAdmin = User::factory()->create(['is_active' => true]);
        $superAdmin->assignRole('super-admin');

        // Simulate legacy VPS database before field.* and manage_portfolio were seeded
        Permission::query()->where('name', 'like', 'field.%')->delete();
        Permission::query()->where('name', 'manage_portfolio')->delete();
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $beforePlatform = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/platform-users')
            ->assertOk()
            ->json('data.permissions');

        $this->assertCount(0, array_filter($beforePlatform, fn (array $p) => str_starts_with($p['name'], 'field.')));
        $this->assertFalse(collect($beforePlatform)->contains('name', 'manage_portfolio'));

        $migration = require database_path('migrations/2026_11_24_140000_sync_field_and_portfolio_permissions.php');
        $migration->up();
        // Run a second time to verify idempotency
        $migration->up();

        $expectedFieldNames = FieldPermissions::allNames();
        $expectedFieldCount = count($expectedFieldNames);

        $afterPlatform = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/platform-users')
            ->assertOk()
            ->json('data.permissions');

        $platformFieldPerms = array_values(array_filter(
            $afterPlatform,
            fn (array $p) => str_starts_with($p['name'], 'field.'),
        ));
        $this->assertCount($expectedFieldCount, $platformFieldPerms);
        $this->assertTrue(collect($afterPlatform)->contains('name', 'manage_portfolio'));

        $afterTenantPerms = $this->actingAs($superAdmin, 'sanctum')
            ->getJson('/api/v1/superadmin/tenant-permissions')
            ->assertOk()
            ->json('data.permissions');

        $tenantFieldPerms = array_values(array_filter(
            $afterTenantPerms,
            fn (array $p) => str_starts_with($p['name'], 'field.'),
        ));
        $this->assertCount($expectedFieldCount, $tenantFieldPerms);
        $this->assertTrue(collect($afterTenantPerms)->contains('name', 'manage_portfolio'));

        $superAdminRole = Role::findByName('super-admin', 'web');
        $adminRole = Role::findByName('admin', 'web');
        $hrManagerRole = Role::findByName('hr-manager', 'web');
        $managerRole = Role::findByName('manager', 'web');
        $employeeRole = Role::findByName('employee', 'web');
        $limitedRole = Role::findByName('super-admin-limited', 'web');

        $this->assertTrue($superAdminRole->hasPermissionTo('manage_portfolio'));
        $this->assertTrue($adminRole->hasPermissionTo('manage_portfolio'));
        $this->assertFalse($adminRole->hasPermissionTo('manage_platform'));
        $this->assertSame(0, $limitedRole->permissions()->count());

        foreach ($expectedFieldNames as $fieldPerm) {
            $this->assertTrue($superAdminRole->hasPermissionTo($fieldPerm), "super-admin missing {$fieldPerm}");
            $this->assertTrue($adminRole->hasPermissionTo($fieldPerm), "admin missing {$fieldPerm}");
            $this->assertTrue($hrManagerRole->hasPermissionTo($fieldPerm), "hr-manager missing {$fieldPerm}");
        }

        foreach (FieldPermissions::managerDefaults() as $fieldPerm) {
            $this->assertTrue($managerRole->hasPermissionTo($fieldPerm), "manager missing {$fieldPerm}");
        }

        foreach (FieldPermissions::employeeDefaults() as $fieldPerm) {
            $this->assertTrue($employeeRole->hasPermissionTo($fieldPerm), "employee missing {$fieldPerm}");
        }
    }
}
