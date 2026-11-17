<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('employees', 'biometric_code')) {
            Schema::table('employees', function (Blueprint $table) {
                $table->string('biometric_code', 64)->nullable()->after('employee_code');
                $table->index(['tenant_id', 'biometric_code'], 'employees_tenant_biometric_code_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('employees', 'biometric_code')) {
            Schema::table('employees', function (Blueprint $table) {
                $table->dropIndex('employees_tenant_biometric_code_idx');
                $table->dropColumn('biometric_code');
            });
        }
    }
};
