<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_salary_components', function (Blueprint $table) {
            $table->foreignId('tenant_id')
                ->after('id')
                ->nullable()
                ->constrained('tenants')
                ->cascadeOnDelete();

            $table->index('tenant_id');
        });

        // Backfill tenant_id from contracts and employees (supports both MySQL and SQLite)
        if (DB::getDriverName() === 'mysql') {
            DB::statement('
                UPDATE employee_salary_components esc
                JOIN employee_contracts ec ON esc.contract_id = ec.id
                SET esc.tenant_id = ec.tenant_id
                WHERE esc.tenant_id IS NULL
            ');

            DB::statement('
                UPDATE employee_salary_components esc
                JOIN employees e ON esc.employee_id = e.id
                SET esc.tenant_id = e.tenant_id
                WHERE esc.tenant_id IS NULL
            ');
        } else {
            DB::table('employee_salary_components')
                ->whereNull('tenant_id')
                ->whereNotNull('contract_id')
                ->update([
                    'tenant_id' => DB::raw('(SELECT tenant_id FROM employee_contracts WHERE employee_contracts.id = employee_salary_components.contract_id)')
                ]);

            DB::table('employee_salary_components')
                ->whereNull('tenant_id')
                ->whereNotNull('employee_id')
                ->update([
                    'tenant_id' => DB::raw('(SELECT tenant_id FROM employees WHERE employees.id = employee_salary_components.employee_id)')
                ]);
        }
    }

    public function down(): void
    {
        Schema::table('employee_salary_components', function (Blueprint $table) {
            $table->dropForeign(['tenant_id']);
            $table->dropIndex(['tenant_id']);
            $table->dropColumn('tenant_id');
        });
    }
};
