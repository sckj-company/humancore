<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\TenantResource;
use App\Models\Employee;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', 'regex:/^[a-z0-9-]+$/', 'unique:tenants,slug'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'tax_id' => ['nullable', 'string', 'max:100'],
            'currency' => ['nullable', 'string', 'size:3'],
            'locale' => ['nullable', 'string', 'max:10'],
            'timezone' => ['nullable', 'string', 'max:100'],
            'status' => ['nullable', 'in:active,inactive,suspended'],
        ]);

        $data['currency'] = $data['currency'] ?? 'AOA';
        $data['locale'] = $data['locale'] ?? 'pt';
        $data['timezone'] = $data['timezone'] ?? 'Africa/Luanda';
        $data['status'] = $data['status'] ?? 'active';

        $tenant = Tenant::query()->create($data);

        return $this->success(
            new TenantResource($tenant),
            'Empresa criada com sucesso.',
            201,
        );
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
