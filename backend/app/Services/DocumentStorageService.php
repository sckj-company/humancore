<?php

namespace App\Services;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentStorageService
{
    public function __construct(private readonly CloudinaryService $cloudinary) {}

    /**
     * Store an uploaded file (multipart or base64 JSON fallback) to Cloudinary or local disk.
     *
     * @return array{path: string, name: string, mime: string, size?: int|null}|null
     */
    public function storeFromRequest(
        Request $request,
        string $fileField,
        string $localDir,
        string $cloudinaryFolder,
        string $prefix = 'doc_',
        string $mimes = 'pdf,jpg,jpeg,png,webp',
        int $maxKb = 10240,
    ): ?array {
        $rawFile = $request->file($fileField);
        if ($rawFile !== null && ! $rawFile->isValid()) {
            $message = match ($rawFile->getError()) {
                UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => 'O ficheiro excede o limite máximo permitido pelo servidor PHP ('.ini_get('upload_max_filesize').').',
                UPLOAD_ERR_PARTIAL => 'O carregamento do ficheiro foi interrompido. Tente novamente.',
                UPLOAD_ERR_NO_TMP_DIR, UPLOAD_ERR_CANT_WRITE, UPLOAD_ERR_EXTENSION => 'Erro interno no diretório temporário ao gravar o ficheiro.',
                default => 'Não foi possível carregar o ficheiro selecionado.',
            };

            throw ValidationException::withMessages([$fileField => $message]);
        }

        if ($request->filled($fileField.'_base64')) {
            return $this->storeBase64($request, $fileField, $localDir, $cloudinaryFolder, $prefix);
        }

        if (! $rawFile instanceof UploadedFile) {
            return null;
        }

        $request->validate([
            $fileField => ['required', 'file', "mimes:{$mimes}", "max:{$maxKb}"],
        ]);

        $path = null;
        if ($this->hasCloudinary()) {
            try {
                $path = $this->cloudinary->upload($rawFile, $cloudinaryFolder, 'auto')['url'];
            } catch (\Throwable) {
                $path = null;
            }
        }

        if (! $path) {
            $path = $rawFile->store($localDir, 'local');
        }

        return [
            'path' => $path,
            'name' => $rawFile->getClientOriginalName(),
            'mime' => $rawFile->getClientMimeType() ?: ($rawFile->getMimeType() ?: 'application/octet-stream'),
            'size' => $rawFile->getSize() ?: null,
        ];
    }

    /**
     * Store raw generated file bytes (e.g., system PDF) to Cloudinary or local disk.
     *
     * @return array{path: string, name: string, mime: string, size: int}
     */
    public function storeBinary(
        string $binary,
        string $filename,
        string $mime,
        string $localDir,
        string $cloudinaryFolder,
        string $prefix = 'doc_',
    ): array {
        $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION) ?: 'pdf');
        $relativePath = rtrim($localDir, '/').'/'.uniqid($prefix, true).'.'.$ext;
        Storage::disk('local')->put($relativePath, $binary);

        $storedPath = $relativePath;
        if ($this->hasCloudinary()) {
            $tempFilePath = Storage::disk('local')->path($relativePath);
            try {
                $storedPath = $this->cloudinary->upload($tempFilePath, $cloudinaryFolder, 'auto')['url'];
                Storage::disk('local')->delete($relativePath);
            } catch (\Throwable) {
                $storedPath = $relativePath;
            }
        }

        return [
            'path' => $storedPath,
            'name' => $filename,
            'mime' => $mime,
            'size' => strlen($binary),
        ];
    }

    /**
     * Read stored document contents from local disk or remote Cloudinary URL.
     *
     * @return array{contents: string, mime: string, extension: string}|null
     */
    public function readBinary(string $path): ?array
    {
        if ($path === '') {
            return null;
        }

        if ($this->cloudinary->isCloudinaryUrl($path)) {
            try {
                $remote = Http::timeout(20)->get($path);
                if ($remote->successful()) {
                    $ext = strtolower((string) pathinfo((string) parse_url($path, PHP_URL_PATH), PATHINFO_EXTENSION));
                    $mime = strtolower((string) ($remote->header('Content-Type') ?: 'application/octet-stream'));

                    return [
                        'contents' => $remote->body(),
                        'mime' => $mime,
                        'extension' => $ext ?: $this->extensionFromMime($mime),
                    ];
                }
            } catch (\Throwable) {
                return null;
            }

            return null;
        }

        if (! Storage::disk('local')->exists($path)) {
            return null;
        }

        $contents = Storage::disk('local')->get($path);
        if ($contents === null) {
            return null;
        }

        $ext = strtolower((string) pathinfo($path, PATHINFO_EXTENSION));
        $mime = strtolower((string) (Storage::disk('local')->mimeType($path) ?: 'application/octet-stream'));

        return [
            'contents' => $contents,
            'mime' => $mime,
            'extension' => $ext ?: $this->extensionFromMime($mime),
        ];
    }

    private function extensionFromMime(string $mime): string
    {
        return match (true) {
            str_contains($mime, 'pdf') => 'pdf',
            str_contains($mime, 'png') => 'png',
            str_contains($mime, 'webp') => 'webp',
            str_contains($mime, 'jpeg'), str_contains($mime, 'jpg') => 'jpg',
            default => 'bin',
        };
    }

    public function delete(?string $path): void
    {
        if (! $path) {
            return;
        }

        if ($this->cloudinary->isCloudinaryUrl($path)) {
            $this->cloudinary->delete($path);
        } else {
            Storage::disk('local')->delete($path);
        }
    }

    public function download(string $path, string $fallbackFilename, bool $inline = false): Response|StreamedResponse|JsonResponse
    {
        $disposition = $inline ? 'inline' : 'attachment';

        if ($this->cloudinary->isCloudinaryUrl($path)) {
            try {
                $remote = Http::timeout(20)->get($path);
                if ($remote->successful()) {
                    $ext = pathinfo((string) parse_url($path, PHP_URL_PATH), PATHINFO_EXTENSION) ?: 'pdf';
                    $contentType = $remote->header('Content-Type') ?: 'application/octet-stream';
                    $filename = str_contains($fallbackFilename, '.') ? $fallbackFilename : "{$fallbackFilename}.{$ext}";

                    return response($remote->body(), 200, [
                        'Content-Type' => $contentType,
                        'Content-Disposition' => "{$disposition}; filename=\"{$filename}\"",
                    ]);
                }
            } catch (\Throwable) {
                // Fall through to error response
            }

            return response()->json([
                'success' => false,
                'message' => 'Não foi possível transferir o documento.',
            ], 502);
        }

        if (! Storage::disk('local')->exists($path)) {
            return response()->json([
                'success' => false,
                'message' => 'Documento não encontrado.',
            ], 404);
        }

        if ($inline) {
            $mime = Storage::disk('local')->mimeType($path) ?: 'application/octet-stream';
            $contents = Storage::disk('local')->get($path);

            return response($contents ?? '', 200, [
                'Content-Type' => $mime,
                'Content-Disposition' => "inline; filename=\"{$fallbackFilename}\"",
            ]);
        }

        return Storage::disk('local')->download($path, $fallbackFilename);
    }

    /**
     * @return array{path: string, name: string, mime: string}
     */
    private function storeBase64(
        Request $request,
        string $fileField,
        string $localDir,
        string $cloudinaryFolder,
        string $prefix,
    ): array {
        $validated = $request->validate([
            $fileField.'_base64' => ['required', 'string'],
            $fileField.'_name' => ['nullable', 'string', 'max:255'],
            $fileField.'_mime' => ['nullable', 'string', 'max:100'],
        ]);

        $payload = (string) $validated[$fileField.'_base64'];
        if (str_contains($payload, ',')) {
            [, $payload] = explode(',', $payload, 2);
        }

        $binary = base64_decode($payload, true);
        if ($binary === false || strlen($binary) === 0 || strlen($binary) > 10 * 1024 * 1024) {
            throw ValidationException::withMessages([
                $fileField => 'Ficheiro codificado inválido ou superior a 10 MB.',
            ]);
        }

        $mime = strtolower((string) ($validated[$fileField.'_mime'] ?? ''));
        $ext = match ($mime) {
            'application/pdf' => 'pdf',
            'image/jpeg', 'image/jpg' => 'jpg',
            'image/png' => 'png',
            'image/webp' => 'webp',
            default => strtolower(pathinfo((string) ($validated[$fileField.'_name'] ?? 'documento.pdf'), PATHINFO_EXTENSION) ?: 'pdf'),
        };

        if (! in_array($ext, ['pdf', 'jpg', 'jpeg', 'png', 'webp'], true)) {
            throw ValidationException::withMessages([
                $fileField => 'Formato não suportado. Envie PDF, JPG, PNG ou WEBP.',
            ]);
        }

        $relativePath = rtrim($localDir, '/').'/'.uniqid($prefix, true).'.'.$ext;
        Storage::disk('local')->put($relativePath, $binary);

        $storedPath = $relativePath;
        if ($this->hasCloudinary()) {
            $tempFilePath = Storage::disk('local')->path($relativePath);
            try {
                $storedPath = $this->cloudinary->upload($tempFilePath, $cloudinaryFolder, 'auto')['url'];
                Storage::disk('local')->delete($relativePath);
            } catch (\Throwable) {
                $storedPath = $relativePath;
            }
        }

        return [
            'path' => $storedPath,
            'name' => (string) ($validated[$fileField.'_name'] ?? ('documento.'.$ext)),
            'mime' => $mime ?: match ($ext) {
                'pdf' => 'application/pdf',
                'png' => 'image/png',
                'webp' => 'image/webp',
                default => 'image/jpeg',
            },
        ];
    }

    private function hasCloudinary(): bool
    {
        return ! app()->runningUnitTests()
            && filled(config('services.cloudinary.cloud_name'))
            && filled(config('services.cloudinary.api_key'))
            && filled(config('services.cloudinary.api_secret'));
    }
}
