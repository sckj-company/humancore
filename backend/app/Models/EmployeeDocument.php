<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Database\Factories\EmployeeDocumentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeDocument extends Model
{
    /** @use HasFactory<EmployeeDocumentFactory> */
    use HasFactory;

    use Auditable;
    use HasTenant;
    use SoftDeletes;

    protected $fillable = [
        'employee_id',
        'tenant_id',
        'uploader_id',
        'name',
        'document_type',
        'file_path',
        'original_name',
        'mime_type',
        'file_size',
        'expiry_date',
        'notes',
        'is_confidential',
        'is_verified',
        'verified_by',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'expiry_date' => 'date',
            'is_confidential' => 'boolean',
            'is_verified' => 'boolean',
            'verified_at' => 'datetime',
        ];
    }

    public function verifier()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploader_id');
    }
}
