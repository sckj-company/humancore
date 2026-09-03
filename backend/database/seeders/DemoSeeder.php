<?php

namespace Database\Seeders;

use App\Models\Branch;
use App\Models\Department;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSalaryComponent;
use App\Models\Position;
use App\Models\SalaryComponent;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $manager = app(TenantManager::class);

        $tenant = Tenant::updateOrCreate(
            ['slug' => 'empresa-demo'],
            [
                'name' => 'Empresa Demo Lda',
                'email' => 'demo@hrms.local',
                'phone' => '+244 999 000 000',
                'tax_id' => '5000000000',
                'address' => 'Rua das Palmeiras, 123',
                'city' => 'Luanda',
                'country' => 'Angola',
                'currency' => 'AOA',
                'locale' => 'pt',
                'timezone' => 'Africa/Luanda',
                'status' => 'active',
                'config' => [
                    'payroll' => [
                        'inss_rate' => 7.5,
                        'irt_tables' => [],
                        'meal_allowance' => 5000,
                    ],
                    'company' => [
                        'workweek' => ['mon', 'tue', 'wed', 'thu', 'fri'],
                        'daily_hours' => 8,
                    ],
                ],
            ],
        );

        $manager->set($tenant);

        // Utilizadores
        $adminUser = User::updateOrCreate(
            ['email' => 'admin@empresa-demo.local'],
            [
                'tenant_id' => $tenant->id,
                'name' => 'Administrador Demo',
                'password' => Hash::make('password'),
                'email_verified_at' => now(),
                'is_active' => true,
            ],
        );
        $adminUser->assignRole('admin');

        // Estrutura
        $headquarters = Branch::firstOrCreate(
            ['tenant_id' => $tenant->id, 'code' => 'HQ'],
            ['name' => 'Sede Central', 'city' => 'Luanda', 'is_headquarter' => true, 'status' => 'active'],
        );

        $deptHR = Department::firstOrCreate(
            ['tenant_id' => $tenant->id, 'code' => 'RH'],
            ['name' => 'Recursos Humanos', 'branch_id' => $headquarters->id, 'status' => 'active'],
        );
        $deptFin = Department::firstOrCreate(
            ['tenant_id' => $tenant->id, 'code' => 'FIN'],
            ['name' => 'Financeiro', 'branch_id' => $headquarters->id, 'status' => 'active'],
        );
        $deptOps = Department::firstOrCreate(
            ['tenant_id' => $tenant->id, 'code' => 'OPS'],
            ['name' => 'Operações', 'branch_id' => $headquarters->id, 'status' => 'active'],
        );
        $deptIT = Department::firstOrCreate(
            ['tenant_id' => $tenant->id, 'code' => 'IT'],
            ['name' => 'Tecnologia', 'branch_id' => $headquarters->id, 'status' => 'active'],
        );

        $positions = [
            ['title' => 'Gestor de Recursos Humanos', 'department_id' => $deptHR->id, 'is_management' => true],
            ['title' => 'Contabilista', 'department_id' => $deptFin->id],
            ['title' => 'Coordenador de Operações', 'department_id' => $deptOps->id, 'is_management' => true],
            ['title' => 'Desenvolvedor de Software', 'department_id' => $deptIT->id],
            ['title' => 'Assistente Administrativo', 'department_id' => $deptHR->id],
        ];

        foreach ($positions as $position) {
            Position::firstOrCreate(
                ['tenant_id' => $tenant->id, 'title' => $position['title']],
                $position,
            );
        }

        $posHrManager = Position::where('tenant_id', $tenant->id)->where('title', 'Gestor de Recursos Humanos')->first();
        $posDev = Position::where('tenant_id', $tenant->id)->where('title', 'Desenvolvedor de Software')->first();
        $posAssistant = Position::where('tenant_id', $tenant->id)->where('title', 'Assistente Administrativo')->first();
        $posOps = Position::where('tenant_id', $tenant->id)->where('title', 'Coordenador de Operações')->first();
        $posAccountant = Position::where('tenant_id', $tenant->id)->where('title', 'Contabilista')->first();

        // Componentes salariais padrão
        $components = [
            ['code' => 'base_salary', 'name' => 'Salário Base', 'type' => 'earning', 'calculation_type' => 'fixed', 'is_mandatory' => true, 'priority' => 10],
            ['code' => 'meal_allowance', 'name' => 'Subsídio de Refeição', 'type' => 'benefit', 'calculation_type' => 'fixed', 'default_value' => 5000, 'is_mandatory' => true, 'priority' => 20],
            ['code' => 'transport_allowance', 'name' => 'Subsídio de Transporte', 'type' => 'benefit', 'calculation_type' => 'fixed', 'default_value' => 30000, 'is_mandatory' => true, 'priority' => 21],
            ['code' => 'overtime', 'name' => 'Horas Extraordinárias', 'type' => 'earning', 'calculation_type' => 'formula', 'is_mandatory' => true, 'priority' => 30],
            ['code' => 'inss', 'name' => 'INSS (Funcionário)', 'type' => 'deduction', 'calculation_type' => 'percentage', 'default_value' => 3, 'is_mandatory' => true, 'priority' => 100],
            ['code' => 'irt', 'name' => 'IRT', 'type' => 'tax', 'calculation_type' => 'formula', 'is_mandatory' => true, 'priority' => 110],
        ];

        foreach ($components as $component) {
            SalaryComponent::firstOrCreate(
                ['tenant_id' => $tenant->id, 'code' => $component['code']],
                $component,
            );
        }

        // Funcionários demo
        $demoPeople = [
            [
                'first_name' => 'João', 'last_name' => 'Silva', 'email' => 'joao.silva@empresa-demo.local',
                'gender' => 'male', 'role' => 'hr-manager', 'position_id' => $posHrManager->id,
                'department_id' => $deptHR->id, 'salary' => 850000,
            ],
            [
                'first_name' => 'Maria', 'last_name' => 'Santos', 'email' => 'maria.santos@empresa-demo.local',
                'gender' => 'female', 'role' => 'admin', 'position_id' => $posAccountant->id,
                'department_id' => $deptFin->id, 'salary' => 600000,
            ],
            [
                'first_name' => 'Pedro', 'last_name' => 'Lima', 'email' => 'pedro.lima@empresa-demo.local',
                'gender' => 'male', 'role' => 'employee', 'position_id' => $posDev->id,
                'department_id' => $deptIT->id, 'salary' => 950000,
            ],
            [
                'first_name' => 'Ana', 'last_name' => 'Costa', 'email' => 'ana.costa@empresa-demo.local',
                'gender' => 'female', 'role' => 'employee', 'position_id' => $posAssistant->id,
                'department_id' => $deptHR->id, 'salary' => 400000,
            ],
            [
                'first_name' => 'Carlos', 'last_name' => 'Mendes', 'email' => 'carlos.mendes@empresa-demo.local',
                'gender' => 'male', 'role' => 'manager', 'position_id' => $posOps->id,
                'department_id' => $deptOps->id, 'salary' => 750000,
            ],
        ];

        foreach ($demoPeople as $index => $person) {
            $employee = Employee::updateOrCreate(
                ['tenant_id' => $tenant->id, 'email' => $person['email']],
                [
                    'employee_code' => 'EMP-'.str_pad((string) ($index + 1), 4, '0', STR_PAD_LEFT),
                    'first_name' => $person['first_name'],
                    'last_name' => $person['last_name'],
                    'department_id' => $person['department_id'],
                    'position_id' => $person['position_id'],
                    'gender' => $person['gender'],
                    'nationality' => 'Angolana',
                    'city' => 'Luanda',
                    'status' => 'active',
                    'hired_at' => now()->subMonths(rand(3, 40))->format('Y-m-d'),
                ],
            );

            EmployeeContract::updateOrCreate(
                ['tenant_id' => $tenant->id, 'employee_id' => $employee->id, 'is_active' => true],
                [
                    'contract_type' => 'permanent',
                    'base_salary' => $person['salary'],
                    'salary_frequency' => 'monthly',
                    'work_hours_per_week' => 44,
                    'start_date' => $employee->hired_at->format('Y-m-d'),
                    'signed_at' => $employee->hired_at->format('Y-m-d'),
                    'is_active' => true,
                ],
            );

            $user = User::updateOrCreate(
                ['email' => $person['email']],
                [
                    'tenant_id' => $tenant->id,
                    'employee_id' => $employee->id,
                    'name' => $person['first_name'].' '.$person['last_name'],
                    'password' => Hash::make('password'),
                    'email_verified_at' => now(),
                    'is_active' => true,
                ],
            );
            $user->syncRoles([$person['role']]);

            $employee->update(['user_id' => $user->id]);

            // Componentes salariais do funcionário (a partir dos padrões)
            $contract = EmployeeContract::where('tenant_id', $tenant->id)->where('employee_id', $employee->id)->where('is_active', true)->first();
            if ($contract) {
                foreach (SalaryComponent::where('tenant_id', $tenant->id)->where('is_mandatory', true)->get() as $comp) {
                    EmployeeSalaryComponent::updateOrCreate(
                        ['employee_id' => $employee->id, 'contract_id' => $contract->id, 'salary_component_id' => $comp->id],
                        ['is_active' => true, 'start_date' => $contract->start_date],
                    );
                }
            }
        }
    }
}
