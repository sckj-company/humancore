<?php

namespace App\Services\Import;

use App\DTOs\Import\LegacyEmployeeRecordDTO;
use Carbon\Carbon;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

class LegacyExcelParserService
{
    /**
     * Parse the Jiandaoyun Excel export file into an array of LegacyEmployeeRecordDTO objects.
     *
     * @return array<string, LegacyEmployeeRecordDTO> Keyed by employeeCode
     */
    public function parseFile(string $filePath): array
    {
        if (! file_exists($filePath)) {
            throw new \InvalidArgumentException("Ficheiro não encontrado: {$filePath}");
        }

        $reader = IOFactory::createReaderForFile($filePath);
        $reader->setReadDataOnly(true);
        $spreadsheet = $reader->load($filePath);
        $sheet = $spreadsheet->getActiveSheet();

        $highestRow = $sheet->getHighestRow();
        $highestColumn = $sheet->getHighestColumn();

        // Convert the entire sheet or rows to an array
        $rows = $sheet->toArray(null, true, true, true);

        return $this->parseRows($rows);
    }

    /**
     * Parse rows array (indexed from 1, with columns A, B, C...)
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<string, LegacyEmployeeRecordDTO>
     */
    public function parseRows(array $rows): array
    {
        $employees = [];
        $currentRecord = null;

        // Row 1: Main Headers
        // Row 2: Sub-headers
        // Data starts at Row 3
        foreach ($rows as $rowIndex => $row) {
            if ($rowIndex < 3) {
                continue;
            }

            $dataId = trim((string) ($row['A'] ?? ''));
            $employeeCode = trim((string) ($row['AC'] ?? ''));

            // Check if this row is the start of a new employee parent record
            if (! empty($dataId) || ! empty($employeeCode)) {
                if ($currentRecord !== null) {
                    $employees[$currentRecord->employeeCode] = $currentRecord;
                }

                $currentRecord = $this->buildParentRecord($row, $rowIndex);
            } elseif ($currentRecord !== null) {
                // This is a child row belonging to the current employee record
                $this->mergeChildRow($currentRecord, $row, $rowIndex);
            }
        }

        // Add the last record
        if ($currentRecord !== null) {
            $employees[$currentRecord->employeeCode] = $currentRecord;
        }

        return $employees;
    }

    protected function buildParentRecord(array $row, int $rowIndex): LegacyEmployeeRecordDTO
    {
        $dataId = trim((string) ($row['A'] ?? ''));
        $employeeCode = trim((string) ($row['AC'] ?? ''));
        if (empty($employeeCode)) {
            $employeeCode = 'S.RH'.($dataId ?: uniqid());
        }

        $rawName = trim((string) ($row['AD'] ?? ''));
        [$firstName, $lastName] = $this->splitName($rawName);

        // Company & Client
        $companyName = trim((string) ($row['F'] ?? ''));
        $clientName = trim((string) ($row['E'] ?? ''));
        $companyTaxId = trim((string) ($row['G'] ?? ''));
        $companyType = trim((string) ($row['H'] ?? ''));

        // Department & Position
        $departmentName = $this->cleanDepartment(trim((string) ($row['AJ'] ?? '')));
        $positionTitle = $this->cleanPosition(trim((string) ($row['AK'] ?? '')));

        // Personal Information
        $nationality = $this->normalizeNationality(trim((string) ($row['AH'] ?? '')));
        $idDocumentNumber = trim((string) ($row['AI'] ?? ''));
        $idDocumentExpiry = $this->parseDate($row['AS'] ?? $row['BB'] ?? null);
        $phone = $this->normalizePhone(trim((string) ($row['AE'] ?? '')));
        $emergencyContact = trim((string) ($row['AF'] ?? ''));
        $address = trim((string) ($row['AG'] ?? ''));

        // Employment status
        $rawStatus = trim((string) ($row['BF'] ?? $row['BI'] ?? ''));
        $status = $this->normalizeStatus($rawStatus);

        // Dates
        $hiredAt = $this->parseDate($row['BN'] ?? $row['BH'] ?? null);
        $terminationAt = $this->parseDate($row['BJ'] ?? $row['BQ'] ?? null);
        $terminationReason = trim((string) ($row['BK'] ?? $row['BR'] ?? ''));
        if (! empty($row['BL'] ?? '')) {
            $terminationReason .= ' - '.trim((string) $row['BL']);
        }

        // INSS
        $inssStatus = trim((string) ($row['BO'] ?? ''));
        $inssCompanyNumber = trim((string) ($row['O'] ?? ''));
        $inssUsername = trim((string) ($row['P'] ?? ''));
        $inssPassword = trim((string) ($row['Q'] ?? ''));

        // Salaries & Components
        $baseSalary = $this->parseFloat($row['BU'] ?? $row['CE'] ?? 0);
        $mealAllowance = $this->parseFloat($row['BV'] ?? 0);
        $transportAllowance = $this->parseFloat($row['BW'] ?? 0);
        $overtime = $this->parseFloat($row['BX'] ?? 0);
        $otherAllowance = $this->parseFloat($row['BY'] ?? 0);
        $netSalary = $this->parseFloat($row['BZ'] ?? 0);

        // Contract
        $rawContractType = trim((string) ($row['CD'] ?? $row['Y'] ?? ''));
        $contractType = $this->normalizeContractType($rawContractType);
        $contractStartDate = $this->parseDate($row['CF'] ?? null) ?: $hiredAt;
        $contractEndDate = $this->parseDate($row['CG'] ?? null);
        $contractLocation = trim((string) ($row['CL'] ?? $row['X'] ?? $row['V'] ?? ''));

        // Documents Links
        $documents = $this->extractDocuments($row);

        // Sub-model from row 1
        $subModels = [];
        $firstSubModel = $this->extractSubModel($row);
        if ($firstSubModel !== null) {
            $subModels[] = $firstSubModel;
            if (! empty($firstSubModel['inss_password'])) {
                $inssPassword = $firstSubModel['inss_password'];
            }
        }

        return new LegacyEmployeeRecordDTO(
            dataId: $dataId,
            employeeCode: $employeeCode,
            fullName: $rawName,
            firstName: $firstName,
            lastName: $lastName,
            companyName: $companyName ?: null,
            clientName: $clientName ?: null,
            companyTaxId: $companyTaxId ?: null,
            companyType: $companyType ?: null,
            departmentName: $departmentName,
            positionTitle: $positionTitle,
            nationality: $nationality,
            idDocumentType: 'bi',
            idDocumentNumber: $idDocumentNumber ?: null,
            idDocumentExpiry: $idDocumentExpiry,
            phone: $phone ?: null,
            emergencyContact: $emergencyContact ?: null,
            address: $address ?: null,
            status: $status,
            hiredAt: $hiredAt,
            probationEnd: null,
            terminationAt: $terminationAt,
            terminationReason: $terminationReason ?: null,
            taxId: trim((string) ($row['G'] ?? '')),
            socialSecurityId: null,
            inssStatus: $inssStatus ?: null,
            contractType: $contractType,
            baseSalary: $baseSalary,
            contractStartDate: $contractStartDate,
            contractEndDate: $contractEndDate,
            contractLocation: $contractLocation ?: null,
            contractNotes: trim((string) ($row['CO'] ?? '')),
            mealAllowance: $mealAllowance,
            transportAllowance: $transportAllowance,
            overtime: $overtime,
            otherAllowance: $otherAllowance,
            netSalary: $netSalary,
            documents: $documents,
            inssPassword: $inssPassword ?: null,
            inssUsername: $inssUsername ?: null,
            inssCompanyNumber: $inssCompanyNumber ?: null,
            subModels: $subModels,
            rowNumbers: [$rowIndex]
        );
    }

    protected function mergeChildRow(LegacyEmployeeRecordDTO $parent, array $row, int $rowIndex): void
    {
        $parent->rowNumbers[] = $rowIndex;

        $subModel = $this->extractSubModel($row);
        if ($subModel !== null) {
            $parent->subModels[] = $subModel;

            if (! empty($subModel['inss_password']) && empty($parent->inssPassword)) {
                $parent->inssPassword = $subModel['inss_password'];
            }

            // Check if child row has contract model links
            if (! empty($subModel['model_url'])) {
                $parent->documents[] = [
                    'type' => 'contract_doc',
                    'name' => 'Modelo de Contrato Word (Sub-tabela)',
                    'url' => $subModel['model_url'],
                ];
            }
        }
    }

    protected function extractSubModel(array $row): ?array
    {
        $type = trim((string) ($row['Y'] ?? ''));
        $model = trim((string) ($row['Z'] ?? ''));
        $obs = trim((string) ($row['AB'] ?? ''));
        $sede = trim((string) ($row['V'] ?? ''));
        $local = trim((string) ($row['X'] ?? ''));

        if (empty($type) && empty($model) && empty($obs) && empty($sede)) {
            return null;
        }

        $inssPass = null;
        if (preg_match('/SENHA:\s*([^\s;]+)/i', $obs, $m)) {
            $inssPass = $m[1];
        }

        return [
            'type' => $type,
            'model_url' => $this->firstUrl($model),
            'all_urls' => $model,
            'obs' => $obs,
            'sede' => $sede,
            'local' => $local,
            'inss_password' => $inssPass,
        ];
    }

    protected function extractDocuments(array $row): array
    {
        $docs = [];

        $docCols = [
            'AN' => ['type' => 'id_card_front', 'name' => 'Cópia de BI / Passaporte (Frente)'],
            'AO' => ['type' => 'id_card_back', 'name' => 'Cópia de BI / Passaporte (Verso)'],
            'AR' => ['type' => 'tax_id', 'name' => 'Comprovativo de NIF'],
            'AU' => ['type' => 'criminal_record', 'name' => 'Registo Criminal'],
            'AV' => ['type' => 'driving_license', 'name' => 'Carta de Condução'],
            'AW' => ['type' => 'residence_certificate', 'name' => 'Atestado de Residência'],
            'AX' => ['type' => 'education_certificate', 'name' => 'Certificado Escolar / Habilitações'],
            'AY' => ['type' => 'professional_cert', 'name' => 'Certificado Profissional'],
            'CM' => ['type' => 'contract_doc', 'name' => 'Contrato de Trabalho (Word)'],
            'CN' => ['type' => 'contract_pdf', 'name' => 'Contrato de Trabalho Assinado (PDF)'],
            'CQ' => ['type' => 'inefop_certificate', 'name' => 'Certificado INEFOPE'],
        ];

        foreach ($docCols as $col => $info) {
            $rawVal = trim((string) ($row[$col] ?? ''));
            $url = $this->firstUrl($rawVal);
            if (! empty($url)) {
                $docs[] = [
                    'type' => $info['type'],
                    'name' => $info['name'],
                    'url' => $url,
                ];
            }
        }

        return $docs;
    }

    public function parseDate(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        // If numeric, it's an Excel serial date number
        if (is_numeric($value)) {
            $valFloat = (float) $value;
            if ($valFloat > 1000) {
                try {
                    $dt = ExcelDate::excelToDateTimeObject($valFloat);
                    return $dt->format('Y-m-d');
                } catch (\Throwable) {
                    $base = Carbon::create(1899, 12, 30);
                    return $base->addDays((int) $valFloat)->format('Y-m-d');
                }
            }
        }

        // String date (YYYY-MM-DD, DD/MM/YYYY, etc.)
        $str = trim((string) $value);
        if (empty($str)) {
            return null;
        }

        try {
            return Carbon::parse($str)->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    public function splitName(string $fullName): array
    {
        $fullName = trim(preg_replace('/\s+/', ' ', $fullName));
        if (empty($fullName)) {
            return ['Desconhecido', 'Funcionário'];
        }

        $parts = explode(' ', $fullName);
        if (count($parts) === 1) {
            return [$parts[0], $parts[0]];
        }

        $firstName = array_shift($parts);
        $lastName = implode(' ', $parts);

        return [$firstName, $lastName];
    }

    public function cleanDepartment(string $dept): string
    {
        // Strip Chinese text and prefixes like "D."
        $clean = preg_replace('/[\x{4e00}-\x{9fa5}]+/u', '', $dept);
        $clean = preg_replace('/^D\./i', '', trim($clean));
        $clean = trim($clean, " -_.\t\n\r\0\x0B");

        return match (strtolower($clean)) {
            'vendas', 'sales' => 'Vendas',
            'rh', 'recursos humanos' => 'Recursos Humanos',
            'administracao', 'administração' => 'Administração',
            'manutencao', 'manutenção' => 'Manutenção',
            'operacao', 'operacaoes', 'operações' => 'Operações',
            'dutros', 'outros', 'outro' => 'Geral',
            default => ! empty($clean) ? ucfirst($clean) : 'Geral',
        };
    }

    public function cleanPosition(string $pos): string
    {
        $clean = preg_replace('/[\x{4e00}-\x{9fa5}]+/u', '', $pos);
        $clean = trim($clean, " -_.\t\n\r\0\x0B");

        return match (strtolower($clean)) {
            'vendedor', 'vendedora' => 'Vendedor',
            'operador', 'operadora' => 'Operador',
            'tecnico', 'técnico' => 'Técnico',
            'pedreiro' => 'Pedreiro',
            'ajudante de obra', 'ajudante' => 'Ajudante de Obra',
            'motorista' => 'Motorista',
            'assistente administrativo' => 'Assistente Administrativo',
            'gerente' => 'Gerente',
            'outros', 'outro' => 'Assistente',
            default => ! empty($clean) ? ucfirst($clean) : 'Colaborador',
        };
    }

    public function normalizeNationality(string $nat): string
    {
        $natUpper = strtoupper(trim($nat));
        if (str_contains($natUpper, 'ANG') || str_contains($natUpper, 'AO')) {
            return 'Angolana';
        }
        if (str_contains($natUpper, 'CHI') || str_contains($natUpper, 'CN') || str_contains($natUpper, '中国')) {
            return 'Chinesa';
        }
        if (str_contains($natUpper, 'TUR') || str_contains($natUpper, 'TR')) {
            return 'Turca';
        }

        return 'Angolana';
    }

    public function normalizeStatus(string $status): string
    {
        $lower = strtolower($status);
        if (str_contains($lower, 'trabalho') || str_contains($lower, '在职') || str_contains($lower, 'ativo')) {
            return 'active';
        }
        if (str_contains($lower, 'saíram') || str_contains($lower, 'sairam') || str_contains($lower, '离职') || str_contains($lower, 'demiss') || str_contains($lower, 'deslig')) {
            return 'terminated';
        }
        if (str_contains($lower, 'experimental') || str_contains($lower, '试用')) {
            return 'active';
        }

        return 'active';
    }

    public function normalizeContractType(string $type): string
    {
        $lower = strtolower($type);
        if (str_contains($lower, 'indeterminado') || str_contains($lower, '无固定')) {
            return 'permanent';
        }
        if (str_contains($lower, 'determinado') || str_contains($lower, '3 meses') || str_contains($lower, 'termo')) {
            return 'fixed_term';
        }
        if (str_contains($lower, 'estágio') || str_contains($lower, 'estagio')) {
            return 'internship';
        }

        return 'fixed_term';
    }

    public function normalizePhone(string $phone): string
    {
        $clean = preg_replace('/[^\d+]/', '', $phone);
        return $clean ?: '';
    }

    public function parseFloat(mixed $val): float
    {
        if (is_numeric($val)) {
            return (float) $val;
        }
        $str = preg_replace('/[^\d,.]/', '', (string) $val);
        $str = str_replace(',', '.', $str);
        return (float) $str;
    }

    public function firstUrl(string $text): ?string
    {
        if (preg_match('#https?://[^\s]+#i', $text, $matches)) {
            return $matches[0];
        }
        return null;
    }
}
