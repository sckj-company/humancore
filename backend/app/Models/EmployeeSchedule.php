<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EmployeeSchedule extends Model
{
    use Auditable, HasFactory, HasTenant;

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'shift_id',
        'effective_from',
        'effective_to',
        'custom_days',
        'is_active',
        'notes',
        'assigned_by',
    ];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'effective_to' => 'date',
            'custom_days' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function shift()
    {
        return $this->belongsTo(Shift::class);
    }

    public function assignedBy()
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }
}
