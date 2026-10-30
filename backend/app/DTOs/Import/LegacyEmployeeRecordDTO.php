<?php

namespace App\DTOs\Import;

class LegacyEmployeeRecordDTO
{
    public function __construct(
        public string $dataId,
        public string $employeeCode,
        public string $fullName,
        public string $firstName,
        public string $lastName,
        public ?string $companyName = null,
        public ?string $clientName = null,
        public ?string $companyTaxId = null,
        public ?string $companyType = null,
        public ?string $departmentName = null,
        public ?string $positionTitle = null,
        public ?string $nationality = 'Angolana',
        public ?string $idDocumentType = 'bi',
        public ?string $idDocumentNumber = null,
        public ?string $idDocumentExpiry = null,
        public ?string $phone = null,
        public ?string $emergencyContact = null,
        public ?string $address = null,
        public string $status = 'active', // active, terminated, probation, inactive
        public ?string $hiredAt = null,
        public ?string $probationEnd = null,
        public ?string $terminationAt = null,
        public ?string $terminationReason = null,
        public ?string $taxId = null,
        public ?string $socialSecurityId = null,
        public ?string $inssStatus = null,
        
        // Contract details
        public string $contractType = 'fixed_term', // fixed_term, permanent, etc.
        public float $baseSalary = 0.0,
        public ?string $contractStartDate = null,
        public ?string $contractEndDate = null,
        public ?string $contractLocation = null,
        public ?string $contractNotes = null,

        // Salary components
        public float $mealAllowance = 0.0,
        public float $transportAllowance = 0.0,
        public float $overtime = 0.0,
        public float $otherAllowance = 0.0,
        public float $netSalary = 0.0,

        // Documents URLs (Jiandaoyun)
        public array $documents = [],
        
        // Credentials or INSS passwords detected
        public ?string $inssPassword = null,
        public ?string $inssUsername = null,
        public ?string $inssCompanyNumber = null,

        // Sub-rows / models detected
        public array $subModels = [],

        // Raw row line numbers for auditing
        public array $rowNumbers = []
    ) {}

    public function toArray(): array
    {
        return get_object_vars($this);
    }
}
