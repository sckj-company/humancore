<?php

namespace App\Services;

use CURLFile;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;

class CloudinaryService
{
    protected string $cloudName;
    protected string $apiKey;
    protected string $apiSecret;

    public function __construct()
    {
        $this->cloudName = config('services.cloudinary.cloud_name') ?? env('CLOUDINARY_CLOUD_NAME', 'rumbh1oe');
        $this->apiKey = config('services.cloudinary.api_key') ?? env('CLOUDINARY_API_KEY', '561594311682618');
        $this->apiSecret = config('services.cloudinary.api_secret') ?? env('CLOUDINARY_API_SECRET', 'KCGmwQAODoiIiVhr-MI9A1ZIMNU');
    }

    /**
     * Upload a file to Cloudinary.
     *
     * @param UploadedFile|string $file
     * @param string $folder
     * @param string $resourceType ('auto', 'image', 'raw', 'video')
     * @return array{url: string, public_id: string, resource_type: string, bytes: ?int, format: ?string}
     */
    public function upload(UploadedFile|string $file, string $folder = 'humancore/documents', string $resourceType = 'auto'): array
    {
        if (empty($this->cloudName) || empty($this->apiKey) || empty($this->apiSecret)) {
            Log::warning('Cloudinary credentials missing, falling back to local file storage.');
            return $this->fallbackLocalUpload($file, $folder);
        }

        try {
            $timestamp = time();
            $params = [
                'folder' => $folder,
                'timestamp' => $timestamp,
            ];

            ksort($params);
            $paramPairs = [];
            foreach ($params as $k => $v) {
                $paramPairs[] = $k . '=' . $v;
            }
            $signature = sha1(implode('&', $paramPairs) . $this->apiSecret);

            $endpoint = "https://api.cloudinary.com/v1_1/{$this->cloudName}/{$resourceType}/upload";

            // Resolve file path and mime type
            $filePath = $file instanceof UploadedFile ? $file->getRealPath() : $file;
            $mimeType = $file instanceof UploadedFile ? $file->getMimeType() : (mime_content_type($filePath) ?: 'application/octet-stream');
            $originalName = $file instanceof UploadedFile ? $file->getClientOriginalName() : basename($filePath);

            $cfile = new CURLFile($filePath, $mimeType, $originalName);

            $postData = [
                'file' => $cfile,
                'api_key' => $this->apiKey,
                'timestamp' => $timestamp,
                'folder' => $folder,
                'signature' => $signature,
            ];

            $ch = curl_init($endpoint);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
            curl_setopt($ch, CURLOPT_TIMEOUT, 60);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300 && $response) {
                $json = json_decode($response, true);
                if (isset($json['secure_url']) || isset($json['url'])) {
                    return [
                        'url' => $json['secure_url'] ?? $json['url'],
                        'public_id' => $json['public_id'] ?? '',
                        'resource_type' => $json['resource_type'] ?? $resourceType,
                        'bytes' => $json['bytes'] ?? null,
                        'format' => $json['format'] ?? null,
                    ];
                }
            }

            Log::error('Cloudinary upload API returned error', [
                'http_code' => $httpCode,
                'response' => $response,
                'curl_error' => $curlError,
            ]);

            return $this->fallbackLocalUpload($file, $folder);
        } catch (\Throwable $e) {
            Log::error('Exception during Cloudinary upload: ' . $e->getMessage(), [
                'exception' => $e,
            ]);
            return $this->fallbackLocalUpload($file, $folder);
        }
    }

    /**
     * Delete a file from Cloudinary by URL or public ID.
     */
    public function delete(string $urlOrPublicId, ?string $resourceType = null): bool
    {
        if (empty($urlOrPublicId)) {
            return false;
        }

        $publicId = $urlOrPublicId;

        // If a full Cloudinary URL is given, extract resource type and public ID
        if ($this->isCloudinaryUrl($urlOrPublicId)) {
            if (preg_match('#res\.cloudinary\.com/[^/]+/(image|raw|video)/upload/(?:v\d+/)?(.+)$#i', $urlOrPublicId, $matches)) {
                $resourceType = $resourceType ?: $matches[1];
                $publicIdPart = $matches[2];
                // For images, Cloudinary public_ids don't have the file extension in destroy calls
                if ($resourceType === 'image') {
                    $publicId = preg_replace('/\.[^.]+$/', '', $publicIdPart);
                } else {
                    $publicId = $publicIdPart;
                }
            }
        }

        $resourceType = $resourceType ?: 'raw';

        try {
            $timestamp = time();
            $params = [
                'public_id' => $publicId,
                'timestamp' => $timestamp,
            ];

            ksort($params);
            $paramPairs = [];
            foreach ($params as $k => $v) {
                $paramPairs[] = $k . '=' . $v;
            }
            $signature = sha1(implode('&', $paramPairs) . $this->apiSecret);

            $endpoint = "https://api.cloudinary.com/v1_1/{$this->cloudName}/{$resourceType}/destroy";

            $ch = curl_init($endpoint);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_POST, true);
            curl_setopt($ch, CURLOPT_POSTFIELDS, [
                'public_id' => $publicId,
                'api_key' => $this->apiKey,
                'timestamp' => $timestamp,
                'signature' => $signature,
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 30);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode >= 200 && $httpCode < 300 && $response) {
                $json = json_decode($response, true);
                return isset($json['result']) && in_array($json['result'], ['ok', 'not found']);
            }

            return false;
        } catch (\Throwable $e) {
            Log::warning('Exception deleting from Cloudinary: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Check if a URL belongs to Cloudinary.
     */
    public function isCloudinaryUrl(string $url): bool
    {
        return str_contains($url, 'res.cloudinary.com');
    }

    /**
     * Local storage fallback in case of Cloudinary unavailability.
     */
    protected function fallbackLocalUpload(UploadedFile|string $file, string $folder): array
    {
        $folderName = str_replace('humancore/', '', $folder);
        $folderName = str_replace(['tenants/', 'documents', 'photos', 'contracts'], ['tenants/', 'documents', 'photos', 'contracts'], $folderName);
        $targetDir = public_path('uploads/' . trim($folderName, '/'));

        if (! is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        if ($file instanceof UploadedFile) {
            $filename = time() . '_' . uniqid() . '_' . str_replace(' ', '_', $file->getClientOriginalName());
            $file->move($targetDir, $filename);
            $url = '/uploads/' . trim($folderName, '/') . '/' . $filename;

            return [
                'url' => $url,
                'public_id' => $filename,
                'resource_type' => 'local',
                'bytes' => $file->getSize(),
                'format' => $file->getClientOriginalExtension(),
            ];
        }

        $filename = time() . '_' . uniqid() . '_' . basename($file);
        copy($file, $targetDir . '/' . $filename);
        $url = '/uploads/' . trim($folderName, '/') . '/' . $filename;

        return [
            'url' => $url,
            'public_id' => $filename,
            'resource_type' => 'local',
            'bytes' => file_exists($file) ? filesize($file) : 0,
            'format' => pathinfo($file, PATHINFO_EXTENSION),
        ];
    }
}
