<?php

namespace App\Http\Controllers\Api\V1\Import;

use App\Http\Controllers\Api\V1\BaseController;
use App\Services\Import\LegacyRhImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeImportController extends BaseController
{
    public function __construct(
        protected LegacyRhImportService $importService
    ) {}

    /**
     * Preview and validate an Excel file before executing the import.
     */
    public function preview(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:51200'], // max 50MB
        ]);

        $file = $request->file('file');
        $tempPath = $file->getRealPath();

        try {
            $result = $this->importService->execute(
                filePath: $tempPath,
                dryRun: true,
                dispatchUploadJobs: false
            );

            return $this->success($result, 'Ficheiro analisado com sucesso.');
        } catch (\Throwable $e) {
            return $this->error('Erro ao analisar o ficheiro Excel: '.$e->getMessage(), 422);
        }
    }

    /**
     * Process and commit the imported records to the database.
     */
    public function process(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv', 'max:51200'],
            'upload_cloudinary' => ['nullable', 'boolean'],
        ]);

        $file = $request->file('file');
        $tempPath = $file->getRealPath();
        $uploadCloudinary = $request->boolean('upload_cloudinary', true);

        try {
            $result = $this->importService->execute(
                filePath: $tempPath,
                dryRun: false,
                dispatchUploadJobs: $uploadCloudinary
            );

            return $this->success($result, 'Importação de colaboradores concluída com sucesso.');
        } catch (\Throwable $e) {
            return $this->error('Erro durante a gravação dos dados: '.$e->getMessage(), 500);
        }
    }

    /**
     * Download a clean, standardized Excel import template.
     */
    public function downloadTemplate(): StreamedResponse
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Modelo Funcionários');

        $headers = [
            'A1' => 'Código Funcionário',
            'B1' => 'Nome Completo',
            'C1' => 'Nacionalidade',
            'D1' => 'Tipo Documento (BI/Passaporte)',
            'E1' => 'Número Documento',
            'F1' => 'Validade Documento (AAAA-MM-DD)',
            'G1' => 'NIF Pessoal',
            'H1' => 'Telefone',
            'I1' => 'Contacto de Emergência',
            'J1' => 'Endereço Residencial',
            'K1' => 'Departamento',
            'L1' => 'Função / Cargo',
            'M1' => 'Data Admissão (AAAA-MM-DD)',
            'N1' => 'Tipo Contrato (determinado/indeterminado)',
            'O1' => 'Salário Base (Kz)',
            'P1' => 'Subsídio Alimentação (Kz)',
            'Q1' => 'Subsídio Transporte (Kz)',
            'R1' => 'Empresa / Empresa Cliente',
        ];

        foreach ($headers as $cell => $text) {
            $sheet->setCellValue($cell, $text);
        }

        // Style header row
        $headerRange = 'A1:R1';
        $sheet->getStyle($headerRange)->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
        $sheet->getStyle($headerRange)->getFill()
            ->setFillType(Fill::FILL_SOLID)
            ->getStartColor()->setRGB('1E3A8A'); // Primary Blue
        $sheet->getStyle($headerRange)->getAlignment()
            ->setHorizontal(Alignment::HORIZONTAL_CENTER)
            ->setVertical(Alignment::VERTICAL_CENTER);

        // Sample row
        $sampleData = [
            'A2' => 'S.RH2026001001',
            'B2' => 'António Manuel Domingos',
            'C2' => 'Angolana',
            'D2' => 'BI',
            'E2' => '009876543LA042',
            'F2' => '2030-12-31',
            'G2' => '009876543LA042',
            'H2' => '+244 923 000 000',
            'I2' => '+244 912 000 000',
            'J2' => 'Viana, Luanda',
            'K2' => 'Vendas',
            'L2' => 'Vendedor',
            'M2' => '2026-01-15',
            'N2' => 'determinado',
            'O2' => '150000.00',
            'P2' => '30000.00',
            'Q2' => '25000.00',
            'R2' => 'Empresa Exemplo Lda',
        ];

        foreach ($sampleData as $cell => $text) {
            $sheet->setCellValue($cell, $text);
        }

        foreach (range('A', 'R') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        $writer = new Xlsx($spreadsheet);

        return response()->streamDownload(function () use ($writer) {
            $writer->save('php://output');
        }, 'Modelo_Importacao_Funcionarios_HumaCore.xlsx', [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }
}
