<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deductions', function (Blueprint $table) {
            $table->boolean('is_mandatory')->default(false)->after('is_recurring');
            $table->string('legal_basis', 1000)->nullable()->after('is_mandatory');
        });

        Schema::table('payroll_record_items', function (Blueprint $table) {
            $table->foreignId('deduction_id')->nullable()->after('salary_component_id')
                ->constrained('deductions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('deductions', function (Blueprint $table) {
            $table->dropColumn(['is_mandatory', 'legal_basis']);
        });

        Schema::table('payroll_record_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('deduction_id');
        });
    }
};
