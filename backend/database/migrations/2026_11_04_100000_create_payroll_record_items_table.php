<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payroll_record_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payroll_record_id')->constrained('payroll_records')->cascadeOnDelete();
            $table->enum('category', ['earning', 'deduction', 'tax', 'employer_contribution', 'employer_cost']);
            $table->string('code', 50);
            $table->string('name');
            $table->foreignId('salary_component_id')->nullable()->constrained('salary_components')->nullOnDelete();
            $table->foreignId('regulation_id')->nullable()->constrained('salary_component_regulations')->nullOnDelete();
            $table->foreignId('inss_rule_id')->nullable()->constrained('payroll_inss_rules')->nullOnDelete();
            $table->foreignId('irt_table_id')->nullable()->constrained('payroll_irt_tables')->nullOnDelete();
            $table->decimal('base_amount', 15, 2)->nullable();
            $table->decimal('quantity', 10, 4)->nullable();
            $table->decimal('rate', 10, 6)->nullable();
            $table->decimal('amount', 15, 2);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('payroll_record_id');
            $table->index(['tenant_id', 'payroll_record_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payroll_record_items');
    }
};

