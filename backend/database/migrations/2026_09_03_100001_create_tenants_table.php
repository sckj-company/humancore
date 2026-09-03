<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('email')->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('tax_id', 100)->nullable();
            $table->string('logo_path', 500)->nullable();
            $table->text('address')->nullable();
            $table->string('city', 150)->nullable();
            $table->string('country', 100)->nullable();
            $table->char('currency', 3)->default('AOA');
            $table->string('locale', 10)->default('pt');
            $table->string('timezone', 100)->default('Africa/Luanda');
            $table->string('date_format', 50)->default('d/m/Y');
            $table->date('fiscal_year_start')->nullable();
            $table->enum('status', ['active', 'inactive', 'suspended'])->default('active');
            $table->json('config')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
