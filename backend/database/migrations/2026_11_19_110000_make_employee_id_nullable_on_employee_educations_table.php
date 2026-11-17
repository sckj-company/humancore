<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_educations', function (Blueprint $table) {
            $table->dropForeign(['employee_id']);
        });

        Schema::table('employee_educations', function (Blueprint $table) {
            $table->unsignedBigInteger('employee_id')->nullable()->change();
            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('employee_educations', function (Blueprint $table) {
            $table->dropForeign(['employee_id']);
        });

        Schema::table('employee_educations', function (Blueprint $table) {
            $table->unsignedBigInteger('employee_id')->nullable(false)->change();
            $table->foreign('employee_id')->references('id')->on('employees')->cascadeOnDelete();
        });
    }
};
