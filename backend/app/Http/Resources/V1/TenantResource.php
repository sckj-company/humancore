<?php

namespace App\Http\Resources\V1;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TenantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                 => $this->id,
            'name'               => $this->name,
            'slug'               => $this->slug,
            // Contactos
            'email'              => $this->email,
            'phone'              => $this->phone,
            'website'            => $this->website,
            // Identificação fiscal (Angola)
            'tax_id'             => $this->tax_id,
            'inss_number'        => $this->inss_number,
            'legal_entity_type'  => $this->legal_entity_type,
            'economic_sector'    => $this->economic_sector,
            // Morada
            'logo_path'          => $this->logo_path,
            'address'            => $this->address,
            'city'               => $this->city,
            'province'           => $this->province,
            'country'            => $this->country,
            'postal_code'        => $this->postal_code,
            // Configurações
            'currency'           => $this->currency,
            'locale'             => $this->locale,
            'timezone'           => $this->timezone,
            'date_format'        => $this->date_format,
            'status'             => $this->status,
        ];
    }
}
