<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('employee_assets')) {
            Schema::create('employee_assets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained('tenants')->cascadeOnDelete();
                $table->foreignId('employee_id')->constrained('employees')->cascadeOnDelete();
                $table->string('name');
                $table->string('category', 50)->default('computer');
                $table->string('asset_code', 100)->nullable();
                $table->string('serial_number', 150)->nullable();
                $table->string('brand_model', 150)->nullable();
                $table->string('condition', 40)->default('good');
                $table->string('status', 40)->default('assigned');
                $table->decimal('estimated_value', 15, 2)->default(0);
                $table->decimal('chargeable_amount', 15, 2)->default(0);
                $table->boolean('deduct_on_termination')->default(true);
                $table->boolean('is_settled')->default(false);
                $table->date('assigned_at')->nullable();
                $table->date('expected_return_at')->nullable();
                $table->date('returned_at')->nullable();
                $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('return_notes')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'employee_id', 'status']);
            });
        }

        Schema::table('employee_contracts', function (Blueprint $table) {
            if (! Schema::hasColumn('employee_contracts', 'termination_type')) {
                $table->string('termination_type', 60)->nullable()->after('notes');
                $table->text('termination_reason')->nullable()->after('termination_type');
                $table->date('termination_date')->nullable()->after('termination_reason');
                $table->integer('notice_days_required')->default(0)->after('termination_date');
                $table->integer('notice_days_served')->default(0)->after('notice_days_required');
                $table->decimal('unused_vacation_days', 6, 2)->default(0)->after('notice_days_served');
                $table->json('settlement_breakdown')->nullable()->after('unused_vacation_days');
                $table->decimal('gross_settlement', 15, 2)->nullable()->after('settlement_breakdown');
                $table->decimal('total_deductions_settlement', 15, 2)->nullable()->after('gross_settlement');
                $table->decimal('net_settlement', 15, 2)->nullable()->after('total_deductions_settlement');
                $table->foreignId('terminated_by')->nullable()->after('net_settlement')->constrained('users')->nullOnDelete();
                $table->timestamp('terminated_at')->nullable()->after('terminated_by');
            }
        });
    }

    public function down(): void
    {
        Schema::table('employee_contracts', function (Blueprint $table) {
            $columns = [
                'termination_type',
                'termination_reason',
                'termination_date',
                'notice_days_required',
                'notice_days_served',
                'unused_vacation_days',
                'settlement_breakdown',
                'gross_settlement',
                'total_deductions_settlement',
                'net_settlement',
                'terminated_by',
                'terminated_at',
            ];
            if (Schema::hasColumn('employee_contracts', 'terminated_by')) {
                $table->dropConstrainedForeignId('terminated_by');
            }
            $existing = array_filter($columns, fn ($col) => $col !== 'terminated_by' && Schema::hasColumn('employee_contracts', $col));
            if ($existing !== []) {
                $table->dropColumn($existing);
            }
        });

        Schema::dropIfExists('employee_assets');
    }
};
