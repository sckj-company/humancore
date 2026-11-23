<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayrollPeriodReportResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $documents = $this->relationLoaded('documents') ? $this->documents : collect();

        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'payroll_period_id' => $this->payroll_period_id,
            'title' => $this->title,
            'notes' => $this->notes,
            'inss_guide_sent' => (bool) $this->inss_guide_sent,
            'inss_payment_proof_sent' => (bool) $this->inss_payment_proof_sent,
            'inss_paid' => (bool) $this->inss_paid,
            'payslips_summary_sent' => (bool) $this->payslips_summary_sent,
            'payroll_sheet_sent' => (bool) $this->payroll_sheet_sent,
            'is_summary_complete' => (bool) $this->is_summary_complete,
            'submitted_at' => $this->submitted_at?->toIso8601String(),
            'updated_by' => $this->updated_by,
            'updated_by_user' => $this->whenLoaded('updatedBy', fn () => $this->updatedBy ? [
                'id' => $this->updatedBy->id,
                'name' => $this->updatedBy->name,
            ] : null),
            'has_inss_payment_proof' => $this->hasInssPaymentProof(),
            'mandatory_status' => $this->mandatoryStatus(),
            'documents_count' => $documents->count(),
            'documents' => $documents->map(fn ($doc) => [
                'id' => $doc->id,
                'document_type' => $doc->document_type,
                'title' => $doc->title,
                'file_name' => $doc->file_name,
                'mime_type' => $doc->mime_type,
                'file_size' => $doc->file_size,
                'is_paid' => (bool) $doc->is_paid,
                'is_sent' => (bool) $doc->is_sent,
                'paid_at' => $doc->paid_at?->toIso8601String(),
                'sent_at' => $doc->sent_at?->toIso8601String(),
                'notes' => $doc->notes,
                'uploaded_by' => $doc->uploaded_by,
                'uploaded_by_user' => $doc->relationLoaded('uploadedBy') && $doc->uploadedBy ? [
                    'id' => $doc->uploadedBy->id,
                    'name' => $doc->uploadedBy->name,
                ] : null,
                'created_at' => $doc->created_at?->toIso8601String(),
                'updated_at' => $doc->updated_at?->toIso8601String(),
            ])->values()->all(),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
