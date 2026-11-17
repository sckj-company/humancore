<?php

namespace App\Console\Commands;

use App\Services\SaaS\BillingService;
use Illuminate\Console\Command;

class ProcessSubscriptionsLifecycleCommand extends Command
{
    protected $signature = 'saas:process-subscriptions';

    protected $description = 'Atualiza estados de subscrições expiradas (grace_period / suspended)';

    public function handle(BillingService $billingService): int
    {
        $result = $billingService->processLifecycle();

        $this->info("Subscrições em tolerância: {$result['grace_entered']} | Suspensas: {$result['suspended']}");

        return self::SUCCESS;
    }
}
