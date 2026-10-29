<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('code', 50)->nullable();
            $table->time('start_time');
            $table->time('end_time');
            $table->integer('break_minutes')->default(60);
            $table->decimal('work_hours', 5, 2)->default(8);
            $table->integer('late_tolerance_minutes')->default(10);
            $table->json('working_days')->nullable();
            $table->string('color', 20)->nullable();
            $table->boolean('is_night_shift')->default(false);
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['tenant_id', 'is_active']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shifts');
    }
};
