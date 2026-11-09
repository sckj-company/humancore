<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employee_lateness_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained()->cascadeOnDelete();
            $table->string('event_key', 100);
            $table->string('event_type', 30);
            $table->date('occurred_on');
            $table->date('week_start');
            $table->unsignedInteger('minutes');
            $table->decimal('amount', 15, 2)->default(0);
            $table->json('details')->nullable();
            $table->timestamps();

            $table->unique(['employee_id', 'event_key']);
            $table->index(['tenant_id', 'employee_id', 'occurred_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_lateness_events');
    }
};
