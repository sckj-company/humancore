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
        Schema::create('payroll_irt_tables', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->char('country_code', 2)->default('AO');
            $table->string('regime_code', 50)->default('standard');
            $table->unsignedSmallInteger('version')->default(1);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->json('brackets');
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
                'payroll_irt_tables_version_unique'
            );
            $table->unique(
                ['tenant_id', 'country_code', 'regime_code', 'effective_from'],
                'payroll_irt_tables_start_unique'
            );
            $table->index(
                ['tenant_id', 'status', 'effective_from', 'effective_to'],
                'payroll_irt_tables_effective_index'
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payroll_irt_tables');
    }
};

