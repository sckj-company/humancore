<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deductions', function (Blueprint $table) {
            $table->text('cancellation_reason')->nullable()->after('notes');
            $table->timestamp('cancelled_at')->nullable()->after('cancellation_reason');
            $table->foreignId('cancelled_by')->nullable()->after('cancelled_at')->constrained('users')->nullOnDelete();
            $table->text('deletion_reason')->nullable()->after('cancelled_by');
        });
    }

    public function down(): void
    {
        Schema::table('deductions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('cancelled_by');
            $table->dropColumn(['cancellation_reason', 'cancelled_at', 'deletion_reason']);
        });
    }
};
