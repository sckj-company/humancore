<?php

use App\Models\Tenant;
use App\Services\SaaS\TenantProvisioningService;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $provisioning = app(TenantProvisioningService::class);

        Tenant::query()->cursor()->each(function (Tenant $tenant) use ($provisioning): void {
            $provisioning->seedDefaultOrganizationStructure($tenant, true);
        });
    }

    public function down(): void
    {
        // Mantém os departamentos e cargos criados para as empresas existentes.
    }
};
