<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Shift extends Model
{
    use Auditable, HasFactory, HasTenant, SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'name',
        'code',
        'start_time',
        'end_time',
        'break_minutes',
        'work_hours',
        'late_tolerance_minutes',
        'working_days',
        'color',
        'is_night_shift',
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'working_days' => 'array',
            'is_night_shift' => 'boolean',
            'is_active' => 'boolean',
            'work_hours' => 'decimal:2',
        ];
    }

    public function employeeSchedules()
    {
        return $this->hasMany(EmployeeSchedule::class);
    }
}
