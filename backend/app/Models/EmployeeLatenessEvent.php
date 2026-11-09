<?php

namespace App\Models;

use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Model;

class EmployeeLatenessEvent extends Model
{
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'event_key',
        'event_type',
        'occurred_on',
        'week_start',
        'minutes',
        'amount',
        'details',
    ];

    protected function casts(): array
    {
        return [
            'occurred_on' => 'date',
            'week_start' => 'date',
            'amount' => 'decimal:2',
            'details' => 'array',
        ];
    }
}
