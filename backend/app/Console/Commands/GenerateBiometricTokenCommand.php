<?php

namespace App\Console\Commands;

use App\Models\Tenant;
use App\Models\User;
use Illuminate\Console\Command;

class GenerateBiometricTokenCommand extends Command
{
    protected $signature = 'biometric:token
                            {tenant_id : ID da empresa (tenant)}
                            {--name=BiometricEntrancePC : Nome identificador do token}
                            {--email= : Email específico de um utilizador admin/rh (opcional)}';

    protected $description = 'Gera um Bearer Token Sanctum para integração do sistema biométrico de entrada.';

    public function handle(): int
    {
        $tenant = Tenant::query()->find((int) $this->argument('tenant_id'));
        if (! $tenant) {
            $this->error('Empresa (tenant) não encontrada.');

            return self::FAILURE;
        }

        $email = $this->option('email');
        $user = User::query()
            ->when($email, fn ($q) => $q->where('email', $email))
            ->when(! $email, fn ($q) => $q->where('tenant_id', $tenant->id)->where('is_active', true))
            ->first();

        if (! $user) {
            $this->error('Utilizador elegível não encontrado para este tenant.');

            return self::FAILURE;
        }

        $token = $user->createToken((string) $this->option('name'))->plainTextToken;

        $this->info("Token criado para {$user->email} (Tenant {$tenant->id} - {$tenant->name}):");
        $this->line($token);

        return self::SUCCESS;
    }
}
