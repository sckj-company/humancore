<?php

namespace App\Http\Controllers\Api\V1\Employee;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Resources\V1\EmployeeEducationResource;
use App\Models\Employee;
use App\Models\EmployeeEducation;
use App\Models\Tenant;
use App\Services\DocumentStorageService;
use App\Services\Tenant\TenantManager;
use App\Support\PdfDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeEducationController extends BaseController
{
    public function index(Employee $employee): JsonResponse
    {
        $this->authorize('view', $employee);

        $educations = $employee->educations()
            ->with('creator:id,name')
            ->orderByDesc('occurred_on')
            ->orderByDesc('id')
            ->get();

        return $this->success(EmployeeEducationResource::collection($educations));
    }

    public function indexGeneral(Request $request): JsonResponse
    {
        $this->authorizeGeneralView($request);

        $educations = EmployeeEducation::query()
            ->whereNull('employee_id')
            ->with('creator:id,name')
            ->orderByDesc('occurred_on')
            ->orderByDesc('id')
            ->get();

        return $this->success(EmployeeEducationResource::collection($educations));
    }

    public function store(Request $request, Employee $employee, DocumentStorageService $storage): JsonResponse
    {
        $this->authorize('update', $employee);

        return $this->performStore($request, $storage, $employee->tenant_id, $employee);
    }

    public function storeGeneral(Request $request, DocumentStorageService $storage, TenantManager $tenantManager): JsonResponse
    {
        $this->authorizeGeneralManage($request);

        $tenantId = (int) ($tenantManager->id() ?? $request->user()?->tenant_id);

        return $this->performStore($request, $storage, $tenantId, null);
    }

    public function update(Request $request, Employee $employee, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $this->authorize('update', $employee);
        $this->ensureBelongsToEmployee($employee, $education);

        return $this->performUpdate($request, $education, $storage);
    }

    public function updateGeneral(Request $request, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $this->authorizeEducationManage($request, $education);

        return $this->performUpdate($request, $education, $storage);
    }

    public function destroy(Employee $employee, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $this->authorize('update', $employee);
        $this->ensureBelongsToEmployee($employee, $education);

        return $this->performDestroy($education, $storage);
    }

    public function destroyGeneral(Request $request, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $this->authorizeEducationManage($request, $education);

        return $this->performDestroy($education, $storage);
    }

    public function receiptPdf(Request $request, Employee $employee, EmployeeEducation $education): SymfonyResponse
    {
        $this->authorize('view', $employee);
        $this->ensureBelongsToEmployee($employee, $education);

        return $this->performReceiptPdf($request, $education, $employee);
    }

    public function receiptPdfGeneral(Request $request, EmployeeEducation $education): SymfonyResponse
    {
        $this->authorizeEducationView($request, $education);

        $employee = $education->employee_id ? $education->employee : null;

        return $this->performReceiptPdf($request, $education, $employee);
    }

    public function uploadDocument(Request $request, Employee $employee, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $this->authorize('update', $employee);
        $this->ensureBelongsToEmployee($employee, $education);

        return $this->performUploadDocument($request, $education, $storage);
    }

    public function uploadDocumentGeneral(Request $request, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $this->authorizeEducationManage($request, $education);

        return $this->performUploadDocument($request, $education, $storage);
    }

    public function uploadSignedDocument(Request $request, Employee $employee, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $this->authorize('update', $employee);
        $this->ensureBelongsToEmployee($employee, $education);

        return $this->performUploadSignedDocument($request, $education, $storage);
    }

    public function uploadSignedDocumentGeneral(Request $request, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $this->authorizeEducationManage($request, $education);

        return $this->performUploadSignedDocument($request, $education, $storage);
    }

    public function downloadDocument(Employee $employee, EmployeeEducation $education, string $kind, DocumentStorageService $storage): Response|StreamedResponse|JsonResponse
    {
        $this->authorize('view', $employee);
        $this->ensureBelongsToEmployee($employee, $education);

        return $this->performDownloadDocument($education, $kind, $storage);
    }

    public function downloadDocumentGeneral(Request $request, EmployeeEducation $education, string $kind, DocumentStorageService $storage): Response|StreamedResponse|JsonResponse
    {
        $this->authorizeEducationView($request, $education);

        return $this->performDownloadDocument($education, $kind, $storage);
    }

    private function performStore(Request $request, DocumentStorageService $storage, int $tenantId, ?Employee $employee): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'reason' => ['required', 'string', 'max:5000'],
            'sanction_warning' => ['nullable', 'string', 'max:2000'],
            'occurred_on' => ['nullable', 'date'],
        ]);

        $uploadedAttachment = $storage->storeFromRequest(
            request: $request,
            fileField: 'document',
            localDir: 'tenants/'.$tenantId.'/education-documents',
            cloudinaryFolder: 'humancore/tenants/'.$tenantId.'/education-documents',
            prefix: 'edu_',
        );

        $uploadedSigned = $storage->storeFromRequest(
            request: $request,
            fileField: 'signed_document',
            localDir: 'tenants/'.$tenantId.'/education-documents',
            cloudinaryFolder: 'humancore/tenants/'.$tenantId.'/education-documents',
            prefix: 'edu_signed_',
        );

        $education = EmployeeEducation::query()->create([
            'tenant_id' => $tenantId,
            'employee_id' => $employee?->id,
            'created_by' => $request->user()?->id,
            'title' => filled($validated['title'] ?? null) ? trim((string) $validated['title']) : null,
            'reason' => trim((string) $validated['reason']),
            'sanction_warning' => filled($validated['sanction_warning'] ?? null) ? trim((string) $validated['sanction_warning']) : null,
            'occurred_on' => $validated['occurred_on'] ?? now()->toDateString(),
            'document_path' => $uploadedAttachment['path'] ?? null,
            'document_name' => $uploadedAttachment['name'] ?? null,
            'document_mime' => $uploadedAttachment['mime'] ?? null,
            'signed_document_path' => $uploadedSigned['path'] ?? null,
            'signed_document_name' => $uploadedSigned['name'] ?? null,
            'signed_document_mime' => $uploadedSigned['mime'] ?? null,
            'signed_document_uploaded_at' => $uploadedSigned ? now() : null,
        ]);

        return $this->success(
            new EmployeeEducationResource($education->load('creator:id,name')),
            'Registo de educação criado com sucesso.',
            201,
        );
    }

    private function performUpdate(Request $request, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'reason' => ['required', 'string', 'max:5000'],
            'sanction_warning' => ['nullable', 'string', 'max:2000'],
            'occurred_on' => ['nullable', 'date'],
        ]);

        $uploadedAttachment = $storage->storeFromRequest(
            request: $request,
            fileField: 'document',
            localDir: 'tenants/'.$education->tenant_id.'/education-documents',
            cloudinaryFolder: 'humancore/tenants/'.$education->tenant_id.'/education-documents',
            prefix: 'edu_',
        );

        $updates = [
            'title' => filled($validated['title'] ?? null) ? trim((string) $validated['title']) : null,
            'reason' => trim((string) $validated['reason']),
            'sanction_warning' => filled($validated['sanction_warning'] ?? null) ? trim((string) $validated['sanction_warning']) : null,
            'occurred_on' => $validated['occurred_on'] ?? $education->occurred_on,
        ];

        $oldDocPath = null;
        if ($uploadedAttachment) {
            $oldDocPath = $education->document_path;
            $updates['document_path'] = $uploadedAttachment['path'];
            $updates['document_name'] = $uploadedAttachment['name'];
            $updates['document_mime'] = $uploadedAttachment['mime'];
        }

        $education->update($updates);
        if ($oldDocPath) {
            $storage->delete($oldDocPath);
        }

        return $this->success(
            new EmployeeEducationResource($education->fresh()->load('creator:id,name')),
            'Registo de educação atualizado com sucesso.',
        );
    }

    private function performDestroy(EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $storage->delete($education->document_path);
        $storage->delete($education->signed_document_path);
        $education->delete();

        return $this->success(null, 'Registo de educação eliminado com sucesso.');
    }

    private function performReceiptPdf(Request $request, EmployeeEducation $education, ?Employee $employee): SymfonyResponse
    {
        $employee?->loadMissing(['tenant', 'department', 'position']);
        $education->loadMissing(['creator:id,name', 'tenant']);
        $tenant = $employee?->tenant ?? $education->tenant ?? Tenant::query()->find($education->tenant_id);

        $pdf = PdfDocument::make(
            view: 'pdf.employee-education',
            data: [
                'employee' => $employee,
                'tenant' => $tenant,
                'education' => $education,
                'operatorName' => $request->user()?->name ?? 'Sistema',
            ],
            paper: 'a4',
            orientation: 'portrait',
            lang: $request->query('lang'),
        );

        $filename = $employee
            ? str_replace(['/', '\\', ' '], '-', 'educacao-'.($employee->employee_code ?: $employee->id)."-{$education->id}.pdf")
            : "educacao-geral-{$education->id}.pdf";

        return $pdf->download($filename);
    }

    private function performUploadDocument(Request $request, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $stored = $storage->storeFromRequest(
            request: $request,
            fileField: 'document',
            localDir: 'tenants/'.$education->tenant_id.'/education-documents',
            cloudinaryFolder: 'humancore/tenants/'.$education->tenant_id.'/education-documents',
            prefix: 'edu_',
        );

        if (! $stored) {
            return $this->error('Selecione um ficheiro válido.', 422);
        }

        $oldPath = $education->document_path;
        $education->update([
            'document_path' => $stored['path'],
            'document_name' => $stored['name'],
            'document_mime' => $stored['mime'],
        ]);
        $storage->delete($oldPath);

        return $this->success(
            new EmployeeEducationResource($education->fresh()->load('creator:id,name')),
            'Documento carregado com sucesso.',
        );
    }

    private function performUploadSignedDocument(Request $request, EmployeeEducation $education, DocumentStorageService $storage): JsonResponse
    {
        $stored = $storage->storeFromRequest(
            request: $request,
            fileField: 'document',
            localDir: 'tenants/'.$education->tenant_id.'/education-documents',
            cloudinaryFolder: 'humancore/tenants/'.$education->tenant_id.'/education-documents',
            prefix: 'edu_signed_',
        );

        if (! $stored) {
            return $this->error('Selecione um documento assinado válido.', 422);
        }

        $oldPath = $education->signed_document_path;
        $education->update([
            'signed_document_path' => $stored['path'],
            'signed_document_name' => $stored['name'],
            'signed_document_mime' => $stored['mime'],
            'signed_document_uploaded_at' => now(),
        ]);
        $storage->delete($oldPath);

        return $this->success(
            new EmployeeEducationResource($education->fresh()->load('creator:id,name')),
            'Comprovativo assinado carregado com sucesso.',
        );
    }

    private function performDownloadDocument(EmployeeEducation $education, string $kind, DocumentStorageService $storage): Response|StreamedResponse|JsonResponse
    {
        $path = $kind === 'signed' ? $education->signed_document_path : $education->document_path;
        $name = $kind === 'signed'
            ? ($education->signed_document_name ?: "educacao-assinada-{$education->id}")
            : ($education->document_name ?: "educacao-anexo-{$education->id}");

        if (! $path) {
            return $this->error('Documento não encontrado.', 404);
        }

        return $storage->download($path, $name);
    }

    private function ensureBelongsToEmployee(Employee $employee, EmployeeEducation $education): void
    {
        if ((int) $education->employee_id !== (int) $employee->id) {
            abort(404);
        }
    }

    private function authorizeGeneralView(Request $request): void
    {
        $user = $request->user();
        if (
            $user
            && (
                $user->hasAnyRole(['super-admin', 'admin', 'hr-manager'])
                || $user->can('view_any_employee')
                || $user->can('view_employee')
            )
        ) {
            return;
        }

        abort(403, 'Não tem permissão para consultar registos de educação.');
    }

    private function authorizeGeneralManage(Request $request): void
    {
        $user = $request->user();
        if (
            $user
            && (
                $user->hasAnyRole(['super-admin', 'admin', 'hr-manager'])
                || $user->can('update_employee')
                || $user->can('create_employee')
            )
        ) {
            return;
        }

        abort(403, 'Não tem permissão para gerir registos de educação.');
    }

    private function authorizeEducationView(Request $request, EmployeeEducation $education): void
    {
        if ($education->employee_id !== null && $education->employee) {
            $this->authorize('view', $education->employee);

            return;
        }

        $this->authorizeGeneralView($request);
    }

    private function authorizeEducationManage(Request $request, EmployeeEducation $education): void
    {
        if ($education->employee_id !== null && $education->employee) {
            $this->authorize('update', $education->employee);

            return;
        }

        $this->authorizeGeneralManage($request);
    }
}
