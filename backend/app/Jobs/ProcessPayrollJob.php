<?php

namespace App\Jobs;

use App\Models\PayrollPeriod;
use App\Services\Payroll\PayrollEngineService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class ProcessPayrollJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $timeout = 3600;

    public function __construct(public int $periodId) {}

    public function handle(PayrollEngineService $engine): void
    {
        $lockKey = "payroll:period:{$this->periodId}";

        Cache::lock($lockKey, 3600)->block(5, function () use ($engine): void {
            $period = PayrollPeriod::query()->find($this->periodId);
            if (! $period) {
                return;
            }

            // Idempotência: apenas processa se o período estiver num estado aceitável.
            if (! in_array($period->status, ['open', 'processing', 'failed', 'pending_validation', 'completed'], true)) {
                Log::info("Payroll job skipped period {$period->id}: status={$period->status}");

                return;
            }

            $count = $engine->processPeriod($period);
            Log::info("Payroll processed period {$period->id}: {$count} employees");
        });
    }
}
