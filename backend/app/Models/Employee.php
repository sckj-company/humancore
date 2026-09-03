<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Employee extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;
    use SoftDeletes;

    protected $fillable = [
        'tenant_id',
        'user_id',
        'department_id',
        'position_id',
        'manager_id',
        'employee_code',
        'first_name',
        'last_name',
        'email',
        'phone',
        'alternative_phone',
        'birth_date',
        'gender',
        'marital_status',
        'nationality',
        'address',
        'city',
        'state',
        'country',
        'postal_code',
        'id_document_type',
        'id_document_number',
        'id_document_expiry',
        'tax_id',
        'social_security_id',
        'photo_path',
        'status',
        'hired_at',
        'probation_end',
        'termination_at',
        'termination_reason',
    ];

    protected function casts(): array
    {
        return [
            'birth_date' => 'date',
            'id_document_expiry' => 'date',
            'hired_at' => 'date',
            'probation_end' => 'date',
            'termination_at' => 'date',
        ];
    }

    public function tenant()
    {
        return $this->belongsTo(Tenant::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function department()
    {
        return $this->belongsTo(Department::class);
    }

    public function position()
    {
        return $this->belongsTo(Position::class);
    }

    public function manager()
    {
        return $this->belongsTo(self::class, 'manager_id');
    }

    public function subordinates()
    {
        return $this->hasMany(self::class, 'manager_id');
    }

    public function contracts()
    {
        return $this->hasMany(EmployeeContract::class);
    }

    public function activeContract()
    {
        return $this->hasOne(EmployeeContract::class)
            ->where('is_active', true)
            ->latestOfMany();
    }

    public function salaryComponents()
    {
        return $this->hasMany(EmployeeSalaryComponent::class);
    }

    public function documents()
    {
        return $this->hasMany(EmployeeDocument::class);
    }

    public function attendanceRecords()
    {
        return $this->hasMany(AttendanceRecord::class);
    }

    public function leaveRequests()
    {
        return $this->hasMany(LeaveRequest::class);
    }

    public function payrollRecords()
    {
        return $this->hasMany(PayrollRecord::class);
    }

    public function getFullNameAttribute(): string
    {
        return trim($this->first_name.' '.$this->last_name);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        return $query->where(function (Builder $q) use ($term) {
            $q->where('first_name', 'like', "%{$term}%")
                ->orWhere('last_name', 'like', "%{$term}%")
                ->orWhere('employee_code', 'like', "%{$term}%")
                ->orWhere('email', 'like', "%{$term}%")
                ->orWhere('tax_id', 'like', "%{$term}%");
        });
    }
}
