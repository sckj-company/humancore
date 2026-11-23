<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PayrollPeriodReportDocument extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    public const TYPES = [
        'inss_guide',
        'inss_payment_proof',
        'payslips_summary_pdf',
        'payroll_sheet',
        'irt_guide',
        'irt_payment_proof',
        'bank_transfer_proof',
        'attendance_report',
        'other',
    ];

    protected $fillable = [
        'tenant_id',
        'payroll_period_report_id',
        'document_type',
        'title',
        'file_path',
        'file_name',
        'mime_type',
        'file_size',
        'is_paid',
        'is_sent',
        'paid_at',
        'sent_at',
        'notes',
        'uploaded_by',
    ];

    protected function casts(): array
    {
        return [
            'is_paid' => 'boolean',
            'is_sent' => 'boolean',
            'paid_at' => 'datetime',
            'sent_at' => 'datetime',
            'file_size' => 'integer',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function report(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriodReport::class, 'payroll_period_report_id');
    }

    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
