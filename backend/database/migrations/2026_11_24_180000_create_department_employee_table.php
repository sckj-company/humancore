<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('department_employee', function (Blueprint $table) {
            $table->id();
            $table->foreignId('department_id')->constrained('departments')->cascadeOnDelete();
            $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['department_id', 'employee_id']);
            $table->index('employee_id');
        });

        $now = now();
        $rows = DB::table('employees')
            ->whereNotNull('department_id')
            ->get(['id', 'department_id'])
            ->map(fn ($emp): array => [
                'department_id' => (int) $emp->department_id,
                'employee_id' => (int) $emp->id,
                'created_at' => $now,
                'updated_at' => $now,
            ])
            ->all();

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('department_employee')->insertOrIgnore($chunk);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('department_employee');
    }
};
