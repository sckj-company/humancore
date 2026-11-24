<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class GenerateExecutiveDashboardTokenCommand extends Command
{
    protected $signature = 'executive-dashboard:token
                            {--email= : Email específico do utilizador super-admin (opcional)}
                            {--name=ExecutiveDashboard : Nome identificador do token}
                            {--expires-days= : Dias até expiração do token (opcional)}';

    protected $description = 'Gera um Bearer Token Sanctum de leitura para o Dashboard Executivo do Super Admin.';

    public function handle(): int
    {
        $email = $this->option('email');

        $user = User::query()
            ->where('is_active', true)
            ->when($email, fn ($q) => $q->where('email', (string) $email))
            ->whereHas('roles', fn ($q) => $q->where('name', 'super-admin'))
            ->orderBy('id')
            ->first();

        if (! $user) {
            $this->error('Utilizador super-admin ativo não encontrado.');

            return self::FAILURE;
        }

        $expiresDays = $this->option('expires-days');
        $expiresAt = is_numeric($expiresDays) && (int) $expiresDays > 0
            ? now()->addDays((int) $expiresDays)
            : null;

        $token = $user->createToken(
            name: (string) $this->option('name'),
            abilities: ['executive-dashboard:read'],
            expiresAt: $expiresAt,
        )->plainTextToken;

        $this->info("Token de leitura do Dashboard Executivo criado para {$user->name} ({$user->email}):");
        $this->line($token);
        $this->newLine();
        $this->comment('Exemplo de chamada:');
        $this->line('curl -H "Accept: application/json" -H "Authorization: Bearer '.$token.'" "'.rtrim((string) config('app.url'), '/').'/api/v1/superadmin/executive-dashboard"');

        return self::SUCCESS;
    }
}
