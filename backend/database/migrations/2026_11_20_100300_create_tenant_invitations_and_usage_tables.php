<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_invitations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('email');
            $table->string('name')->nullable();
            $table->string('role_name', 50)->default('employee');
            $table->foreignId('permission_group_id')->nullable()->constrained('permission_groups')->nullOnDelete();
            $table->json('department_ids')->nullable();
            $table->foreignId('employee_id')->nullable()->constrained('employees')->nullOnDelete();
            $table->string('token', 100)->unique();
            $table->foreignId('invited_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('expires_at');
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'email']);
        });

        Schema::create('tenant_monthly_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->char('year_month', 7); // YYYY-MM
            $table->unsignedInteger('ocr_requests')->default(0);
            $table->unsignedInteger('payroll_runs')->default(0);
            $table->timestamps();

            $table->unique(['tenant_id', 'year_month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenant_monthly_usages');
        Schema::dropIfExists('tenant_invitations');
    }
};
