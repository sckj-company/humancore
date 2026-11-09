<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropUnique('attendance_records_employee_id_date_unique');
            $table->foreignId('shift_id')->nullable()->after('employee_id')->constrained()->nullOnDelete();
            $table->unique(['employee_id', 'date', 'shift_id'], 'attendance_employee_date_shift_unique');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_records', function (Blueprint $table) {
            $table->dropUnique('attendance_employee_date_shift_unique');
            $table->dropConstrainedForeignId('shift_id');
            $table->unique(['employee_id', 'date']);
        });
    }
};
