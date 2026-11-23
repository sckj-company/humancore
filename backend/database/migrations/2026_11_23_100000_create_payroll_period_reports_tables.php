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
        Schema::create('payroll_period_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payroll_period_id')->constrained('payroll_periods')->cascadeOnDelete()->unique();
            $table->string('title', 200)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('inss_guide_sent')->default(false);
            $table->boolean('inss_payment_proof_sent')->default(false);
            $table->boolean('inss_paid')->default(false);
            $table->boolean('payslips_summary_sent')->default(false);
            $table->boolean('payroll_sheet_sent')->default(false);
            $table->boolean('is_summary_complete')->default(false);
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'is_summary_complete']);
            $table->index(['tenant_id', 'inss_paid']);
        });

        Schema::create('payroll_period_report_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payroll_period_report_id')->constrained('payroll_period_reports')->cascadeOnDelete();
            $table->string('document_type', 50);
            $table->string('title', 200);
            $table->string('file_path', 1000);
            $table->string('file_name', 255);
            $table->string('mime_type', 120)->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->boolean('is_paid')->default(false);
            $table->boolean('is_sent')->default(false);
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['payroll_period_report_id', 'document_type'], 'ppr_docs_report_type_idx');
            $table->index(['tenant_id', 'document_type'], 'ppr_docs_tenant_type_idx');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payroll_period_report_documents');
        Schema::dropIfExists('payroll_period_reports');
    }
};
