<?php

namespace App\Support;

class FieldPermissions
{
    /**
     * Catálogo centralizado de permissões por campo (field.<resource>.<field>.<view|edit>).
     *
     * @return array<int, array{name: string, group_name: string}>
     */
    public static function definitions(): array
    {
        $map = [
            'payroll' => [
                'base_salary' => ['view', 'edit'],
                'gross_salary' => ['view'],
                'allowances' => ['view', 'edit'],
                'inss' => ['view'],
                'irt' => ['view'],
                'deductions' => ['view', 'edit'],
                'net_salary' => ['view'],
                'employer_cost' => ['view'],
                'attendance_metrics' => ['view', 'edit'],
            ],
            'employee' => [
                'salary' => ['view', 'edit'],
                'personal_identity' => ['view', 'edit'],
                'fiscal_ids' => ['view', 'edit'],
                'contact_address' => ['view', 'edit'],
                'organization' => ['view', 'edit'],
            ],
            'contract' => [
                'base_salary' => ['view', 'edit'],
                'compensation_terms' => ['view', 'edit'],
                'dates_notes' => ['view', 'edit'],
            ],
            'attendance' => [
                'clock_times' => ['view', 'edit'],
                'overtime_lateness' => ['view', 'edit'],
                'salary_deduction' => ['view', 'edit'],
            ],
            'leave' => [
                'balances' => ['view'],
                'documents' => ['view', 'edit'],
            ],
            'benefit' => [
                'amounts' => ['view', 'edit'],
            ],
            'deduction' => [
                'amounts' => ['view', 'edit'],
            ],
            'payslip' => [
                'salary_details' => ['view'],
            ],
            'report' => [
                'salary_costs' => ['view'],
            ],
        ];

        $permissions = [];
        foreach ($map as $resource => $fields) {
            foreach ($fields as $field => $modes) {
                foreach ($modes as $mode) {
                    $permissions[] = [
                        'name' => "field.{$resource}.{$field}.{$mode}",
                        'group_name' => $resource,
                    ];
                }
            }
        }

        return $permissions;
    }

    /**
     * @return array<int, string>
     */
    public static function allNames(): array
    {
        return array_column(self::definitions(), 'name');
    }

    /**
     * @return array<int, string>
     */
    public static function managerDefaults(): array
    {
        return [
            'field.employee.personal_identity.view',
            'field.employee.contact_address.view',
            'field.employee.organization.view',
            'field.contract.dates_notes.view',
            'field.attendance.clock_times.view',
            'field.attendance.overtime_lateness.view',
            'field.leave.balances.view',
            'field.leave.documents.view',
        ];
    }

    /**
     * @return array<int, string>
     */
    public static function employeeDefaults(): array
    {
        return [
            'field.employee.salary.view',
            'field.employee.personal_identity.view',
            'field.employee.fiscal_ids.view',
            'field.employee.contact_address.view',
            'field.employee.organization.view',
            'field.contract.base_salary.view',
            'field.contract.compensation_terms.view',
            'field.contract.dates_notes.view',
            'field.attendance.clock_times.view',
            'field.attendance.overtime_lateness.view',
            'field.leave.balances.view',
            'field.leave.documents.view',
            'field.leave.documents.edit',
            'field.payslip.salary_details.view',
        ];
    }
}
