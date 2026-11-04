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
        Schema::table('payroll_records', function (Blueprint $table) {
            $table->foreignId('contract_id')->nullable()->change();
            $table->string('currency', 3)->default('AOA')->after('net_salary');
            $table->json('validation_errors')->nullable()->after('details');
        });

        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->string('status', 30)->default('open')->change();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('payroll_records', function (Blueprint $table) {
            $table->dropColumn(['currency', 'validation_errors']);
        });
    }
};

