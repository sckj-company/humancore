<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class PermissionSeeder extends Seeder
{
    public function run(): void
    {
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        $resources = [
            'tenant', 'user', 'employee', 'department', 'position', 'branch',
            'contract', 'attendance', 'leave', 'payroll', 'payslip',
            'salary-component', 'benefit', 'deduction', 'recruitment',
            'document', 'performance', 'training', 'report', 'setting', 'audit',
        ];

        $actions = [
            'view_any', 'view', 'create', 'update', 'delete', 'restore',
            'force_delete', 'approve', 'reject', 'process', 'close', 'export', 'print', 'configure',
        ];

        $permissions = [];

        foreach ($resources as $resource) {
            foreach ($actions as $action) {
                $permissions[] = [
                    'name' => $action.'_'.$resource,
                    'guard_name' => 'web',
                    'group_name' => $resource,
                ];
            }
        }

        // Ações globais (sem recurso específico)
        $globalActions = ['impersonate_user', 'manage_platform', 'view_system_logs'];
        foreach ($globalActions as $action) {
            $permissions[] = [
                'name' => $action,
                'guard_name' => 'web',
                'group_name' => 'system',
            ];
        }

        foreach ($permissions as $permission) {
            Permission::updateOrCreate(
                ['name' => $permission['name'], 'guard_name' => 'web'],
                $permission,
            );
        }

        // Roles do sistema
        $superAdmin = Role::updateOrCreate(['name' => 'super-admin', 'guard_name' => 'web'], [
            'description' => 'Acesso total à plataforma e todos os tenants',
            'is_system' => true,
        ]);
        $admin = Role::updateOrCreate(['name' => 'admin', 'guard_name' => 'web'], [
            'description' => 'Administrador de um tenant com acesso total',
            'is_system' => true,
        ]);
        $hrManager = Role::updateOrCreate(['name' => 'hr-manager', 'guard_name' => 'web'], [
            'description' => 'Gestão de RH: funcionários, payroll, recrutamento',
            'is_system' => true,
        ]);
        $manager = Role::updateOrCreate(['name' => 'manager', 'guard_name' => 'web'], [
            'description' => 'Gestor de equipa: aprovações e relatórios',
            'is_system' => true,
        ]);
        $employee = Role::updateOrCreate(['name' => 'employee', 'guard_name' => 'web'], [
            'description' => 'Funcionário: auto-serviço',
            'is_system' => true,
        ]);

        // Super Admin: todas as permissões
        $superAdmin->syncPermissions(Permission::all());

        // Admin (tenant): quase todas as permissões exceto gestão global de plataforma
        $admin->syncPermissions(Permission::where('group_name', '!=', 'system')->get());

        // HR Manager
        $hrManager->syncPermissions([
            'view_any_employee', 'view_employee', 'create_employee', 'update_employee', 'delete_employee', 'export_employee',
            'view_any_department', 'view_department', 'create_department', 'update_department', 'delete_department',
            'view_any_position', 'view_position', 'create_position', 'update_position', 'delete_position',
            'view_any_branch', 'view_branch', 'create_branch', 'update_branch', 'delete_branch',
            'view_any_contract', 'view_contract', 'create_contract', 'update_contract', 'delete_contract', 'print_contract',
            'view_any_attendance', 'view_attendance', 'create_attendance', 'update_attendance', 'export_attendance', 'approve_attendance',
            'view_any_leave', 'view_leave', 'create_leave', 'update_leave', 'approve_leave', 'reject_leave', 'delete_leave',
            'view_any_payroll', 'view_payroll', 'process_payroll', 'close_payroll', 'export_payroll',
            'view_any_payslip', 'view_payslip', 'print_payslip', 'export_payslip',
            'view_any_salary-component', 'view_salary-component', 'create_salary-component', 'update_salary-component', 'configure_salary-component',
            'view_any_benefit', 'view_benefit', 'create_benefit', 'update_benefit', 'delete_benefit',
            'view_any_deduction', 'view_deduction', 'create_deduction', 'update_deduction', 'approve_deduction',
            'view_any_document', 'view_document', 'create_document', 'delete_document', 'export_document',
            'view_any_recruitment', 'view_recruitment', 'create_recruitment', 'update_recruitment',
            'view_any_performance', 'view_performance', 'create_performance', 'update_performance',
            'view_any_training', 'view_training', 'create_training', 'update_training',
            'view_any_report', 'view_report', 'export_report', 'print_report',
            'view_any_setting', 'view_setting', 'configure_setting', 'update_setting',
            'view_any_audit', 'view_audit', 'export_audit',
        ]);

        // Manager
        $manager->syncPermissions([
            'view_employee', 'view_contract', 'view_attendance', 'approve_attendance',
            'view_leave', 'approve_leave', 'reject_leave', 'create_leave',
            'view_report', 'print_report', 'view_document',
            'view_any_leave', 'view_any_attendance',
        ]);

        // Employee
        $employee->syncPermissions([
            'view_employee', 'view_contract', 'view_attendance', 'create_attendance',
            'view_leave', 'create_leave', 'view_payslip', 'view_document', 'view_report',
        ]);
    }
}
