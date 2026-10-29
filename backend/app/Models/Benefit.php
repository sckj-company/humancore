<?php

namespace App\Models;

use App\Traits\HasTenant;
use Database\Factories\BenefitFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Benefit extends Model
{
    /** @use HasFactory<BenefitFactory> */
    use HasFactory;

    use HasTenant;
    use SoftDeletes;

    public const TYPES = [
        'health_insurance' => 'Seguro de Saúde',
        'transport' => 'Subsídio de Transporte',
        'meal' => 'Subsídio de Alimentação',
        'housing' => 'Alojamento',
        'vehicle' => 'Veículo',
        'phone' => 'Telefone',
        'education' => 'Educação',
        'gym' => 'Ginásio',
        'other' => 'Outro',
    ];

    public const STATUSES = [
        'active' => 'Ativo',
        'inactive' => 'Inativo',
    ];

    public const AMOUNT_TYPES = [
        'fixed' => 'Valor fixo',
        'percentage' => 'Percentagem',
    ];

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'name',
        'benefit_type',
        'amount_type',
        'amount',
        'percentage',
        'is_taxable',
        'provider',
        'start_date',
        'end_date',
        'status',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'percentage' => 'decimal:2',
            'is_taxable' => 'boolean',
            'start_date' => 'date',
            'end_date' => 'date',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function getTypeLabelAttribute(): string
    {
        return self::TYPES[$this->benefit_type] ?? $this->benefit_type;
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }

    public function getStatusVariantAttribute(): string
    {
        return $this->status === 'active' ? 'success' : 'secondary';
    }

    public function getAmountTypeLabelAttribute(): string
    {
        return self::AMOUNT_TYPES[$this->amount_type] ?? $this->amount_type;
    }

    public function getAmountLabelAttribute(): string
    {
        if ($this->amount_type === 'percentage') {
            return $this->percentage.'%';
        }

        return number_format((float) $this->amount, 2, ',', '.').' Kz';
    }

    public function getIsCurrentAttribute(): bool
    {
        if ($this->status !== 'active') {
            return false;
        }

        if ($this->start_date && $this->start_date->isFuture()) {
            return false;
        }

        return ! $this->end_date || $this->end_date->isFuture();
    }
}
