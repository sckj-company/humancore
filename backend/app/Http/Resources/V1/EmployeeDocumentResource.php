<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmployeeDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'employee_id' => $this->employee_id,
            'name' => $this->name,
            'document_type' => $this->document_type,
            'original_name' => $this->original_name,
            'file_path' => $this->file_path,
            'file_url' => str_starts_with($this->file_path ?? '', 'http') ? $this->file_path : url($this->file_path ?? ''),
            'mime_type' => $this->mime_type,
            'file_size' => $this->file_size,
            'size_label' => $this->sizeLabel(),
            'expiry_date' => $this->expiry_date?->format('Y-m-d'),
            'is_expiring' => $this->isExpiring(),
            'is_expired' => $this->isExpired(),
            'notes' => $this->notes,
            'is_confidential' => $this->is_confidential,
            'created_at' => $this->created_at?->toIso8601String(),
            'employee' => $this->whenLoaded('employee', fn () => [
                'id' => $this->employee->id,
                'full_name' => $this->employee->full_name,
                'employee_code' => $this->employee->employee_code,
            ]),
        ];
    }

    protected function sizeLabel(): string
    {
        $bytes = (int) $this->file_size;
        if ($bytes >= 1_048_576) {
            return round($bytes / 1_048_576, 1).' MB';
        }
        if ($bytes >= 1024) {
            return round($bytes / 1024, 1).' KB';
        }

        return $bytes.' B';
    }

    protected function isExpiring(): bool
    {
        if (! $this->expiry_date) {
            return false;
        }

        return $this->expiry_date->isAfter(now()) && $this->expiry_date->isBefore(now()->addDays(60));
    }

    protected function isExpired(): bool
    {
        return $this->expiry_date ? $this->expiry_date->isBefore(now()->startOfDay()) : false;
    }
}
