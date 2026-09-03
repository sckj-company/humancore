<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceRecord extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'employee_id',
        'tenant_id',
        'date',
        'clock_in',
        'clock_out',
        'break_start',
        'break_end',
        'total_worked',
        'status',
        'late_minutes',
        'overtime_minutes',
        'qr_code_hash',
        'ip_address',
        'device_info',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'clock_in' => 'datetime',
            'clock_out' => 'datetime',
            'break_start' => 'datetime',
            'break_end' => 'datetime',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }
}
