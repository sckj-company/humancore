<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('permissions', function (Blueprint $table) {
            $table->string('group_name', 100)->nullable()->after('guard_name');
            $table->text('description')->nullable()->after('group_name');
        });

        Schema::table('roles', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable()->after('id');
            $table->text('description')->nullable()->after('guard_name');
            $table->boolean('is_system')->default(false)->after('description');

            $table->index('tenant_id');
        });
    }

    public function down(): void
    {
        Schema::table('permissions', function (Blueprint $table) {
            $table->dropColumn(['group_name', 'description']);
        });

        Schema::table('roles', function (Blueprint $table) {
            $table->dropColumn(['tenant_id', 'description', 'is_system']);
        });
    }
};
