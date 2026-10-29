<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmailTemplate extends Model
{
    /** @use HasFactory<EmailTemplateFactory> */
    use Auditable;

    use HasFactory;
    use HasTenant;
    use SoftDeletes;

    public const EVENTS = [
        'employee_created' => 'Admissão de funcionário',
        'employee_terminated' => 'Desligamento de funcionário',
        'leave_requested' => 'Solicitação de férias',
        'leave_approved' => 'Férias aprovadas',
        'leave_rejected' => 'Férias rejeitadas',
        'payslip_available' => 'Recibo disponível',
        'payroll_processed' => 'Payroll processado',
        'contract_expiring' => 'Contrato a expirar',
        'document_expiring' => 'Documento a expirar',
        'custom' => 'Personalizado',
    ];

    public const DEFAULT_VARIABLES = [
        'employee_name',
        'employee_code',
        'employee_email',
        'company_name',
        'period_name',
        'start_date',
        'end_date',
        'amount',
        'link',
    ];

    protected $fillable = [
        'tenant_id',
        'created_by',
        'name',
        'code',
        'event',
        'subject',
        'body',
        'variables',
        'is_active',
        'is_system',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'variables' => 'array',
            'is_active' => 'boolean',
            'is_system' => 'boolean',
        ];
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function render(array $data): array
    {
        $variables = $this->variables ?? self::DEFAULT_VARIABLES;

        $replace = [];
        foreach ($variables as $variable) {
            $replace['{{'.$variable.'}}'] = (string) ($data[$variable] ?? '');
        }

        return [
            'subject' => strtr($this->subject, $replace),
            'body' => strtr($this->body, $replace),
        ];
    }

    public function getEventLabelAttribute(): string
    {
        return self::EVENTS[$this->event] ?? $this->event ?? '';
    }
}
