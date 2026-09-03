<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('salary_components', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('code', 50);
            $table->enum('type', ['earning', 'deduction', 'benefit', 'tax', 'contribution']);
            $table->enum('calculation_type', ['fixed', 'percentage', 'formula', 'hours']);
            $table->decimal('default_value', 15, 4)->default(0);
            $table->string('percentage_of', 100)->nullable();
            $table->text('formula')->nullable();
            $table->boolean('is_taxable')->default(false);
            $table->boolean('is_mandatory')->default(false);
            $table->integer('priority')->default(0);
            $table->json('applies_to')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();

            $table->unique(['tenant_id', 'code']);
            $table->index(['tenant_id', 'type', 'is_mandatory']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('salary_components');
    }
};
