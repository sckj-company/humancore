<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_educations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('title', 255)->nullable();
            $table->text('reason');
            $table->text('sanction_warning')->nullable();
            $table->date('occurred_on')->nullable();
            $table->string('document_path', 2048)->nullable();
            $table->string('document_name', 255)->nullable();
            $table->string('document_mime', 100)->nullable();
            $table->string('signed_document_path', 2048)->nullable();
            $table->string('signed_document_name', 255)->nullable();
            $table->string('signed_document_mime', 100)->nullable();
            $table->timestamp('signed_document_uploaded_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'employee_id', 'occurred_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_educations');
    }
};
