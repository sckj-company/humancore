<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TenantMonthlyUsage extends Model
{
    protected $fillable = [
        'tenant_id',
        'year_month',
        'ocr_requests',
        'payroll_runs',
    ];

    protected function casts(): array
    {
        return [
            'ocr_requests' => 'integer',
            'payroll_runs' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }
}
