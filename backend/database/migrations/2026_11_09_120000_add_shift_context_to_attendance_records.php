<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const EMPLOYEE_FOREIGN_KEY = 'attendance_records_employee_id_foreign';
    private const OLD_UNIQUE_INDEX = 'attendance_records_employee_id_date_unique';
    private const SHIFT_UNIQUE_INDEX = 'attendance_employee_date_shift_unique';

    public function up(): void
    {
        if (! Schema::hasColumn('attendance_records', 'shift_id')) {
            Schema::table('attendance_records', function (Blueprint $table) {
                $table->foreignId('shift_id')->nullable()->after('employee_id')->constrained()->nullOnDelete();
            });
        }

        if (! $this->hasIndex(self::SHIFT_UNIQUE_INDEX)) {
            Schema::table('attendance_records', function (Blueprint $table) {
                $table->unique(['employee_id', 'date', 'shift_id'], self::SHIFT_UNIQUE_INDEX);
            });
        }

        $this->dropEmployeeForeignKey();

        if ($this->hasIndex(self::OLD_UNIQUE_INDEX)) {
            Schema::table('attendance_records', function (Blueprint $table) {
                $table->dropUnique(self::OLD_UNIQUE_INDEX);
            });
        }

        $this->addEmployeeForeignKey();
    }

    public function down(): void
    {
        $this->dropEmployeeForeignKey();

        if ($this->hasIndex(self::SHIFT_UNIQUE_INDEX)) {
            Schema::table('attendance_records', function (Blueprint $table) {
                $table->dropUnique(self::SHIFT_UNIQUE_INDEX);
            });
        }

        if (! $this->hasIndex(self::OLD_UNIQUE_INDEX)) {
            Schema::table('attendance_records', function (Blueprint $table) {
                $table->unique(['employee_id', 'date'], self::OLD_UNIQUE_INDEX);
            });
        }

        $this->addEmployeeForeignKey();

        if (Schema::hasColumn('attendance_records', 'shift_id')) {
            Schema::table('attendance_records', function (Blueprint $table) {
                $table->dropConstrainedForeignId('shift_id');
            });
        }
    }

    private function hasIndex(string $name): bool
    {
        foreach (Schema::getIndexes('attendance_records') as $index) {
            if ($index['name'] === $name) {
                return true;
            }
        }

        return false;
    }

    private function hasEmployeeForeignKey(): bool
    {
        foreach (Schema::getForeignKeys('attendance_records') as $foreignKey) {
            if ($foreignKey['name'] === self::EMPLOYEE_FOREIGN_KEY) {
                return true;
            }
        }

        return false;
    }

    private function dropEmployeeForeignKey(): void
    {
        if ($this->hasEmployeeForeignKey()) {
            Schema::table('attendance_records', function (Blueprint $table) {
                $table->dropForeign(self::EMPLOYEE_FOREIGN_KEY);
            });
        }
    }

    private function addEmployeeForeignKey(): void
    {
        if (! $this->hasEmployeeForeignKey()) {
            Schema::table('attendance_records', function (Blueprint $table) {
                $table->foreign('employee_id', self::EMPLOYEE_FOREIGN_KEY)
                    ->references('id')
                    ->on('employees')
                    ->cascadeOnDelete();
            });
        }
    }
};
