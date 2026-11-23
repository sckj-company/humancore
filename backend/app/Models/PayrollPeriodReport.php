<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PayrollPeriodReport extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;

    public const REPORTABLE_PERIOD_STATUSES = ['approved', 'closed', 'paid'];

    public const MANDATORY_DOCUMENT_TYPES = [
        'inss_guide',
        'inss_payment_proof',
        'payslips_summary_pdf',
        'payroll_sheet',
    ];

    protected $fillable = [
        'tenant_id',
        'payroll_period_id',
        'title',
        'notes',
        'inss_guide_sent',
        'inss_payment_proof_sent',
        'inss_paid',
        'payslips_summary_sent',
        'payroll_sheet_sent',
        'is_summary_complete',
        'submitted_at',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'inss_guide_sent' => 'boolean',
            'inss_payment_proof_sent' => 'boolean',
            'inss_paid' => 'boolean',
            'payslips_summary_sent' => 'boolean',
            'payroll_sheet_sent' => 'boolean',
            'is_summary_complete' => 'boolean',
            'submitted_at' => 'datetime',
        ];
    }

    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class);
    }

    public function period(): BelongsTo
    {
        return $this->belongsTo(PayrollPeriod::class, 'payroll_period_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(PayrollPeriodReportDocument::class)->orderBy('id');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function latestDocumentOfType(string $type): ?PayrollPeriodReportDocument
    {
        if ($this->relationLoaded('documents')) {
            return $this->documents
                ->where('document_type', $type)
                ->sortByDesc('id')
                ->first();
        }

        return $this->documents()
            ->where('document_type', $type)
            ->latest('id')
            ->first();
    }

    public function inssPaymentProofDocument(): ?PayrollPeriodReportDocument
    {
        return $this->latestDocumentOfType('inss_payment_proof');
    }

    public function hasInssPaymentProof(): bool
    {
        return $this->inssPaymentProofDocument() !== null;
    }

    /**
     * Summarize attachment, sent, and payment state for each mandatory compliance document.
     *
     * @return array<string, mixed>
     */
    public function mandatoryStatus(): array
    {
        $sentFieldMap = [
            'inss_guide' => 'inss_guide_sent',
            'inss_payment_proof' => 'inss_payment_proof_sent',
            'payslips_summary_pdf' => 'payslips_summary_sent',
            'payroll_sheet' => 'payroll_sheet_sent',
        ];

        $items = [];
        $allAttached = true;
        $allSent = true;

        foreach (self::MANDATORY_DOCUMENT_TYPES as $type) {
            $doc = $this->latestDocumentOfType($type);
            $sentField = $sentFieldMap[$type];
            $attached = $doc !== null;
            $isSent = (bool) ($this->{$sentField} || ($doc?->is_sent ?? false));
            $isPaid = $type === 'inss_payment_proof'
                ? (bool) ($this->inss_paid || ($doc?->is_paid ?? false))
                : (bool) ($doc?->is_paid ?? false);

            if (! $attached) {
                $allAttached = false;
            }
            if (! $isSent) {
                $allSent = false;
            }

            $items[$type] = [
                'attached' => $attached,
                'document_id' => $doc?->id,
                'file_name' => $doc?->file_name,
                'is_sent' => $isSent,
                'is_paid' => $isPaid,
            ];
        }

        return array_merge($items, [
            'all_mandatory_attached' => $allAttached,
            'all_mandatory_sent' => $allSent,
            'has_inss_payment_proof' => $items['inss_payment_proof']['attached'],
            'inss_paid' => (bool) ($this->inss_paid || $items['inss_payment_proof']['is_paid']),
            'is_summary_complete' => (bool) $this->is_summary_complete,
        ]);
    }
}
