<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Services\Attendance\BiometricAttendanceService;
use Illuminate\Console\Command;

class MarkBiometricAbsencesCommand extends Command
{
    protected $signature = 'attendance:mark-biometric-absences
                            {--date= : Data alvo no formato YYYY-MM-DD (padrão: hoje)}
                            {--tenant= : ID específico do tenant (opcional)}
                            {--deduct : Marcar deduct_from_salary=true nas ausências geradas}';

    protected $description = 'Regista ausências automáticas para funcionários escalados sem marcação biométrica nem férias/feriado.';

    public function handle(BiometricAttendanceService $biometricService): int
    {
        $date = $this->option('date') ?: now()->toDateString();
        $tenantId = $this->option('tenant');
        $deduct = (bool) $this->option('deduct');

        $tenants = Tenant::query()
            ->where('status', 'active')
            ->when($tenantId, fn ($q) => $q->whereKey((int) $tenantId))
            ->get();

        foreach ($tenants as $tenant) {
            try {
                $summary = $biometricService->closeDay($tenant->id, $date, $deduct);
                $this->info("[Tenant {$tenant->id} - {$tenant->name}] Data {$summary['date']}: {$summary['marked_absent_count']} ausências registadas.");
            } catch (\Throwable $e) {
                $this->error("[Tenant {$tenant->id}] Erro: {$e->getMessage()}");
            }
        }

        return self::SUCCESS;
    }
}
