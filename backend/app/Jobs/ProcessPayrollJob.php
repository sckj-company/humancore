<?php

namespace App\Jobs;

use App\Models\PayrollPeriod;
use App\Services\Payroll\PayrollEngineService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
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
        $period = PayrollPeriod::query()->findOrFail($this->periodId);
        $count = $engine->processPeriod($period);
        Log::info("Payroll processed period {$period->id}: {$count} employees");
    }
}
