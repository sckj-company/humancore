<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->decimal('overtime_amount', 15, 2)->nullable()->after('overtime_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropColumn('overtime_amount');
        });
    }
};
