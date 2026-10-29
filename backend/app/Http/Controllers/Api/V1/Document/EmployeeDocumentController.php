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

        $scopedToOwn = ! $request->user()->hasPermissionTo('view_any_document');

        $documents = EmployeeDocument::query()
            ->with('employee')
            ->when($scopedToOwn, fn ($q) => $q->where('employee_id', $request->user()->employee_id))
            ->when(
                ! $scopedToOwn && $request->filled('employee_id'),
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

    public function store(StoreEmployeeDocumentRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $file = $request->file('file');
        $filename = time().'_'.uniqid().'_'.str_replace(' ', '_', $file->getClientOriginalName());
        $file->move(public_path('uploads/documents'), $filename);
        $url = '/uploads/documents/'.$filename;

        $document = EmployeeDocument::create([
            'employee_id' => $validated['employee_id'],
            'tenant_id' => tenant_id(),
            'uploader_id' => $request->user()->id,
            'name' => $validated['name'],
            'document_type' => $validated['document_type'],
            'file_path' => $url,
            'original_name' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'file_size' => $file->getSize(),
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

    public function download(EmployeeDocument $document): StreamedResponse|JsonResponse
    {
        $this->authorize('view', $document);

        $publicFile = public_path(ltrim($document->file_path, '/'));
        if (file_exists($publicFile)) {
            return response()->download($publicFile, $document->original_name ?? $document->name);
        }

        if (Storage::disk('local')->exists($document->file_path)) {
            return Storage::disk('local')->download(
                $document->file_path,
                $document->original_name ?? $document->name
            );
        }

        return $this->error('Ficheiro não encontrado.', 404);
    }

    public function destroy(EmployeeDocument $document): JsonResponse
    {
        $this->authorize('delete', $document);

        $publicFile = public_path(ltrim($document->file_path, '/'));
        if (file_exists($publicFile)) {
            @unlink($publicFile);
        } elseif (Storage::disk('local')->exists($document->file_path)) {
            Storage::disk('local')->delete($document->file_path);
        }

        $document->delete();

        return $this->success(null, 'Documento eliminado com sucesso.');
    }
}
