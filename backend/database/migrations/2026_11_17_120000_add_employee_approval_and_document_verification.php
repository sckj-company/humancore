<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->string('approval_status', 20)->default('approved')->after('status')->index();
            $table->foreignId('approved_by')->nullable()->after('approval_status')->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable()->after('approved_by');
        });

        // Garantir que todos os funcionários existentes ficam APROVADOS
        DB::table('employees')->whereNull('approval_status')->orWhere('approval_status', '')->update([
            'approval_status' => 'approved',
        ]);

        Schema::table('employee_documents', function (Blueprint $table) {
            $table->boolean('is_verified')->default(false)->after('is_confidential');
            $table->foreignId('verified_by')->nullable()->after('is_verified')->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable()->after('verified_by');
        });

        // Documentos de funcionários existentes/aprovados iniciam já verificados
        DB::table('employee_documents')->update([
            'is_verified' => true,
        ]);
    }

    public function down(): void
    {
        Schema::table('employee_documents', function (Blueprint $table) {
            $table->dropConstrainedForeignId('verified_by');
            $table->dropColumn(['is_verified', 'verified_at']);
        });

        Schema::table('employees', function (Blueprint $table) {
            $table->dropConstrainedForeignId('approved_by');
            $table->dropColumn(['approval_status', 'approved_at']);
        });
    }
};
