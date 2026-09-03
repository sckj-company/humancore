<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Department>
 */
class DepartmentFactory extends Factory
{
    protected $model = Department::class;

    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'branch_id' => null,
            'name' => fake()->randomElement([
                'Recursos Humanos', 'Financeiro', 'Tecnologia', 'Operações',
                'Comercial', 'Logística', 'Marketing', 'Jurídico',
            ]),
            'code' => strtoupper(fake()->lexify('????')),
            'status' => 'active',
        ];
    }
}
