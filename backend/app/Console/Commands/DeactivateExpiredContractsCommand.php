<?php

namespace App\Console\Commands;

use App\Models\EmployeeContract;
use Illuminate\Console\Command;

class DeactivateExpiredContractsCommand extends Command
{
    protected $signature = 'humancore:deactivate-expired-contracts';

    protected $description = 'Desativa contratos de funcionários com data de fim anterior à data atual';

    public function handle(): int
    {
        $count = EmployeeContract::deactivateExpired();

        $this->info("{$count} contrato(s) expirado(s) desativado(s).");

        return self::SUCCESS;
    }
}
