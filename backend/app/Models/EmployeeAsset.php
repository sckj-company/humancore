<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class EmployeeAsset extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    public const CATEGORIES = [
        'computer' => 'Computador / Portátil',
        'phone' => 'Telemóvel / Tablet',
        'vehicle' => 'Viatura / Motorizada',
        'uniform' => 'Fardamento / EPI',
        'tool' => 'Ferramenta / Equipamento Técnico',
        'furniture' => 'Mobiliário',
        'access_card' => 'Cartão de Acesso / Chaves',
        'other' => 'Outro Activo',
    ];

    public const CONDITIONS = [
        'new' => 'Novo',
        'good' => 'Bom estado',
        'fair' => 'Uso normal / Razoável',
        'damaged' => 'Danificado / Avariado',
        'lost' => 'Extraviado / Perdido',
    ];

    public const STATUSES = [
        'assigned' => 'Atribuído / Em posse',
        'returned' => 'Devolvido',
        'damaged_pending' => 'Danificado (Pendente imputação)',
        'lost_unreturned' => 'Extraviado / Não devolvido',
        'maintenance' => 'Em manutenção',
    ];

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'name',
        'category',
        'asset_code',
        'serial_number',
        'brand_model',
        'condition',
        'status',
        'estimated_value',
        'chargeable_amount',
        'deduct_on_termination',
        'is_settled',
        'assigned_at',
        'expected_return_at',
        'returned_at',
        'assigned_by',
        'return_notes',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'estimated_value' => 'decimal:2',
            'chargeable_amount' => 'decimal:2',
            'deduct_on_termination' => 'boolean',
            'is_settled' => 'boolean',
            'assigned_at' => 'date',
            'expected_return_at' => 'date',
            'returned_at' => 'date',
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

    public function assignedByUser()
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    /**
     * Valor imputável ao funcionário em caso de rescisão ou dano/extravio pendente.
     */
    public function pendingLiabilityAmount(): float
    {
        if ($this->is_settled) {
            return 0.0;
        }

        if ($this->status === 'returned') {
            if (in_array($this->condition, ['damaged', 'lost'], true) && (float) $this->chargeable_amount > 0) {
                return round((float) $this->chargeable_amount, 2);
            }

            return 0.0;
        }

        if (in_array($this->status, ['damaged_pending', 'lost_unreturned'], true)) {
            $val = (float) $this->chargeable_amount > 0
                ? (float) $this->chargeable_amount
                : (float) $this->estimated_value;

            return round(max(0, $val), 2);
        }

        if ($this->status === 'assigned' && $this->deduct_on_termination) {
            $val = (float) $this->chargeable_amount > 0
                ? (float) $this->chargeable_amount
                : (float) $this->estimated_value;

            return round(max(0, $val), 2);
        }

        return 0.0;
    }
}
