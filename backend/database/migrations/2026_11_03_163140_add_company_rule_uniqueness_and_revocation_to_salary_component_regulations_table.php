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
        Schema::table('salary_component_regulations', function (Blueprint $table) {
            $table->timestamp('revoked_at')->nullable()->after('validated_by');
            $table->foreignId('revoked_by')->nullable()->after('revoked_at')->constrained('users')->nullOnDelete();
            $table->string('revocation_reason', 1000)->nullable()->after('revoked_by');
            $table->unique(
                ['tenant_id', 'salary_component_id', 'country_code', 'regime_code', 'effective_from'],
                'salary_component_regulations_company_start_unique',
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('salary_component_regulations', function (Blueprint $table) {
            $table->dropUnique('salary_component_regulations_company_start_unique');
            $table->dropConstrainedForeignId('revoked_by');
            $table->dropColumn(['revoked_at', 'revocation_reason']);
        });
    }
};
