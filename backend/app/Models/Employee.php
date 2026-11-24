<?php

namespace App\Models;

use App\Traits\Auditable;
use App\Traits\HasTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\DB;

class Employee extends Model
{
    use Auditable;
    use HasFactory;
    use HasTenant;
    use SoftDeletes;

    protected static function booted(): void
    {
        static::saved(function (Employee $employee): void {
            if ($employee->department_id !== null) {
                $now = now();
                DB::table('department_employee')->insertOrIgnore([
                    'department_id' => (int) $employee->department_id,
                    'employee_id' => (int) $employee->id,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            }
            User::clearDepartmentPermissionCache();
        });
        static::deleted(static fn () => User::clearDepartmentPermissionCache());
    }

    protected $fillable = [
        'tenant_id',
        'user_id',
        'department_id',
        'position_id',
        'manager_id',
        'employee_code',
        'biometric_code',
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
        'overtime_hourly_rate',
        'photo_path',
        'status',
        'approval_status',
        'approved_by',
        'approved_at',
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
            'approved_at' => 'datetime',
            'overtime_hourly_rate' => 'decimal:2',
        ];
    }

    public function isApproved(): bool
    {
        return ($this->approval_status ?? 'approved') === 'approved';
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
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

    public function departments()
    {
        return $this->belongsToMany(Department::class, 'department_employee')->withTimestamps();
    }

    public function attachDepartment(int $departmentId): void
    {
        $this->departments()->syncWithoutDetaching([$departmentId]);

        if ($this->department_id === null) {
            $this->update(['department_id' => $departmentId]);
        } else {
            User::clearDepartmentPermissionCache();
        }
    }

    public function detachDepartment(int $departmentId): void
    {
        $this->departments()->detach($departmentId);

        if ((int) $this->department_id === $departmentId) {
            $nextDeptId = DB::table('department_employee')
                ->where('employee_id', $this->id)
                ->orderBy('id')
                ->value('department_id');

            $this->update(['department_id' => $nextDeptId ? (int) $nextDeptId : null]);
        } else {
            User::clearDepartmentPermissionCache();
        }
    }

    public function belongsToDepartment(int $departmentId): bool
    {
        if ((int) $this->department_id === $departmentId) {
            return true;
        }

        if ($this->relationLoaded('departments')) {
            return $this->departments->contains('id', $departmentId);
        }

        return $this->departments()->whereKey($departmentId)->exists();
    }

    /**
     * @return array<int, array{id: int, name: string}>
     */
    public function resolvedDepartmentsPayload(): array
    {
        $items = collect();

        if ($this->relationLoaded('departments')) {
            $items = $this->departments->map(fn (Department $d) => [
                'id' => (int) $d->id,
                'name' => (string) $d->name,
            ]);
        } elseif ($this->relationLoaded('department') && $this->department) {
            $items = collect([[
                'id' => (int) $this->department->id,
                'name' => (string) $this->department->name,
            ]]);
        }

        if ($this->department_id && ! $items->contains('id', (int) $this->department_id)) {
            $primaryName = $this->relationLoaded('department') ? $this->department?->name : null;
            if ($primaryName !== null) {
                $items->prepend(['id' => (int) $this->department_id, 'name' => (string) $primaryName]);
            }
        }

        return $items->unique('id')->values()->all();
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

    public function latestContract()
    {
        return $this->hasOne(EmployeeContract::class)->latestOfMany();
    }

    public function salaryComponents()
    {
        return $this->hasMany(EmployeeSalaryComponent::class);
    }

    public function deductions()
    {
        return $this->hasMany(Deduction::class);
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

    public function educations()
    {
        return $this->hasMany(EmployeeEducation::class);
    }

    public function assets()
    {
        return $this->hasMany(EmployeeAsset::class);
    }

    public function payrollRecords()
    {
        return $this->hasMany(PayrollRecord::class);
    }

    public function schedules()
    {
        return $this->hasMany(EmployeeSchedule::class);
    }

    public function activeSchedule()
    {
        return $this->hasOne(EmployeeSchedule::class)->where('is_active', true)->latestOfMany();
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
