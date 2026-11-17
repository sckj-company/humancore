<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeEducationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'tenant_id' => $this->tenant_id,
            'employee_id' => $this->employee_id,
            'is_general' => $this->employee_id === null,
            'title' => $this->title,
            'reason' => $this->reason,
            'sanction_warning' => $this->sanction_warning,
            'occurred_on' => $this->occurred_on?->format('Y-m-d'),
            'has_document' => filled($this->document_path),
            'document_name' => $this->document_name,
            'document_mime' => $this->document_mime,
            'document_url' => filled($this->document_path) && str_starts_with((string) $this->document_path, 'http')
                ? $this->document_path
                : null,
            'has_signed_document' => filled($this->signed_document_path),
            'signed_document_name' => $this->signed_document_name,
            'signed_document_mime' => $this->signed_document_mime,
            'signed_document_url' => filled($this->signed_document_path) && str_starts_with((string) $this->signed_document_path, 'http')
                ? $this->signed_document_path
                : null,
            'signed_document_uploaded_at' => $this->signed_document_uploaded_at?->toISOString(),
            'creator' => $this->whenLoaded('creator', fn () => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
            ] : null),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
