<?php

namespace App\Models;

use App\Traits\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Tenant extends Model
{
    use Auditable;
    use HasFactory;
    use SoftDeletes;

    protected $fillable = [
        'name',
        'slug',
        'email',
        'phone',
        'tax_id',           // NIF angolano (10 dígitos numéricos)
        'inss_number',      // Nº INSS
        'legal_entity_type',// lda, sa, unipessoal, em, cooperativa, epe, ong
        'economic_sector',  // Sector de actividade económica
        'logo_path',
        'address',
        'city',
        'province',         // Província angolana
        'country',
        'postal_code',
        'website',
        'currency',
        'locale',
        'timezone',
        'date_format',
        'fiscal_year_start',
        'status',
        'config',
    ];

    protected function casts(): array
    {
        return [
            'fiscal_year_start' => 'date',
            'config' => 'array',
        ];
    }

    public function branches()
    {
        return $this->hasMany(Branch::class);
    }

    public function departments()
    {
        return $this->hasMany(Department::class);
    }

    public function positions()
    {
        return $this->hasMany(Position::class);
    }

    public function employees()
    {
        return $this->hasMany(Employee::class);
    }

    public function users()
    {
        return $this->hasMany(User::class);
    }

    public function settings()
    {
        return $this->hasMany(Setting::class);
    }

    public function getSetting(string $key, mixed $default = null): mixed
    {
        $setting = $this->settings()
            ->where('key', $key)
            ->first();

        return $setting?->value ?? $default;
    }
}
