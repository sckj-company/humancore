<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class EmployeeEducation extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;
    use SoftDeletes;

    protected $table = 'employee_educations';

    protected $fillable = [
        'tenant_id',
        'employee_id',
        'created_by',
        'title',
        'reason',
        'sanction_warning',
        'occurred_on',
        'document_path',
        'document_name',
        'document_mime',
        'signed_document_path',
        'signed_document_name',
        'signed_document_mime',
        'signed_document_uploaded_at',
    ];

    protected function casts(): array
    {
        return [
            'occurred_on' => 'date',
            'signed_document_uploaded_at' => 'datetime',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
