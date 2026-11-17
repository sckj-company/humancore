<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenant_relationships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('manager_tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('managed_tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->string('relationship_type', 40)->default('bpo'); // bpo, accounting, consulting, holding, reseller
            $table->string('status', 30)->default('active'); // pending, active, suspended, revoked
            $table->json('management_scope')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->unique(['manager_tenant_id', 'managed_tenant_id']);
            $table->index(['managed_tenant_id', 'status']);
        });

        Schema::table('tenants', function (Blueprint $table) {
            $table->foreignId('created_by_tenant_id')->nullable()->after('status')->constrained('tenants')->nullOnDelete();
            $table->string('origin_type', 30)->default('platform')->after('created_by_tenant_id');
            $table->string('billing_email')->nullable()->after('email');
            $table->json('branding')->nullable()->after('config');
        });

        Schema::table('user_tenant_accesses', function (Blueprint $table) {
            $table->foreignId('granted_by_tenant_id')->nullable()->after('tenant_id')->constrained('tenants')->nullOnDelete();
            $table->boolean('is_active')->default(true)->after('department_ids');
        });

        Schema::table('permission_groups', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained('tenants')->cascadeOnDelete();
            $table->dropUnique(['name']);
            $table->index(['tenant_id', 'name']);
        });

        Schema::table('audits', function (Blueprint $table) {
            $table->foreignId('acting_tenant_id')->nullable()->after('tenant_id')->constrained('tenants')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('audits', function (Blueprint $table) {
            $table->dropConstrainedForeignId('acting_tenant_id');
        });

        Schema::table('permission_groups', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'name']);
            $table->dropConstrainedForeignId('tenant_id');
            $table->unique('name');
        });

        Schema::table('user_tenant_accesses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('granted_by_tenant_id');
            $table->dropColumn('is_active');
        });

        Schema::table('tenants', function (Blueprint $table) {
            $table->dropConstrainedForeignId('created_by_tenant_id');
            $table->dropColumn(['origin_type', 'billing_email', 'branding']);
        });

        Schema::dropIfExists('tenant_relationships');
    }
};
