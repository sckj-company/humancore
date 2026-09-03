<?php

namespace App\Models;

use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SalaryComponent extends Model
{
    use HasFactory;
    use HasTenant;

    protected $fillable = [
        'tenant_id',
        'name',
        'code',
        'type',
        'calculation_type',
        'default_value',
        'percentage_of',
        'formula',
        'is_taxable',
        'is_mandatory',
        'priority',
        'applies_to',
        'effective_from',
        'effective_to',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'default_value' => 'decimal:4',
            'is_taxable' => 'boolean',
            'is_mandatory' => 'boolean',
            'priority' => 'integer',
            'applies_to' => 'array',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function employeeComponents()
    {
        return $this->hasMany(EmployeeSalaryComponent::class);
    }

    public function scopeEarning()
    {
        return $this->where('type', 'earning');
    }

    public function scopeDeduction()
    {
        return $this->where('type', 'deduction');
    }
}
