<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->string('occurrence_type', 30)->default('absence')->after('leave_type_id');
            $table->string('notice_type', 30)->nullable()->after('occurrence_type');
            $table->boolean('is_justified')->nullable()->after('notice_type');
            $table->boolean('deduct_from_salary')->default(false)->after('is_justified');
            $table->string('justification_document_path', 500)->nullable()->after('document_path');
            $table->string('signed_document_path', 500)->nullable()->after('justification_document_path');
        });
    }

    public function down(): void
    {
        Schema::table('leave_requests', function (Blueprint $table) {
            $table->dropColumn([
                'occurrence_type',
                'notice_type',
                'is_justified',
                'deduct_from_salary',
                'justification_document_path',
                'signed_document_path',
            ]);
        });
    }
};