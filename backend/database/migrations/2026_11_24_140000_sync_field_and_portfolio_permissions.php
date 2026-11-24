<?php

use App\Support\FieldPermissions;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('roles')) {
            return;
        }

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $resources = [
            'tenant', 'user', 'employee', 'department', 'position', 'branch',
            'contract', 'attendance', 'leave', 'payroll', 'payslip',
            'salary-component', 'benefit', 'deduction', 'recruitment',
            'document', 'performance', 'training', 'report', 'setting', 'audit',
            'email-template',
        ];

        $actions = [
            'view_any', 'view', 'create', 'update', 'delete', 'restore',
            'force_delete', 'approve', 'reject', 'process', 'close', 'export', 'print', 'configure',
        ];

        $catalog = [];

        foreach ($resources as $resource) {
            foreach ($actions as $action) {
                $catalog[] = [
                    'name' => $action.'_'.$resource,
                    'group_name' => $resource,
                ];
            }
        }

        $catalog[] = [
            'name' => 'manage_portfolio',
            'group_name' => 'tenant',
        ];

        foreach (['impersonate_user', 'manage_platform', 'manage_super_admins', 'view_system_logs'] as $action) {
            $catalog[] = [
                'name' => $action,
                'group_name' => 'system',
            ];
        }

        foreach (FieldPermissions::definitions() as $fieldPermission) {
            $catalog[] = [
                'name' => $fieldPermission['name'],
                'group_name' => $fieldPermission['group_name'],
            ];
        }

        foreach ($catalog as $entry) {
            Permission::query()->updateOrCreate(
                ['name' => $entry['name'], 'guard_name' => 'web'],
                ['group_name' => $entry['group_name']],
            );
        }

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $allWebPermissions = Permission::query()->where('guard_name', 'web')->get();
        $tenantAssignablePermissions = $allWebPermissions->where('group_name', '!=', 'system')->values();

        $superAdmin = Role::query()->where('name', 'super-admin')->where('guard_name', 'web')->first();
        $superAdmin?->givePermissionTo($allWebPermissions);

        $admin = Role::query()->where('name', 'admin')->where('guard_name', 'web')->first();
        $admin?->givePermissionTo($tenantAssignablePermissions);

        $hrManager = Role::query()->where('name', 'hr-manager')->where('guard_name', 'web')->first();
        $hrManager?->givePermissionTo(FieldPermissions::allNames());

        $manager = Role::query()->where('name', 'manager')->where('guard_name', 'web')->first();
        $manager?->givePermissionTo(FieldPermissions::managerDefaults());

        $employee = Role::query()->where('name', 'employee')->where('guard_name', 'web')->first();
        $employee?->givePermissionTo(FieldPermissions::employeeDefaults());

        app()[PermissionRegistrar::class]->forgetCachedPermissions();
    }

    public function down(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();
    }
};
