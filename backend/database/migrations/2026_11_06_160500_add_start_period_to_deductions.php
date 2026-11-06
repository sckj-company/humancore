<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('deductions', 'starts_at')) {
            Schema::table('deductions', function (Blueprint $table) {
                $table->date('starts_at')->nullable()->after('installment_amount');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('deductions', 'starts_at')) {
            Schema::table('deductions', function (Blueprint $table) {
                $table->dropColumn('starts_at');
            });
        }
    }
};
