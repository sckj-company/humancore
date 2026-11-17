<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deductions', function (Blueprint $table): void {
            $table->timestamp('requested_at')->nullable()->after('starts_at');
            $table->string('signed_document_path', 500)->nullable()->after('legal_basis');
            $table->timestamp('signed_document_uploaded_at')->nullable()->after('signed_document_path');
        });

        Schema::create('deduction_installments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('deduction_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('installment_number');
            $table->string('reference_month', 7);
            $table->decimal('percentage', 6, 2);
            $table->decimal('amount', 12, 2);
            $table->string('status', 20)->default('pending');
            $table->foreignId('payroll_period_id')->nullable()->constrained('payroll_periods')->nullOnDelete();
            $table->foreignId('payroll_record_id')->nullable()->constrained('payroll_records')->nullOnDelete();
            $table->timestamp('paid_at')->nullable();
            $table->timestamps();

            $table->index(['deduction_id', 'installment_number']);
            $table->index(['tenant_id', 'reference_month', 'status']);
        });

        Schema::table('payroll_record_items', function (Blueprint $table): void {
            $table->foreignId('deduction_installment_id')
                ->nullable()
                ->after('deduction_id')
                ->constrained('deduction_installments')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payroll_record_items', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('deduction_installment_id');
        });

        Schema::dropIfExists('deduction_installments');

        Schema::table('deductions', function (Blueprint $table): void {
            $table->dropColumn([
                'requested_at',
                'signed_document_path',
                'signed_document_uploaded_at',
            ]);
        });
    }
};
