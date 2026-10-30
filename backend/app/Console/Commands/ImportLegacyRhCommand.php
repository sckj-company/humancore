<?php

namespace App\Console\Commands;

use App\Services\Import\LegacyRhImportService;
use Illuminate\Console\Command;

class ImportLegacyRhCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'humancore:import-legacy-rh
                            {--file= : Caminho absoluto ou relativo do ficheiro Excel}
                            {--dry-run : Executar em modo de validação sem gravar no banco de dados}
                            {--upload-cloudinary : Descarregar anexos e enviá-los ao Cloudinary}
                            {--export-anomalies= : Caminho do ficheiro CSV de saída para anomalias e pendências}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Importa os 933 funcionários da base legada em Excel para a base de dados multi-tenant do HumaCore';

    public function handle(LegacyRhImportService $service): int
    {
        $file = $this->option('file') ?: base_path('../Datos_de_RH员工数据库_20261029210852只保存15天.xlsx');
        if (! file_exists($file)) {
            // Also check root workspace
            $file = '/home/computer-development/code/humancore/Datos_de_RH员工数据库_20261029210852只保存15天.xlsx';
        }

        if (! file_exists($file)) {
            $this->error("Ficheiro não encontrado: {$file}");
            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $uploadCloudinary = (bool) $this->option('upload-cloudinary');

        $this->info('===============================================================');
        $this->info('  HUMACORE — IMPORTADOR DE BASE DE DADOS DE RH (EXCEL)');
        $this->info('===============================================================');
        $this->line("Ficheiro: {$file}");
        $this->line('Modo: '.($dryRun ? '<comment>DRY-RUN (Simulação e Diagnóstico)</comment>' : '<fg=green;options=bold>EXECUÇÃO REAL (Escrita em Base de Dados)</>'));
        $this->line('Upload Cloudinary: '.($uploadCloudinary ? '<fg=cyan>ATIVADO (Jobs de Envio)</>' : '<fg=yellow>DESATIVADO</>'));
        $this->newLine();

        $this->output->write('A processar e validar ficheiro...');
        $result = $service->execute(
            filePath: $file,
            dryRun: $dryRun,
            dispatchUploadJobs: $uploadCloudinary
        );
        $this->output->writeln(' <info>Concluído em '.$result['duration_seconds'].'s</info>');
        $this->newLine();

        // 1. Tabela de Resumo Geral
        $this->info('--- RESUMO GERAL ---');
        $this->table(
            ['Métrica', 'Valor'],
            [
                ['Total de Trabalhadores Registados', number_format($result['total_records'], 0, ',', '.')],
                ['Empresas / Clientes Identificados', count($result['tenants_detected'])],
                ['Trabalhadores Ativos', $result['status_breakdown']['active'] ?? 0],
                ['Trabalhadores Desligados', $result['status_breakdown']['terminated'] ?? 0],
                ['Registos com Salário Preenchido', $result['salaries']['records_with_salary']],
                ['Massa Salarial Base Total', number_format($result['salaries']['total_base_payroll'], 2, ',', '.').' Kz'],
                ['Total de Links de Documentos Anexos', $result['documents']['total_attachment_links']],
            ]
        );

        // 2. Se for execução real, apresentar tabela de inserção
        if (! $dryRun) {
            $this->newLine();
            $this->info('--- DADOS INSERIDOS NA BASE DE DADOS ---');
            $this->table(
                ['Entidade', 'Quantidade'],
                [
                    ['Novos Colaboradores Criados', $result['imported']['employees_created']],
                    ['Colaboradores Atualizados', $result['imported']['employees_updated']],
                    ['Contratos de Trabalho Criados', $result['imported']['contracts_created']],
                    ['Componentes Salariais Vinculados', $result['imported']['salary_components_created']],
                    ['Empresas / Tenants Processados', $result['imported']['tenants_created_or_matched']],
                    ['Jobs de Upload Cloudinary Disparados', $result['imported']['document_jobs_dispatched']],
                ]
            );
        }

        // 3. Tabela das Principais Empresas
        $this->newLine();
        $this->info('--- PRINCIPAIS EMPRESAS DETETADAS ---');
        $topTenants = collect($result['tenants_detected'])
            ->sortDesc()
            ->take(8)
            ->map(fn ($count, $name) => [$name, $count])
            ->values()
            ->toArray();
        $this->table(['Empresa / Cliente', 'Trabalhadores'], $topTenants);

        // 4. Anomalias e Pendências
        $this->newLine();
        $this->info('--- ANOMALIAS E PENDÊNCIAS DETETADAS ---');
        $missingBiCount = count($result['anomalies']['missing_bi']);
        $dupBiCount = count($result['anomalies']['duplicate_bi']);
        $missingCompCount = count($result['anomalies']['missing_company']);
        $missingPhoneCount = count($result['anomalies']['missing_phone']);

        $this->table(
            ['Tipo de Anomalia', 'Ocorrências', 'Tratamento Aplicado'],
            [
                ['BI em Falta', $missingBiCount, 'Gerado código PROV-codigo e sinalizado no perfil'],
                ['BI Duplicado', $dupBiCount, 'Mantido por empresa com registo em auditoria'],
                ['Empresa Não Informada', $missingCompCount, 'Atribuído à "Empresa Pendente (A Designar)"'],
                ['Telefone em Falta', $missingPhoneCount, 'Aceite com campo nulo para atualização futura'],
            ]
        );

        // Export CSV if requested
        $exportPath = $this->option('export-anomalies');
        if (! empty($exportPath)) {
            $this->exportAnomaliesCsv($result['anomalies'], $exportPath);
            $this->info("Relatório de pendências exportado para: {$exportPath}");
        }

        $this->newLine();
        if ($dryRun) {
            $this->comment('Dica: Para executar a importação definitiva na base de dados, execute:');
            $this->line('  <fg=cyan>php artisan humancore:import-legacy-rh --upload-cloudinary</>');
        } else {
            $this->info('Importação concluída com sucesso!');
        }

        return self::SUCCESS;
    }

    protected function exportAnomaliesCsv(array $anomalies, string $targetPath): void
    {
        $handle = fopen($targetPath, 'w');
        fputcsv($handle, ['Tipo', 'Codigo', 'Nome', 'Detalhe']);

        foreach ($anomalies['missing_bi'] as $item) {
            fputcsv($handle, ['BI em Falta', $item['code'], $item['name'], $item['company']]);
        }

        foreach ($anomalies['duplicate_bi'] as $bi => $item) {
            fputcsv($handle, ['BI Duplicado', implode('; ', $item['codes']), $bi, "Aparece {$item['count']} vezes"]);
        }

        foreach ($anomalies['missing_company'] as $item) {
            fputcsv($handle, ['Empresa em Falta', $item['code'], $item['name'], $item['client'] ?? 'Sem cliente']);
        }

        fclose($handle);
    }
}
