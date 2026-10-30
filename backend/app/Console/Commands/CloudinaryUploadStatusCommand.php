<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\EmployeeDocument;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class CloudinaryUploadStatusCommand extends Command
{
    protected $signature = 'humancore:cloudinary-upload-status
                            {--watch : Atualizar automaticamente a cada 5 segundos}';

    protected $description = 'Mostra o progresso dos uploads de documentos para o Cloudinary em tempo real';

    public function handle(): int
    {
        $watch = (bool) $this->option('watch');

        do {
            // Clear screen if in watch mode
            if ($watch) {
                system('clear');
            }

            $totalExpected  = 3058; // Links extraídos do Excel
            $uploaded       = EmployeeDocument::withoutGlobalScopes()->count();
            $queuePending   = \Illuminate\Support\Facades\Queue::size('default');
            $failedCount    = DB::table('failed_jobs')
                ->where('payload', 'like', '%ProcessAndUpload%')
                ->count();

            $pending   = $totalExpected - $uploaded;
            $percent   = round(($uploaded / $totalExpected) * 100, 1);
            $barFilled = (int) round($percent / 5);
            $bar       = str_repeat('█', $barFilled).str_repeat('░', 20 - $barFilled);

            $this->info('================================================================');
            $this->info('  HUMACORE — STATUS DOS UPLOADS CLOUDINARY');
            $this->info('  '.now()->format('d/m/Y H:i:s'));
            $this->info('================================================================');
            $this->newLine();

            $this->line("  Progresso: [{$bar}] <fg=green;options=bold>{$percent}%</>");
            $this->newLine();

            $isWorkerRunning = (int) shell_exec('pgrep -f "artisan queue:work" | wc -l') > 0;

            $this->table(
                ['Métrica', 'Valor'],
                [
                    ['📁 Total de documentos esperados (Excel)', number_format($totalExpected, 0, ',', '.')],
                    ['✅ Documentos enviados ao Cloudinary',      "<fg=green>{$uploaded}</>"],
                    ['⏳ Documentos pendentes de envio',           "<fg=yellow>{$pending}</>"],
                    ['🔄 Jobs aguardando na fila Redis',           $queuePending > 0 ? "<fg=cyan>{$queuePending}</>" : '0'],
                    ['⚙️  Worker da fila',                         $isWorkerRunning ? '<fg=green>ATIVO (a processar)</>' : '<fg=yellow>PARADO (inicie com queue:work)</>'],
                    ['❌ Jobs falhados',                           $failedCount > 0 ? "<fg=red>{$failedCount}</>" : '0'],
                ]
            );

            // Breakdown by document type
            $this->newLine();
            $this->line('  <fg=white;options=bold>Por tipo de documento:</>');
            $byType = EmployeeDocument::withoutGlobalScopes()
                ->select('document_type', DB::raw('count(*) as total'))
                ->groupBy('document_type')
                ->orderByDesc('total')
                ->get();

            $typeRows = [];
            $typeLabels = [
                'id_card_front'          => 'BI / Passaporte (Frente)',
                'id_card_back'           => 'BI / Passaporte (Verso)',
                'contract_doc'           => 'Contrato de Trabalho (.docx)',
                'contract_pdf'           => 'Contrato Assinado (.pdf)',
                'tax_id'                 => 'Comprovativo NIF',
                'criminal_record'        => 'Registo Criminal',
                'driving_license'        => 'Carta de Condução',
                'residence_certificate'  => 'Atestado de Residência',
                'education_certificate'  => 'Certificado Escolar',
                'professional_cert'      => 'Certificado Profissional',
                'inefop_certificate'     => 'Certificado INEFOPE',
                'contract'               => 'Contrato (Legado)',
                'cv'                     => 'Curriculum Vitae',
            ];

            foreach ($byType as $t) {
                $label = $typeLabels[$t->document_type] ?? $t->document_type;
                $typeRows[] = [$label, $t->total];
            }

            if (! empty($typeRows)) {
                $this->table(['Tipo', 'Enviados'], $typeRows);
            }

            // Recent uploads
            $this->newLine();
            $this->line('  <fg=white;options=bold>Últimos 5 documentos enviados:</>');
            $recent = EmployeeDocument::withoutGlobalScopes()
                ->with(['employee:id,employee_code,first_name,last_name'])
                ->orderByDesc('created_at')
                ->limit(5)
                ->get(['id', 'employee_id', 'document_type', 'created_at']);

            $recentRows = [];
            foreach ($recent as $doc) {
                $emp = $doc->employee;
                $name = $emp ? "{$emp->first_name} {$emp->last_name}" : "Emp #{$doc->employee_id}";
                $recentRows[] = [
                    $emp->employee_code ?? '—',
                    $name,
                    $typeLabels[$doc->document_type] ?? $doc->document_type,
                    $doc->created_at->format('H:i:s'),
                ];
            }
            $this->table(['Código', 'Funcionário', 'Documento', 'Enviado às'], $recentRows ?: [['—', '—', '—', '—']]);

            if ($watch) {
                $this->line("\n  <fg=yellow>A atualizar em 5 segundos... Ctrl+C para sair.</>");
                sleep(5);
            }

        } while ($watch);

        return self::SUCCESS;
    }
}
