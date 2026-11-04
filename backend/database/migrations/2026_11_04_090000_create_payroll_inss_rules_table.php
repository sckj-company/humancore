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
        Schema::create('payroll_inss_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->char('country_code', 2)->default('AO');
            $table->string('regime_code', 50)->default('standard');
            $table->unsignedSmallInteger('version')->default(1);
            $table->decimal('employee_rate', 6, 4)->default(3.0000);
            $table->decimal('employer_rate', 6, 4)->default(8.0000);
            $table->decimal('max_base', 15, 2)->nullable();
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->enum('status', ['draft', 'validated', 'active', 'revoked'])->default('draft');
            $table->text('legal_source')->nullable();
            $table->string('legal_reference')->nullable();
            $table->string('legal_document_path', 500)->nullable();
            $table->timestamp('validated_at')->nullable();
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('revocation_reason', 1000)->nullable();
            $table->timestamps();

            $table->unique(
                ['tenant_id', 'country_code', 'regime_code', 'version'],
                'payroll_inss_rules_version_unique'
            );
            $table->unique(
                ['tenant_id', 'country_code', 'regime_code', 'effective_from'],
                'payroll_inss_rules_start_unique'
            );
            $table->index(
                ['tenant_id', 'status', 'effective_from', 'effective_to'],
                'payroll_inss_rules_effective_index'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payroll_inss_rules');
    }
};

