<?php

namespace App\Console\Commands;

use App\Jobs\ProcessAndUploadEmployeeDocumentJob;
use App\Models\Employee;
use App\Models\EmployeeDocument;
use App\Services\Import\LegacyExcelParserService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class RetryCloudinaryUploadsCommand extends Command
{
    protected $signature = 'humancore:retry-cloudinary-uploads
                            {--file= : Caminho do ficheiro Excel original (para re-extrair URLs)}
                            {--dry-run : Apenas mostra o que seria feito sem disparar jobs}
                            {--limit=0 : Limitar número de jobs a disparar (0 = sem limite)}
                            {--tenant= : Processar apenas um tenant específico (ID)}';

    protected $description = 'Re-dispara os jobs de upload Cloudinary para documentos que ainda não foram processados';

    public function handle(LegacyExcelParserService $parser): int
    {
        $filePath = $this->option('file')
            ?: '/home/computer-development/code/humancore/Datos_de_RH员工数据库_20261029210852只保存15天.xlsx';

        $dryRun = (bool) $this->option('dry-run');
        $limit = (int) $this->option('limit');
        $tenantFilter = $this->option('tenant');

        $this->info('================================================================');
        $this->info('  HUMACORE — RE-ENVIO DE DOCUMENTOS PARA CLOUDINARY');
        $this->info('================================================================');

        // 1. Estado atual
        $totalUploaded = EmployeeDocument::withoutGlobalScopes()->count();
        $this->line("Documentos já gravados no Cloudinary: <info>{$totalUploaded}</info>");
        $this->newLine();

        if (! file_exists($filePath)) {
            $this->error("Ficheiro Excel não encontrado: {$filePath}");
            return self::FAILURE;
        }

        // 2. Parse do Excel para obter os URLs dos documentos
        $this->output->write('A ler o ficheiro Excel para extrair links de documentos...');
        $records = $parser->parseFile($filePath);
        $this->line(' <info>'.count($records).' registos encontrados.</info>');

        // 3. Identificar documentos já carregados (por employee + tipo)
        $alreadyUploaded = EmployeeDocument::withoutGlobalScopes()
            ->select('employee_id', 'document_type')
            ->get()
            ->mapToGroups(fn ($d) => [$d->employee_id => $d->document_type])
            ->toArray();

        // 4. Para cada employee no Excel, verificar quais docs faltam
        $dispatched = 0;
        $skipped = 0;
        $notFound = 0;
        $toDispatch = [];

        foreach ($records as $rec) {
            if (empty($rec->documents)) {
                continue;
            }

            // Find employee in DB by employee_code
            $employee = Employee::withoutGlobalScopes()
                ->where('employee_code', $rec->employeeCode)
                ->when($tenantFilter, fn ($q) => $q->where('tenant_id', $tenantFilter))
                ->first();

            if (! $employee) {
                $notFound++;
                continue;
            }

            $uploadedTypes = $alreadyUploaded[$employee->id] ?? [];

            foreach ($rec->documents as $doc) {
                if (in_array($doc['type'], $uploadedTypes, true)) {
                    $skipped++;
                    continue;
                }

                if (empty($doc['url'])) {
                    continue;
                }

                $toDispatch[] = [
                    'employee_id'   => $employee->id,
                    'tenant_id'     => $employee->tenant_id,
                    'document_type' => $doc['type'],
                    'document_name' => $doc['name'],
                    'source_url'    => $doc['url'],
                    'employee_code' => $rec->employeeCode,
                ];
            }
        }

        // Aplicar limite se definido
        $total = count($toDispatch);
        if ($limit > 0) {
            $toDispatch = array_slice($toDispatch, 0, $limit);
        }

        $this->newLine();
        $this->info('--- DIAGNÓSTICO ---');
        $this->table(
            ['Métrica', 'Valor'],
            [
                ['Total de links extraídos do Excel', array_sum(array_map(fn ($r) => count($r->documents), $records))],
                ['Documentos já no Cloudinary', $totalUploaded],
                ['Documentos a processar (pendentes)', $total],
                ['Funcionários não encontrados na BD', $notFound],
                ['Jobs a disparar agora', count($toDispatch)],
            ]
        );

        if ($dryRun) {
            $this->newLine();
            $this->comment('Modo DRY-RUN: nenhum job foi disparado.');
            $this->line('  Execute sem --dry-run para iniciar os uploads.');
            return self::SUCCESS;
        }

        if ($total === 0) {
            $this->info('Todos os documentos já foram carregados no Cloudinary!');
            return self::SUCCESS;
        }

        // 5. Confirmar antes de disparar
        if (! $this->confirm("Confirma o disparo de ".count($toDispatch)." jobs de upload para o Cloudinary?", true)) {
            $this->line('Operação cancelada.');
            return self::SUCCESS;
        }

        // 6. Disparar jobs em lotes para não sobrecarregar a fila
        $bar = $this->output->createProgressBar(count($toDispatch));
        $bar->start();

        foreach ($toDispatch as $item) {
            // Get active contract for this employee
            $contractId = DB::table('employee_contracts')
                ->where('employee_id', $item['employee_id'])
                ->where('is_active', true)
                ->value('id');

            ProcessAndUploadEmployeeDocumentJob::dispatch(
                employeeId:   $item['employee_id'],
                tenantId:     $item['tenant_id'],
                documentType: $item['document_type'],
                documentName: $item['document_name'],
                sourceUrl:    $item['source_url'],
                contractId:   $contractId,
            );

            $dispatched++;
            $bar->advance();
        }

        $bar->finish();
        $this->newLine(2);

        $this->info("✓ {$dispatched} jobs de upload disparados para a fila Redis.");
        $this->newLine();
        $this->comment('Para processar a fila, execute num terminal separado:');
        $this->line('  <fg=cyan>php artisan queue:work --queue=default --tries=3 --timeout=180</>');
        $this->newLine();
        $this->comment('Para monitorizar o progresso em tempo real:');
        $this->line('  <fg=cyan>php artisan humancore:cloudinary-upload-status</>');

        return self::SUCCESS;
    }
}
