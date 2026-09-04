<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('job_opening_id')->constrained()->cascadeOnDelete();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email');
            $table->string('phone', 50)->nullable();
            $table->string('location')->nullable();
            $table->string('source', 50)->nullable();
            $table->string('resume_path', 500)->nullable();
            $table->text('cover_letter')->nullable();
            $table->string('linkedin_url')->nullable();
            $table->unsignedInteger('years_experience')->nullable();
            $table->string('status', 20)->default('applied');
            $table->decimal('expected_salary', 12, 2)->nullable();
            $table->unsignedTinyInteger('rating')->nullable();
            $table->text('notes')->nullable();
            $table->timestamp('applied_at')->nullable();
            $table->timestamp('last_status_at')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'job_opening_id']);
            $table->index(['tenant_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidates');
    }
};
