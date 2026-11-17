<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('permission_groups', function (Blueprint $table) {
            $table->id();
            $table->string('name', 150)->unique();
            $table->string('description', 500)->nullable();
            $table->json('permissions');
            $table->boolean('is_system')->default(false);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('user_tenant_accesses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
            $table->foreignId('permission_group_id')->nullable()->constrained('permission_groups')->nullOnDelete();
            $table->string('role_name', 50)->nullable();
            $table->json('permissions')->nullable();
            $table->json('department_ids')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'tenant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_tenant_accesses');
        Schema::dropIfExists('permission_groups');
    }
};
