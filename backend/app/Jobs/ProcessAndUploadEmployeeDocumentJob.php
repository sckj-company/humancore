<?php

namespace App\Jobs;

use App\Models\Employee;
use App\Models\EmployeeContract;
use App\Models\EmployeeDocument;
use App\Services\CloudinaryService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ProcessAndUploadEmployeeDocumentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public int $timeout = 180;
    public array $backoff = [10, 30, 60];

    public function __construct(
        public int $employeeId,
        public int $tenantId,
        public string $documentType,
        public string $documentName,
        public string $sourceUrl,
        public ?int $contractId = null,
        public ?string $expiryDate = null,
        public ?int $uploaderId = null
    ) {}

    public function handle(CloudinaryService $cloudinary): void
    {
        if (empty($this->sourceUrl)) {
            return;
        }

        try {
            // 1. Download temporário seguro a partir da URL Jiandaoyun
            $response = Http::timeout(60)
                ->withHeaders([
                    'User-Agent' => 'HumaCore-Importer/1.0',
                ])
                ->get($this->sourceUrl);

            if (! $response->successful()) {
                Log::error("Falha ao descarregar documento remoto para funcionário #{$this->employeeId}", [
                    'status' => $response->status(),
                    'url' => $this->sourceUrl,
                    'document_type' => $this->documentType,
                ]);
                return;
            }

            // Extrair extensão segura a partir do URL ou Content-Type
            $pathPart = parse_url($this->sourceUrl, PHP_URL_PATH) ?? '';
            $ext = strtolower(pathinfo($pathPart, PATHINFO_EXTENSION));
            if (empty($ext) || strlen($ext) > 5) {
                $contentType = $response->header('Content-Type') ?? '';
                $ext = match (true) {
                    str_contains($contentType, 'pdf') => 'pdf',
                    str_contains($contentType, 'wordprocessingml') || str_contains($contentType, 'msword') => 'docx',
                    str_contains($contentType, 'png') => 'png',
                    str_contains($contentType, 'jpeg') || str_contains($contentType, 'jpg') => 'jpg',
                    default => 'jpg',
                };
            }

            $tempFile = sys_get_temp_dir().'/hc_doc_'.uniqid('', true).'.'.$ext;
            file_put_contents($tempFile, $response->body());

            try {
                // 2. Definir pasta e tipo de recurso de acordo com o padrão do HumaCore
                $isContract = in_array($this->documentType, ['contract_doc', 'contract_pdf'], true);
                $folder = $isContract
                    ? "humancore/tenants/{$this->tenantId}/contracts"
                    : "humancore/tenants/{$this->tenantId}/documents";

                $resourceType = match ($ext) {
                    'docx', 'doc' => 'raw',
                    'pdf' => 'auto',
                    'png', 'jpg', 'jpeg', 'webp' => 'image',
                    default => 'auto',
                };

                // 3. Upload via CloudinaryService oficial
                $uploadResult = $cloudinary->upload($tempFile, $folder, $resourceType);
                $cdnUrl = $uploadResult['url'];

                // 4. Criação do registo em employee_documents vinculado estritamente ao trabalhador
                EmployeeDocument::create([
                    'employee_id' => $this->employeeId,
                    'tenant_id' => $this->tenantId,
                    'uploader_id' => $this->uploaderId,
                    'name' => $this->documentName,
                    'document_type' => $this->documentType,
                    'file_path' => $cdnUrl,
                    'original_name' => basename($pathPart) ?: "{$this->documentType}.{$ext}",
                    'mime_type' => mime_content_type($tempFile) ?: 'application/octet-stream',
                    'file_size' => $uploadResult['bytes'] ?? filesize($tempFile),
                    'expiry_date' => $this->expiryDate,
                    'is_confidential' => false,
                ]);

                // 5. Se for contrato, atualiza também a referência em employee_contracts
                if ($this->contractId && $isContract) {
                    EmployeeContract::where('id', $this->contractId)
                        ->update(['document_path' => $cdnUrl]);
                }

                Log::info("Documento [{$this->documentType}] carregado no Cloudinary para funcionário #{$this->employeeId}", [
                    'url' => $cdnUrl,
                ]);
            } finally {
                // 6. Limpeza obrigatória do ficheiro temporário local
                if (file_exists($tempFile)) {
                    @unlink($tempFile);
                }
            }
        } catch (\Throwable $e) {
            Log::error("Erro no processamento do documento [{$this->documentType}] para funcionário #{$this->employeeId}: ".$e->getMessage(), [
                'exception' => $e,
            ]);
            throw $e;
        }
    }
}
