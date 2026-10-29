<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('benefits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('benefit_type', 50)->default('other');
            $table->string('amount_type', 10)->default('fixed');
            $table->decimal('amount', 12, 2)->default(0);
            $table->decimal('percentage', 5, 2)->nullable();
            $table->boolean('is_taxable')->default(false);
            $table->string('provider')->nullable();
            $table->date('start_date')->nullable();
            $table->date('end_date')->nullable();
            $table->string('status', 20)->default('active');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'benefit_type']);
            $table->index(['tenant_id', 'employee_id']);
            $table->index(['tenant_id', 'start_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('benefits');
    }
};
