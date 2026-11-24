<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->unsignedSmallInteger('level')->default(1)->after('parent_id');
            $table->foreignId('permission_group_id')
                ->nullable()
                ->after('status')
                ->constrained('permission_groups')
                ->nullOnDelete();
            $table->json('default_permissions')->nullable()->after('permission_group_id');
            $table->string('default_role_name', 50)->nullable()->after('default_permissions');

            $table->index(['tenant_id', 'level']);
        });

        Schema::table('positions', function (Blueprint $table) {
            $table->foreignId('parent_id')
                ->nullable()
                ->after('department_id')
                ->constrained('positions')
                ->nullOnDelete();
            $table->unsignedSmallInteger('level')->default(1)->after('parent_id');

            $table->index(['tenant_id', 'level']);
            $table->index(['tenant_id', 'parent_id']);
        });
    }

    public function down(): void
    {
        Schema::table('positions', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'parent_id']);
            $table->dropIndex(['tenant_id', 'level']);
            $table->dropConstrainedForeignId('parent_id');
            $table->dropColumn('level');
        });

        Schema::table('departments', function (Blueprint $table) {
            $table->dropIndex(['tenant_id', 'level']);
            $table->dropConstrainedForeignId('permission_group_id');
            $table->dropColumn(['level', 'default_permissions', 'default_role_name']);
        });
    }
};
