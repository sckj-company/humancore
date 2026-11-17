<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payroll_periods', function (Blueprint $table) {
            $table->string('period_type', 30)->default('monthly')->change();
        });
    }

    public function down(): void
    {
        // Mantém string(30) para evitar truncagem de registos trimestrais ou personalizados.
    }
};
