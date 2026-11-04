<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('payroll_inss_rules', function (Blueprint $table) {
            $table->dropUnique('payroll_inss_rules_start_unique');
        });

        Schema::table('payroll_irt_tables', function (Blueprint $table) {
            $table->dropUnique('payroll_irt_tables_start_unique');
        });

        Schema::table('salary_component_regulations', function (Blueprint $table) {
            $table->dropUnique('salary_component_regulations_company_start_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payroll_inss_rules', function (Blueprint $table) {
            $table->unique(
                ['tenant_id', 'country_code', 'regime_code', 'effective_from'],
                'payroll_inss_rules_start_unique'
            );
        });

        Schema::table('payroll_irt_tables', function (Blueprint $table) {
            $table->unique(
                ['tenant_id', 'country_code', 'regime_code', 'effective_from'],
                'payroll_irt_tables_start_unique'
            );
        });

        Schema::table('salary_component_regulations', function (Blueprint $table) {
            $table->unique(
                ['tenant_id', 'salary_component_id', 'country_code', 'regime_code', 'effective_from'],
                'salary_component_regulations_company_start_unique'
            );
        });
    }
};
