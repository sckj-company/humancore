<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_records', function (Blueprint $table) {
            $table->decimal('inss_base', 15, 2)->default(0)->after('total_taxes');
            $table->decimal('employer_inss_base', 15, 2)->default(0)->after('inss_base');
            $table->decimal('employer_inss', 15, 2)->default(0)->after('employer_inss_base');
            $table->decimal('irt_taxable_base', 15, 2)->default(0)->after('employer_inss');
            $table->decimal('employer_cost', 15, 2)->default(0)->after('irt_taxable_base');
            $table->json('snapshot')->nullable()->after('employer_cost');
            $table->string('engine_version', 20)->nullable()->after('snapshot');
        });

        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->foreignId('approved_by')->nullable()->after('processed_by')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->text('rejection_reason')->nullable()->after('approved_at');
            $table->json('totals_snapshot')->nullable()->after('rejection_reason');
        });
    }

    public function down(): void
    {
        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->dropForeign(['approved_by']);
            $table->dropColumn(['approved_by', 'approved_at', 'rejection_reason', 'totals_snapshot']);
        });

        Schema::table('payroll_records', function (Blueprint $table) {
            $table->dropColumn([
                'inss_base',
                'employer_inss_base',
                'employer_inss',
                'irt_taxable_base',
                'employer_cost',
                'snapshot',
                'engine_version',
            ]);
        });
    }
};

