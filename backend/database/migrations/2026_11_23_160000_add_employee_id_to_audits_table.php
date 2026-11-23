<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audits', function (Blueprint $table) {
            if (! Schema::hasColumn('audits', 'employee_id')) {
                $table->unsignedBigInteger('employee_id')->nullable()->after('acting_tenant_id');
                $table->index(['tenant_id', 'employee_id', 'created_at'], 'audits_tenant_employee_created_idx');
            }
        });
    }

    public function down(): void
    {
        Schema::table('audits', function (Blueprint $table) {
            if (Schema::hasColumn('audits', 'employee_id')) {
                $table->dropIndex('audits_tenant_employee_created_idx');
                $table->dropColumn('employee_id');
            }
        });
    }
};
