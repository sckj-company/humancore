<?php

namespace App\Models;

use App\Traits\HasTenant;
use Database\Factories\OnboardingTemplateFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class OnboardingTemplate extends Model
{
    /** @use HasFactory<OnboardingTemplateFactory> */
    use HasFactory;

    use HasTenant;
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'name',
        'description',
        'is_active',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function tasks()
    {
        return $this->hasMany(OnboardingTask::class, 'template_id');
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
