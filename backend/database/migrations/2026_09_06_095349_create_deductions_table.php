<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deductions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('deduction_type', 50)->default('other');
            $table->string('amount_type', 10)->default('fixed');
            $table->decimal('amount', 12, 2)->default(0);
            $table->decimal('percentage', 5, 2)->nullable();
            $table->decimal('total_amount', 12, 2)->nullable();
            $table->decimal('paid_amount', 12, 2)->default(0);
            $table->unsignedInteger('installment_count')->nullable();
            $table->decimal('installment_amount', 12, 2)->nullable();
            $table->boolean('is_recurring')->default(true);
            $table->string('status', 20)->default('active');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'status']);
            $table->index(['tenant_id', 'deduction_type']);
            $table->index(['tenant_id', 'employee_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('deductions');
    }
};
