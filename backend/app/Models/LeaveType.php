<?php

namespace App\Models;

use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class LeaveType extends Model
{
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'code',
        'category',
        'days_per_year',
        'is_paid',
        'requires_approval',
        'requires_document',
        'carry_over_days',
        'max_consecutive_days',
        'is_active',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'days_per_year' => 'integer',
            'is_paid' => 'boolean',
            'requires_approval' => 'boolean',
            'requires_document' => 'boolean',
            'carry_over_days' => 'integer',
            'max_consecutive_days' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function requests()
    {
        return $this->hasMany(LeaveRequest::class);
    }
}
