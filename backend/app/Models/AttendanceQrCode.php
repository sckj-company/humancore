<?php

namespace App\Models;

use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AttendanceQrCode extends Model
{
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'hash',
        'action',
        'ip_address',
        'user_agent',
        'expires_at',
        'used_at',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at?->isPast() ?? true;
    }

    public function isUsed(): bool
    {
        return $this->used_at !== null;
    }

    public function isValid(): bool
    {
        return ! $this->isExpired() && ! $this->isUsed();
    }
}
