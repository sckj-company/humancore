<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    public function up(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $manageSuperAdmins = Permission::query()->firstOrCreate(
            ['name' => 'manage_super_admins', 'guard_name' => 'web'],
            ['group_name' => 'system', 'description' => 'Criar super-admins limitados e atribuir permissões.'],
        );

        $restrictedRole = Role::query()->firstOrCreate(
            ['name' => 'super-admin-limited', 'guard_name' => 'web'],
            [
                'description' => 'Acesso global limitado às permissões atribuídas',
                'is_system' => true,
            ],
        );
        $restrictedRole->syncPermissions([]);

        $fullRole = Role::query()->where('name', 'super-admin')->where('guard_name', 'web')->first();
        $fullRole?->givePermissionTo($manageSuperAdmins);

        app()[PermissionRegistrar::class]->forgetCachedPermissions();
    }

    public function down(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();
    }
};
