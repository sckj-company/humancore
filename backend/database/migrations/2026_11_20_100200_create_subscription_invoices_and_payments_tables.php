<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_number', 60)->unique();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('subscription_id')->constrained('tenant_subscriptions')->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->date('period_start');
            $table->date('period_end')->nullable();
            $table->date('due_date');
            $table->char('currency', 3)->default('AOA');
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('overage_amount', 14, 2)->default(0);
            $table->decimal('discount_amount', 14, 2)->default(0);
            $table->decimal('total_amount', 14, 2)->default(0);
            $table->json('line_items');
            $table->string('status', 30)->default('open'); // draft, open, under_review, paid, overdue, void
            $table->timestamp('paid_at')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
        });

        Schema::create('subscription_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('invoice_id')->constrained('subscription_invoices')->cascadeOnDelete();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->decimal('amount', 14, 2);
            $table->char('currency', 3)->default('AOA');
            $table->string('payment_method', 40)->default('bank_transfer'); // bank_transfer, multicaixa_reference, cash, gpo, other
            $table->string('reference_code', 120)->nullable();
            $table->date('payment_date')->nullable();
            $table->string('proof_file_path', 500)->nullable();
            $table->string('proof_original_name', 255)->nullable();
            $table->string('status', 30)->default('pending'); // pending, approved, rejected
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['invoice_id', 'status']);
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_payments');
        Schema::dropIfExists('subscription_invoices');
    }
};
