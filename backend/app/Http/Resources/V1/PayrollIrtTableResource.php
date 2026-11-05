<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PayrollIrtTableResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'country_code' => $this->country_code,
            'regime_code' => $this->regime_code,
            'version' => $this->version,
            'effective_from' => $this->effective_from?->toDateString(),
            'effective_to' => $this->effective_to?->toDateString(),
            'brackets' => $this->brackets,
            'status' => $this->status,
            'legal_source' => $this->legal_source,
            'legal_reference' => $this->legal_reference,
            'legal_document_name' => $this->legal_document_path ? basename($this->legal_document_path) : null,
            'legal_document_url' => $this->legal_document_path,
            'has_legal_document' => $this->legal_document_path !== null,
            'validated_at' => $this->validated_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
            'revocation_reason' => $this->revocation_reason,
            'validated_by' => $this->whenLoaded('validatedBy', fn () => $this->validatedBy ? [
                'id' => $this->validatedBy->id,
                'name' => $this->validatedBy->name,
            ] : null),
            'revoked_by' => $this->whenLoaded('revokedBy', fn () => $this->revokedBy ? [
                'id' => $this->revokedBy->id,
                'name' => $this->revokedBy->name,
            ] : null),
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
