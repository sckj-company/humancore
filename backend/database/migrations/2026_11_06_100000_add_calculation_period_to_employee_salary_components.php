<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_salary_components', function (Blueprint $table) {
            $table->string('calculation_period', 20)->nullable()->after('custom_value');
        });
    }

    public function down(): void
    {
        Schema::table('employee_salary_components', function (Blueprint $table) {
            $table->dropColumn('calculation_period');
        });
    }
};
