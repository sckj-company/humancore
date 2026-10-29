<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use Auditable, HasFactory, HasTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'date',
        'is_recurring',
        'type',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'is_recurring' => 'boolean',
        ];
    }
}
