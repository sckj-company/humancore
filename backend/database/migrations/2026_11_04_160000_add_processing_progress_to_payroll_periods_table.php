<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->unsignedInteger('progress_total')->nullable()->after('notes');
            $table->unsignedInteger('progress_done')->nullable()->after('progress_total');
            $table->string('progress_message')->nullable()->after('progress_done');
        });
    }

    public function down(): void
    {
        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->dropColumn(['progress_total', 'progress_done', 'progress_message']);
        });
    }
};
