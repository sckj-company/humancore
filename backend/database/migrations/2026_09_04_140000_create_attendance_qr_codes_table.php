<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_qr_codes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('hash', 128)->unique();
            $table->string('action', 20);
            $table->string('ip_address', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('expires_at');
            $table->timestamp('used_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'employee_id']);
            $table->index(['hash', 'expires_at']);
            $table->index(['employee_id', 'used_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_qr_codes');
    }
};
