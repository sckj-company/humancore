<?php

namespace App\Http\Controllers\Api\V1\Document;

use App\Http\Controllers\Api\V1\BaseController;
use App\Http\Requests\V1\Document\StoreEmployeeDocumentRequest;
use App\Http\Resources\V1\EmployeeDocumentResource;
use App\Models\EmployeeDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class EmployeeDocumentController extends BaseController
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', EmployeeDocument::class);

        $user = $request->user();
        $isPrivileged = $user->hasRole('super-admin') || $user->hasRole('admin') || $user->hasRole('hr-manager') || $user->can('view_any_document');
        $scopedToOwn = ! $isPrivileged;

        $documents = EmployeeDocument::query()
            ->with('employee')
            ->when($scopedToOwn, fn ($q) => $q->where('employee_id', $user->employee_id))
            ->when(
                $isPrivileged && $request->filled('employee_id'),
                fn ($q) => $q->where('employee_id', $request->integer('employee_id'))
            )
            ->when(
                $request->filled('document_type'),
                fn ($q) => $q->where('document_type', $request->string('document_type')->toString())
            )
            ->orderByDesc('created_at')
            ->paginate($request->integer('per_page', 20));

        return $this->paginated(EmployeeDocumentResource::collection($documents));
    }

    public function store(StoreEmployeeDocumentRequest $request, \App\Services\CloudinaryService $cloudinary): JsonResponse
    {
        $validated = $request->validated();

        $employee = \App\Models\Employee::findOrFail($validated['employee_id']);
        $tenantId = tenant_id() ?? $employee->tenant_id;

        $file = $request->file('file');
        $folder = 'humancore/tenants/'.$tenantId.'/documents';
        $uploadResult = $cloudinary->upload($file, $folder, 'auto');
        $url = $uploadResult['url'];

        $document = EmployeeDocument::create([
            'employee_id' => $validated['employee_id'],
            'tenant_id' => $tenantId,
            'uploader_id' => $request->user()->id,
            'name' => $validated['name'],
            'document_type' => $validated['document_type'],
            'file_path' => $url,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'file_size' => $uploadResult['bytes'] ?? $file->getSize(),
            'expiry_date' => $validated['expiry_date'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'is_confidential' => $request->boolean('is_confidential', false),
        ]);

        return $this->success(
            new EmployeeDocumentResource($document->load('employee')),
            'Documento carregado com sucesso.',
            201
        );
    }

    public function download(EmployeeDocument $document): StreamedResponse|JsonResponse|\Illuminate\Http\Response|\Illuminate\Http\RedirectResponse
    {
        $this->authorize('view', $document);

        $fileName = $document->original_name ?? $document->name;

        if (str_starts_with($document->file_path ?? '', 'http://') || str_starts_with($document->file_path ?? '', 'https://')) {
            // Use Cloudinary fl_attachment flag so Cloudinary sends Content-Disposition: attachment
            if (str_contains($document->file_path, 'cloudinary.com') && str_contains($document->file_path, '/upload/')) {
                $cleanName = rawurlencode(preg_replace('/[^\w\.\-\s]/u', '_', $fileName));
                $attachmentUrl = preg_replace('#/upload/(?:v\d+/)?#', '/upload/fl_attachment:' . $cleanName . '/', $document->file_path, 1);
                if ($attachmentUrl) {
                    return redirect()->away($attachmentUrl);
                }
            }

            try {
                $contents = @file_get_contents($document->file_path);
                if ($contents !== false) {
                    return response($contents, 200, [
                        'Content-Type' => $document->mime_type ?: 'application/octet-stream',
                        'Content-Disposition' => 'attachment; filename="' . addslashes($fileName) . '"',
                    ]);
                }
            } catch (\Throwable) {
                // fallback to redirect
            }

            return redirect()->away($document->file_path);
        }

        $publicFile = public_path(ltrim($document->file_path, '/'));
        if (file_exists($publicFile)) {
            return response()->download($publicFile, $fileName);
        }

        if (Storage::disk('local')->exists($document->file_path)) {
            return Storage::disk('local')->download(
                $document->file_path,
                $fileName
            );
        }

        return $this->error('Ficheiro não encontrado.', 404);
    }

    public function destroy(EmployeeDocument $document, \App\Services\CloudinaryService $cloudinary): JsonResponse
    {
        $this->authorize('delete', $document);

        if (str_starts_with($document->file_path ?? '', 'http://') || str_starts_with($document->file_path ?? '', 'https://')) {
            $cloudinary->delete($document->file_path);
        } else {
            $publicFile = public_path(ltrim($document->file_path, '/'));
            if (file_exists($publicFile)) {
                @unlink($publicFile);
            } elseif (Storage::disk('local')->exists($document->file_path)) {
                Storage::disk('local')->delete($document->file_path);
            }
        }

        $document->delete();

        return $this->success(null, 'Documento eliminado com sucesso.');
    }
}
