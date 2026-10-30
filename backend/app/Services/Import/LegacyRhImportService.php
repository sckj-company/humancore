<?php

namespace App\Services\Import;

use App\DTOs\Import\LegacyEmployeeRecordDTO;
use App\Jobs\ProcessAndUploadEmployeeDocumentJob;
use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeSalaryComponent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class LegacyRhImportService
{
    public function __construct(
        protected LegacyExcelParserService $parser,
        protected TenantResolutionService $tenantResolver
    ) {}

    /**
     * Run the import pipeline.
     *
     * @param string $filePath Path to the Excel file
     * @param bool $dryRun If true, only validate and compile statistics without DB insertion
     * @param bool $dispatchUploadJobs If true, dispatches background jobs for Cloudinary upload
     * @return array Summary of the operation
     */
    public function execute(string $filePath, bool $dryRun = true, bool $dispatchUploadJobs = false): array
    {
        $startTime = microtime(true);
        $records = $this->parser->parseFile($filePath);

        $stats = [
            'total_records' => count($records),
            'dry_run' => $dryRun,
            'tenants_detected' => [],
            'status_breakdown' => [
                'active' => 0,
                'terminated' => 0,
                'inactive' => 0,
            ],
            'salaries' => [
                'total_base_payroll' => 0.0,
                'records_with_salary' => 0,
            ],
            'documents' => [
                'total_attachment_links' => 0,
                'by_type' => [],
            ],
            'anomalies' => [
                'missing_bi' => [],
                'duplicate_bi' => [],
                'missing_company' => [],
                'missing_phone' => [],
            ],
            'imported' => [
                'employees_created' => 0,
                'employees_updated' => 0,
                'contracts_created' => 0,
                'salary_components_created' => 0,
                'document_jobs_dispatched' => 0,
                'tenants_created_or_matched' => 0,
            ],
            'duration_seconds' => 0,
        ];

        // 1. First Pass: Analyze stats, anomalies, duplicates
        $biOccurrences = [];
        foreach ($records as $rec) {
            // Status count
            $st = $rec->status;
            $stats['status_breakdown'][$st] = ($stats['status_breakdown'][$st] ?? 0) + 1;

            // Company
            $comp = $rec->companyName ?: ($rec->clientName ?: 'A Designar (Pendente)');
            $stats['tenants_detected'][$comp] = ($stats['tenants_detected'][$comp] ?? 0) + 1;

            // Salary
            if ($rec->baseSalary > 0) {
                $stats['salaries']['total_base_payroll'] += $rec->baseSalary;
                $stats['salaries']['records_with_salary']++;
            }

            // Document links
            foreach ($rec->documents as $doc) {
                $stats['documents']['total_attachment_links']++;
                $t = $doc['type'];
                $stats['documents']['by_type'][$t] = ($stats['documents']['by_type'][$t] ?? 0) + 1;
            }

            // Anomalies
            if (empty($rec->idDocumentNumber)) {
                $stats['anomalies']['missing_bi'][] = [
                    'code' => $rec->employeeCode,
                    'name' => $rec->fullName,
                    'company' => $comp,
                ];
            } else {
                $biOccurrences[$rec->idDocumentNumber][] = $rec->employeeCode;
            }

            if (empty($rec->companyName)) {
                $stats['anomalies']['missing_company'][] = [
                    'code' => $rec->employeeCode,
                    'name' => $rec->fullName,
                    'client' => $rec->clientName,
                ];
            }

            if (empty($rec->phone)) {
                $stats['anomalies']['missing_phone'][] = [
                    'code' => $rec->employeeCode,
                    'name' => $rec->fullName,
                ];
            }
        }

        // Identify duplicate BIs
        foreach ($biOccurrences as $bi => $codes) {
            if (count($codes) > 1) {
                $stats['anomalies']['duplicate_bi'][$bi] = [
                    'bi' => $bi,
                    'count' => count($codes),
                    'codes' => $codes,
                ];
            }
        }

        // If dry run, return results immediately
        if ($dryRun) {
            $stats['duration_seconds'] = round(microtime(true) - $startTime, 2);
            return $stats;
        }

        // 2. Real Execution: Database Ingestion
        DB::beginTransaction();
        try {
            $tenantsSeen = [];

            foreach ($records as $rec) {
                // Resolve tenant
                $tenant = $this->tenantResolver->resolveTenant(
                    companyName: $rec->companyName,
                    clientName: $rec->clientName,
                    taxId: $rec->companyTaxId,
                    companyType: $rec->companyType,
                    inssPassword: $rec->inssPassword
                );
                $tenantsSeen[$tenant->id] = true;

                // Resolve department and position
                $dept = $this->tenantResolver->resolveDepartment($tenant, $rec->departmentName ?? 'Geral');
                $pos = $this->tenantResolver->resolvePosition($tenant, $dept, $rec->positionTitle ?? 'Colaborador');

                // Standard salary components for tenant
                $salaryComponents = $this->tenantResolver->ensureSalaryComponents($tenant);

                // Prepare ID document number
                $idDoc = $rec->idDocumentNumber;
                if (empty($idDoc)) {
                    $idDoc = "PROV-{$rec->employeeCode}";
                }

                // Upsert Employee
                $employee = Employee::withoutGlobalScopes()->where('tenant_id', $tenant->id)
                    ->where(function ($q) use ($rec, $idDoc) {
                        $q->where('employee_code', $rec->employeeCode)
                            ->orWhere('id_document_number', $idDoc);
                    })
                    ->first();

                $employeeData = [
                    'tenant_id' => $tenant->id,
                    'department_id' => $dept->id,
                    'position_id' => $pos->id,
                    'employee_code' => $rec->employeeCode,
                    'first_name' => $rec->firstName,
                    'last_name' => $rec->lastName,
                    'phone' => $rec->phone,
                    'alternative_phone' => $rec->emergencyContact,
                    'address' => $rec->address,
                    'city' => 'Luanda',
                    'country' => 'Angola',
                    'nationality' => $rec->nationality,
                    'id_document_type' => $rec->idDocumentType,
                    'id_document_number' => $idDoc,
                    'id_document_expiry' => $rec->idDocumentExpiry,
                    'status' => $rec->status,
                    'hired_at' => $rec->hiredAt,
                    'termination_at' => $rec->terminationAt,
                    'termination_reason' => $rec->terminationReason,
                ];

                if ($employee) {
                    $employee->update($employeeData);
                    $stats['imported']['employees_updated']++;
                } else {
                    $employee = Employee::withoutGlobalScopes()->create($employeeData);
                    $stats['imported']['employees_created']++;
                }

                // Create or update active EmployeeContract
                $contract = EmployeeContract::withoutGlobalScopes()
                    ->where('employee_id', $employee->id)
                    ->where('is_active', true)
                    ->first();

                $contractData = [
                    'employee_id' => $employee->id,
                    'tenant_id' => $tenant->id,
                    'position_id' => $pos->id,
                    'department_id' => $dept->id,
                    'contract_type' => $rec->contractType,
                    'base_salary' => $rec->baseSalary,
                    'start_date' => $rec->contractStartDate ?: ($rec->hiredAt ?: now()->toDateString()),
                    'end_date' => $rec->contractEndDate,
                    'is_active' => ($rec->status === 'active'),
                    'notes' => $rec->contractNotes ?: $rec->contractLocation,
                ];

                if ($contract) {
                    $contract->update($contractData);
                } else {
                    $contract = EmployeeContract::withoutGlobalScopes()->create($contractData);
                    $stats['imported']['contracts_created']++;
                }

                // Create Salary Components if values > 0
                $allowances = [
                    'meal_allowance' => $rec->mealAllowance,
                    'transport_allowance' => $rec->transportAllowance,
                    'overtime' => $rec->overtime,
                    'other_allowance' => $rec->otherAllowance,
                ];

                foreach ($allowances as $compKey => $amount) {
                    if ($amount > 0 && isset($salaryComponents[$compKey])) {
                        EmployeeSalaryComponent::firstOrCreate([
                            'tenant_id' => $tenant->id,
                            'employee_id' => $employee->id,
                            'contract_id' => $contract->id,
                            'salary_component_id' => $salaryComponents[$compKey]->id,
                        ], [
                            'custom_value' => $amount,
                            'start_date' => $contract->start_date,
                            'is_active' => true,
                        ]);
                        $stats['imported']['salary_components_created']++;
                    }
                }

                // Dispatch Cloudinary document jobs
                if ($dispatchUploadJobs && ! empty($rec->documents)) {
                    foreach ($rec->documents as $doc) {
                        ProcessAndUploadEmployeeDocumentJob::dispatch(
                            employeeId: $employee->id,
                            tenantId: $tenant->id,
                            documentType: $doc['type'],
                            documentName: $doc['name'],
                            sourceUrl: $doc['url'],
                            contractId: $contract->id,
                            expiryDate: ($doc['type'] === 'id_card_front') ? $rec->idDocumentExpiry : null
                        );
                        $stats['imported']['document_jobs_dispatched']++;
                    }
                }
            }

            $stats['imported']['tenants_created_or_matched'] = count($tenantsSeen);
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            Log::error('Erro durante a importação real de dados RH: '.$e->getMessage(), [
                'exception' => $e,
            ]);
            throw $e;
        }

        $stats['duration_seconds'] = round(microtime(true) - $startTime, 2);
        return $stats;
    }
}
