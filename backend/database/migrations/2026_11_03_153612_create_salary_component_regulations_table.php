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
        Schema::create('salary_component_regulations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('salary_component_id')->constrained()->cascadeOnDelete();
            $table->char('country_code', 2)->default('AO');
            $table->string('regime_code', 50)->default('standard');
            $table->unsignedSmallInteger('version')->default(1);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('employee_inss_applicable')->nullable();
            $table->boolean('employer_inss_applicable')->nullable();
            $table->boolean('irt_applicable')->nullable();
            $table->enum('status', ['draft', 'validated', 'active', 'revoked'])->default('draft');
            $table->text('legal_source')->nullable();
            $table->string('legal_reference')->nullable();
            $table->timestamp('validated_at')->nullable();
            $table->foreignId('validated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(
                ['salary_component_id', 'country_code', 'regime_code', 'version'],
                'salary_component_regulations_version_unique',
            );
            $table->index(['tenant_id', 'status', 'effective_from', 'effective_to'], 'salary_component_regulations_effective_index');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('salary_component_regulations');
    }
};
