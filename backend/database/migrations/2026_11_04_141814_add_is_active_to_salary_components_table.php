<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('salary_components', function (Blueprint $table): void {
            $table->boolean('is_active')->default(true)->after('priority');
        });
    }

    public function down(): void
    {
        Schema::table('salary_components', function (Blueprint $table): void {
            $table->dropColumn('is_active');
        });
    }
};
