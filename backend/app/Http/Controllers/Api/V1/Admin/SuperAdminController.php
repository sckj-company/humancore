<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\TenantResource;
use App\Models\Employee;
use App\Models\LeaveType;
use App\Models\SalaryComponent;
use App\Models\Tenant;
use App\Models\User;
use App\Services\Tenant\TenantManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class SuperAdminController extends BaseController
{
    public function dashboard(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $totalTenants = Tenant::query()->count();
        $activeTenants = Tenant::query()->where('status', 'active')->count();
        $inactiveTenants = Tenant::query()->where('status', 'inactive')->count();
        $suspendedTenants = Tenant::query()->where('status', 'suspended')->count();
        $totalEmployees = Employee::query()->count();
        $activeEmployees = Employee::query()->where('status', 'active')->count();
        $totalUsers = User::query()->count();
        $superAdmins = User::query()->whereHas('roles', fn ($q) => $q->where('name', 'super-admin'))->count();

        $tenantTrend = collect(range(11, 0))->map(function ($monthsAgo) {
            $month = now()->startOfMonth()->subMonths($monthsAgo);

            return [
                'month' => $month->format('Y-m'),
                'label' => $month->locale(app()->getLocale())->translatedFormat('M/y'),
                'count' => Tenant::query()
                    ->whereYear('created_at', $month->year)
                    ->whereMonth('created_at', $month->month)
                    ->count(),
            ];
        });

        $segments = [
            'small' => 0,
            'medium' => 0,
            'large' => 0,
        ];

        $byTenant = Tenant::query()
            ->withCount('employees')
            ->orderByDesc('created_at')
            ->get()
            ->map(function (Tenant $tenant) use (&$segments) {
                $count = $tenant->employees_count;
                if ($count <= 10) {
                    $segments['small']++;
                } elseif ($count <= 50) {
                    $segments['medium']++;
                } else {
                    $segments['large']++;
                }

                return [
                    'id' => $tenant->id,
                    'name' => $tenant->name,
                    'slug' => $tenant->slug,
                    'status' => $tenant->status,
                    'employees' => $tenant->employees_count,
                    'created_at' => $tenant->created_at?->toIso8601String(),
                ];
            });

        return $this->success([
            'kpis' => [
                'total_tenants' => $totalTenants,
                'active_tenants' => $activeTenants,
                'suspended_tenants' => $suspendedTenants,
                'total_employees' => $totalEmployees,
                'active_employees' => $activeEmployees,
                'total_users' => $totalUsers,
                'super_admins' => $superAdmins,
            ],
            'tenant_trend' => $tenantTrend,
            'by_status' => [
                'active' => $activeTenants,
                'inactive' => $inactiveTenants,
                'suspended' => $suspendedTenants,
            ],
            'segments' => $segments,
            'by_tenant' => $byTenant,
        ]);
    }

    public function tenants(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Tenant::class);

        $tenants = Tenant::query()
            ->withCount(['employees', 'users', 'departments'])
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->string('search');
                $q->where('name', 'like', "%{$term}%")
                    ->orWhere('slug', 'like', "%{$term}%")
                    ->orWhere('email', 'like', "%{$term}%")
                    ->orWhere('tax_id', 'like', "%{$term}%");
            })
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderBy($request->string('sort_by', 'created_at'), $request->string('sort_dir', 'desc'))
            ->paginate($request->integer('per_page', 20));

        return $this->paginated($tenants->through(fn (Tenant $tenant) => array_merge(
            (new TenantResource($tenant))->resolve(),
            [
                'stats' => [
                    'employees' => $tenant->employees_count,
                    'departments' => $tenant->departments_count,
                    'users' => $tenant->users_count,
                ],
                'created_at' => $tenant->created_at?->toIso8601String(),
                'updated_at' => $tenant->updated_at?->toIso8601String(),
            ],
        )));
    }

    public function storeTenant(Request $request): JsonResponse
    {
        $this->authorize('create', Tenant::class);

        $data = $request->validate([
            'name'               => ['required', 'string', 'max:255'],
            'slug'               => ['required', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', 'unique:tenants,slug'],
            'email'              => ['nullable', 'email', 'max:255'],
            'phone'              => ['nullable', 'string', 'max:50'],
            'tax_id'             => ['nullable', 'string', 'max:100'],
            'address'            => ['nullable', 'string', 'max:500'],
            'city'               => ['nullable', 'string', 'max:150'],
            'country'            => ['nullable', 'string', 'max:100'],
            'currency'           => ['nullable', 'string', 'size:3'],
            'locale'             => ['nullable', 'string', 'max:10'],
            'timezone'           => ['nullable', 'string', 'max:100'],
            'status'             => ['nullable', 'in:active,inactive,suspended'],
            // Admin user (optional)
            'admin_name'         => ['nullable', 'string', 'max:255'],
            'admin_email'        => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'admin_password'     => ['nullable', 'string', 'min:8'],
        ]);

        $tenantData = collect($data)->except(['admin_name', 'admin_email', 'admin_password'])->toArray();
        $tenantData['currency'] = $tenantData['currency'] ?? 'AOA';
        $tenantData['locale']   = $tenantData['locale']   ?? 'pt';
        $tenantData['timezone'] = $tenantData['timezone'] ?? 'Africa/Luanda';
        $tenantData['status']   = $tenantData['status']   ?? 'active';

        $tenant = DB::transaction(function () use ($tenantData, $data) {
            $tenant = Tenant::query()->create($tenantData);

            /** @var TenantManager $manager */
            $manager = app(TenantManager::class);
            $manager->set($tenant);

            // Create admin user if credentials were provided
            if (! empty($data['admin_email'])) {
                $admin = User::query()->create([
                    'tenant_id'         => $tenant->id,
                    'name'              => $data['admin_name'] ?? 'Administrador',
                    'email'             => $data['admin_email'],
                    'password'          => Hash::make($data['admin_password'] ?? 'password'),
                    'locale'            => $tenantData['locale'],
                    'timezone'          => $tenantData['timezone'],
                    'email_verified_at' => now(),
                    'is_active'         => true,
                ]);
                $admin->assignRole('admin');
            }

            // Seed default leave types
            $leaveDefaults = [
                ['name' => 'Férias Anuais',      'code' => 'vacation',    'category' => 'vacation',  'days_per_year' => 22, 'is_paid' => true],
                ['name' => 'Doença',             'code' => 'sick',        'category' => 'sick',      'days_per_year' => 30, 'is_paid' => true],
                ['name' => 'Casamento',          'code' => 'marriage',    'category' => 'family',    'days_per_year' => 3,  'is_paid' => true],
                ['name' => 'Falecimento',        'code' => 'bereavement', 'category' => 'family',    'days_per_year' => 5,  'is_paid' => true],
                ['name' => 'Licença sem Vencimento', 'code' => 'unpaid', 'category' => 'unpaid',   'days_per_year' => 30, 'is_paid' => false],
                ['name' => 'Maternidade',        'code' => 'maternity',   'category' => 'maternity', 'days_per_year' => 90, 'is_paid' => true],
            ];
            foreach ($leaveDefaults as $lt) {
                LeaveType::query()->withoutGlobalScopes()->firstOrCreate(
                    ['tenant_id' => $tenant->id, 'code' => $lt['code']],
                    $lt,
                );
            }

            // Seed default salary components
            $salaryDefaults = [
                ['code' => 'base_salary',         'name' => 'Salário Base',             'type' => 'earning',   'calculation_type' => 'fixed',      'is_mandatory' => true,  'priority' => 10],
                ['code' => 'meal_allowance',      'name' => 'Subsídio de Refeição',     'type' => 'benefit',   'calculation_type' => 'fixed',      'default_value' => 5000, 'is_mandatory' => true, 'priority' => 20],
                ['code' => 'transport_allowance', 'name' => 'Subsídio de Transporte',   'type' => 'benefit',   'calculation_type' => 'fixed',      'default_value' => 30000,'is_mandatory' => true, 'priority' => 21],
                ['code' => 'overtime',            'name' => 'Horas Extraordinárias',    'type' => 'earning',   'calculation_type' => 'formula',    'is_mandatory' => true,  'priority' => 30],
                ['code' => 'inss',                'name' => 'INSS (Funcionário)',        'type' => 'deduction', 'calculation_type' => 'percentage', 'default_value' => 3,    'is_mandatory' => true, 'priority' => 100],
                ['code' => 'irt',                 'name' => 'IRT',                      'type' => 'tax',       'calculation_type' => 'formula',    'is_mandatory' => true,  'priority' => 110],
            ];
            foreach ($salaryDefaults as $sc) {
                SalaryComponent::query()->withoutGlobalScopes()->firstOrCreate(
                    ['tenant_id' => $tenant->id, 'code' => $sc['code']],
                    $sc,
                );
            }

            $manager->clear();

            return $tenant;
        });

        return $this->success(
            new TenantResource($tenant),
            'Empresa criada com sucesso.',
            201,
        );
    }

    public function listTenantUsers(Tenant $tenant): JsonResponse
    {
        $this->authorize('view', $tenant);

        $users = User::query()
            ->where('tenant_id', $tenant->id)
            ->with('roles')
            ->orderBy('name')
            ->get()
            ->map(fn (User $u) => [
                'id'         => $u->id,
                'name'       => $u->name,
                'email'      => $u->email,
                'is_active'  => $u->is_active,
                'roles'      => $u->roles->pluck('name'),
                'created_at' => $u->created_at?->toIso8601String(),
            ]);

        return $this->success($users);
    }

    public function storeUser(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('update', $tenant);

        $data = $request->validate([
            'name'     => ['required', 'string', 'max:255'],
            'email'    => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'role'     => ['required', 'string', 'in:admin,hr-manager,manager,employee'],
            'is_active'=> ['sometimes', 'boolean'],
        ]);

        $user = User::query()->create([
            'tenant_id'         => $tenant->id,
            'name'              => $data['name'],
            'email'             => $data['email'],
            'password'          => Hash::make($data['password']),
            'locale'            => $tenant->locale ?? 'pt',
            'timezone'          => $tenant->timezone ?? 'Africa/Luanda',
            'email_verified_at' => now(),
            'is_active'         => $data['is_active'] ?? true,
        ]);
        $user->assignRole($data['role']);

        return $this->success([
            'id'        => $user->id,
            'name'      => $user->name,
            'email'     => $user->email,
            'is_active' => $user->is_active,
            'roles'     => $user->roles->pluck('name'),
        ], 'Utilizador criado com sucesso.', 201);
    }

    public function destroyUser(Tenant $tenant, User $user): JsonResponse
    {
        $this->authorize('update', $tenant);

        if ($user->tenant_id !== $tenant->id) {
            return $this->error('Utilizador não pertence a esta empresa.', 403);
        }

        if ($user->isSuperAdmin()) {
            return $this->error('Não é possível eliminar um super-admin.', 403);
        }

        $user->tokens()->delete();
        $user->delete();

        return $this->success(null, 'Utilizador eliminado com sucesso.');
    }

    public function showTenant(Tenant $tenant): JsonResponse
    {
        $this->authorize('view', $tenant);

        return $this->success(new TenantResource(
            $tenant->loadCount(['employees', 'users', 'departments'])
        ));
    }

    public function updateTenant(Request $request, Tenant $tenant): JsonResponse
    {
        $this->authorize('update', $tenant);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', 'unique:tenants,slug,'.$tenant->id],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'tax_id' => ['nullable', 'string', 'max:100'],
            'currency' => ['nullable', 'string', 'size:3'],
            'locale' => ['nullable', 'string', 'max:10'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'status' => ['sometimes', 'in:active,inactive,suspended'],
        ]);

        $tenant->update($data);

        return $this->success(
            new TenantResource($tenant->fresh()),
            'Empresa atualizada com sucesso.',
        );
    }

    public function destroyTenant(Tenant $tenant): JsonResponse
    {
        $this->authorize('delete', $tenant);

        if ($tenant->employees()->exists()) {
            return $this->error('Não é possível eliminar uma empresa com funcionários associados.', 422);
        }

        $tenant->delete();

        return $this->success(null, 'Empresa eliminada com sucesso.');
    }
}
