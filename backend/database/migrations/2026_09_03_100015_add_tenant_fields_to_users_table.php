<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained('tenants')->nullOnDelete();
            $table->foreignId('employee_id')->nullable()->after('tenant_id')->constrained('employees')->nullOnDelete();
            $table->string('locale', 10)->default('pt')->after('password');
            $table->string('timezone', 100)->default('Africa/Luanda')->after('locale');
            $table->text('two_factor_secret')->nullable()->after('timezone');
            $table->text('two_factor_recovery_codes')->nullable()->after('two_factor_secret');
            $table->boolean('is_active')->default(true)->after('two_factor_recovery_codes');
            $table->timestamp('last_login_at')->nullable()->after('is_active');
            $table->string('last_login_ip', 45)->nullable()->after('last_login_at');
            $table->index('tenant_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tenant_id');
            $table->dropConstrainedForeignId('employee_id');
            $table->dropColumn([
                'locale', 'timezone', 'two_factor_secret', 'two_factor_recovery_codes',
                'is_active', 'last_login_at', 'last_login_ip',
            ]);
        });
    }
};
