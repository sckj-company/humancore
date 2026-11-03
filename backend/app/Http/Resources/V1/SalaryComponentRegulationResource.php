<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SalaryComponentRegulationResource extends JsonResource
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
            'salary_component_id' => $this->salary_component_id,
            'country_code' => $this->country_code,
            'regime_code' => $this->regime_code,
            'version' => $this->version,
            'effective_from' => $this->effective_from?->toDateString(),
            'effective_to' => $this->effective_to?->toDateString(),
            'employee_inss_applicable' => $this->employee_inss_applicable,
            'employer_inss_applicable' => $this->employer_inss_applicable,
            'irt_applicable' => $this->irt_applicable,
            'status' => $this->status,
            'legal_source' => $this->legal_source,
            'legal_reference' => $this->legal_reference,
            'legal_document_name' => $this->legal_document_path ? basename($this->legal_document_path) : null,
            'has_legal_document' => $this->legal_document_path !== null,
            'validated_at' => $this->validated_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
            'revocation_reason' => $this->revocation_reason,
            'revoked_by' => $this->whenLoaded('revokedBy', fn () => $this->revokedBy ? [
                'id' => $this->revokedBy->id,
                'name' => $this->revokedBy->name,
            ] : null),
            'validated_by' => $this->whenLoaded('validatedBy', fn () => $this->validatedBy ? [
                'id' => $this->validatedBy->id,
                'name' => $this->validatedBy->name,
            ] : null),
            'component' => $this->whenLoaded('component', fn () => $this->component ? [
                'id' => $this->component->id,
                'name' => $this->component->name,
                'code' => $this->component->code,
                'type' => $this->component->type,
            ] : null),
        ];
    }
}
