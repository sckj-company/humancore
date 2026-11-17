<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plans', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150);
            $table->string('slug', 150)->unique();
            $table->string('code', 80)->nullable()->unique();
            $table->string('description', 1000)->nullable();
            $table->string('badge_text', 60)->nullable();
            $table->string('visibility', 30)->default('public'); // public, private, archived
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('sort_order')->default(0);

            $table->string('billing_cycle', 30)->default('monthly'); // monthly, quarterly, semiannual, annual, lifetime, custom_days
            $table->unsignedInteger('custom_cycle_days')->nullable();
            $table->char('currency', 3)->default('AOA');
            $table->decimal('base_price', 14, 2)->default(0);
            $table->string('pricing_model', 40)->default('flat'); // flat, per_employee, per_managed_tenant, hybrid
            $table->unsignedInteger('included_employees')->default(0);
            $table->decimal('extra_employee_price', 14, 2)->default(0);
            $table->unsignedInteger('included_managed_tenants')->default(0);
            $table->decimal('extra_managed_tenant_price', 14, 2)->default(0);
            $table->decimal('setup_fee', 14, 2)->default(0);
            $table->unsignedInteger('trial_days')->default(0);
            $table->unsignedInteger('grace_period_days')->default(5);

            $table->json('features');
            $table->json('limits');
            $table->json('agency_config');
            $table->json('custom_rules')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();
        });

        Schema::create('tenant_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('plan_id')->constrained('plans')->restrictOnDelete();
            $table->string('status', 30)->default('active'); // active, pending_payment, past_due, grace_period, suspended, cancelled, expired
            $table->timestamp('starts_at');
            $table->timestamp('ends_at')->nullable();
            $table->timestamp('grace_until')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->boolean('auto_renew')->default(true);
            $table->decimal('custom_price', 14, 2)->nullable();
            $table->string('billing_cycle_override', 30)->nullable();
            $table->json('overrides')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status']);
            $table->index(['plan_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_subscriptions');
        Schema::dropIfExists('plans');
    }
};
