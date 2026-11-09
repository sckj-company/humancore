<?php

namespace App\Services;

use App\Exceptions\IdentityDocumentOcrException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;

class IdentityDocumentOcrService
{
    private const MAX_PROVIDER_IMAGES = 3;

    private const MAX_PROVIDER_IMAGE_BYTES = 12 * 1024 * 1024;

    private const MAX_IMAGE_DIMENSION = 1800;

    private const MAX_IMAGE_PIXELS = 20_000_000;

    private const MAX_PROMPT_WORDS = 80;

    private const MAX_COMPLETION_TOKENS = 256;

    private const OCR_PROMPT = 'Read every page of the identity document. Extract only clearly visible values; never infer or guess. Return only JSON with keys first_name, last_name, id_document_number, birth_date, id_document_expiry, gender, nationality. Use ISO dates YYYY-MM-DD, gender male or female, and null for missing or unreadable values. Split the full name into first_name and last_name.';

    public function extract(UploadedFile $image): array
    {
        $mimeType = $image->getMimeType();
        $path = $image->getRealPath();
        if (! is_string($path)) {
            throw new IdentityDocumentOcrException('Não foi possível abrir o documento enviado.');
        }

        $temporaryDirectory = null;
        try {
            $images = match ($mimeType) {
                'image/png', 'image/jpeg' => [[
                    'mime_type' => $mimeType,
                    'contents' => file_get_contents($path) ?: throw new IdentityDocumentOcrException('Não foi possível ler a imagem enviada.'),
                ]],
                'application/pdf' => $this->pdfPagesAsImages($path, $temporaryDirectory),
                default => throw new IdentityDocumentOcrException('Formato não suportado. Envie uma imagem PNG/JPEG ou um documento PDF.'),
            };

            $images = array_map(fn (array $page) => $this->prepareImage($page['contents']), $images);

            return $this->extractFieldsWithGroq($images);
        } finally {
            if ($temporaryDirectory !== null) {
                File::deleteDirectory($temporaryDirectory);
            }
        }
    }

    private function pdfPagesAsImages(string $path, ?string &$temporaryDirectory): array
    {
        $info = new Process(['pdfinfo', $path]);
        $info->setTimeout(20);
        try {
            $info->run();
        } catch (\RuntimeException $exception) {
            throw new IdentityDocumentOcrException('A conversão de PDF não está disponível no servidor.', previous: $exception);
        }
        if (! $info->isSuccessful() || preg_match('/^Pages:\s+(\d+)/mi', $info->getOutput(), $matches) !== 1) {
            throw new IdentityDocumentOcrException('Não foi possível ler as páginas deste PDF. Verifique se o ficheiro não está protegido por palavra-passe.');
        }

        $pageCount = (int) $matches[1];
        $maxImages = $this->maxProviderImages();
        $maxPages = min($maxImages, max(1, (int) config('services.groq.max_pdf_pages', $maxImages)));
        if ($pageCount < 1 || $pageCount > $maxPages) {
            throw new IdentityDocumentOcrException("O PDF deve conter entre 1 e {$maxPages} páginas para leitura.");
        }

        $temporaryDirectory = sys_get_temp_dir().'/humancore-ocr-'.Str::uuid();
        File::makeDirectory($temporaryDirectory, 0700, true);
        $prefix = $temporaryDirectory.'/page';

        $render = new Process(['pdftoppm', '-f', '1', '-l', (string) $pageCount, '-jpeg', '-scale-to', (string) self::MAX_IMAGE_DIMENSION, $path, $prefix]);
        $render->setTimeout(45);
        try {
            $render->run();
        } catch (\RuntimeException $exception) {
            throw new IdentityDocumentOcrException('A conversão de PDF não está disponível no servidor.', previous: $exception);
        }
        if (! $render->isSuccessful()) {
            throw new IdentityDocumentOcrException('Não foi possível converter as páginas do PDF para leitura.');
        }

        $pagePaths = glob($prefix.'-*.jpg') ?: [];
        sort($pagePaths, SORT_NATURAL);
        if (count($pagePaths) !== $pageCount) {
            throw new IdentityDocumentOcrException('Não foi possível preparar todas as páginas do PDF para leitura.');
        }

        $images = [];
        foreach ($pagePaths as $pagePath) {
            $contents = file_get_contents($pagePath);
            if ($contents === false) {
                throw new IdentityDocumentOcrException('Não foi possível ler uma das páginas do PDF.');
            }
            $images[] = ['mime_type' => 'image/jpeg', 'contents' => $contents];
        }

        return $images;
    }

    private function extractFieldsWithGroq(array $images): array
    {
        if (count($images) > $this->maxProviderImages()) {
            throw new IdentityDocumentOcrException('O documento excede o número máximo de imagens por pedido.');
        }

        $maxImageBytes = min(self::MAX_PROVIDER_IMAGE_BYTES, max(1, (int) config(
            'services.groq.max_image_bytes',
            self::MAX_PROVIDER_IMAGE_BYTES,
        )));
        $totalImageBytes = array_sum(array_map(fn (array $image) => strlen($image['contents']), $images));
        if ($totalImageBytes > $maxImageBytes) {
            throw new IdentityDocumentOcrException('As imagens do documento excedem o limite de tamanho para processamento.');
        }

        $maxPromptWords = min(
            self::MAX_PROMPT_WORDS,
            max(1, (int) config('services.groq.max_prompt_words', self::MAX_PROMPT_WORDS)),
        );
        preg_match_all('/[\p{L}\p{N}_-]+/u', self::OCR_PROMPT, $promptWords);
        if (count($promptWords[0] ?? []) > $maxPromptWords) {
            throw new IdentityDocumentOcrException('A instrução interna do OCR excede o limite de palavras configurado.');
        }

        $maxCompletionTokens = min(
            self::MAX_COMPLETION_TOKENS,
            max(64, (int) config('services.groq.max_completion_tokens', self::MAX_COMPLETION_TOKENS)),
        );
        $content = [[
            'type' => 'text',
            'text' => self::OCR_PROMPT,
        ]];

        foreach ($images as $image) {
            $content[] = [
                'type' => 'image_url',
                'image_url' => [
                    'url' => 'data:'.$image['mime_type'].';base64,'.base64_encode($image['contents']),
                ],
            ];
        }

        $baseUrl = rtrim((string) config('services.groq.base_url'), '/');
        $response = Http::timeout(90)
            ->connectTimeout(10)
            ->withToken((string) config('services.groq.key'))
            ->post($baseUrl.'/chat/completions', [
                'model' => config('services.groq.model'),
                'temperature' => 0,
                'max_completion_tokens' => $maxCompletionTokens,
                'response_format' => ['type' => 'json_object'],
                'messages' => [
                    ['role' => 'user', 'content' => $content],
                ],
            ])
            ->throw();

        $answer = $response->json('choices.0.message.content');
        if (! is_string($answer) || trim($answer) === '') {
            throw new IdentityDocumentOcrException('A resposta do serviço de leitura está vazia ou inválida.');
        }

        $fields = json_decode($answer, true);
        if (! is_array($fields)) {
            throw new IdentityDocumentOcrException('Não foi possível interpretar os dados lidos do documento.');
        }

        return $this->normalizeExtractedFields($fields);
    }

    private function prepareImage(string $contents): array
    {
        $imageInfo = getimagesizefromstring($contents);
        if ($imageInfo === false || ! isset($imageInfo[0], $imageInfo[1])) {
            throw new IdentityDocumentOcrException('Uma das páginas não contém uma imagem válida.');
        }

        [$width, $height] = [(int) $imageInfo[0], (int) $imageInfo[1]];
        if ($width < 1 || $height < 1 || $width * $height > self::MAX_IMAGE_PIXELS) {
            throw new IdentityDocumentOcrException('A resolução da imagem excede o limite para processamento.');
        }

        $source = imagecreatefromstring($contents);
        if ($source === false) {
            throw new IdentityDocumentOcrException('Não foi possível descodificar uma das imagens do documento.');
        }

        $scale = min(1, self::MAX_IMAGE_DIMENSION / max($width, $height));
        $targetWidth = max(1, (int) round($width * $scale));
        $targetHeight = max(1, (int) round($height * $scale));
        $target = imagecreatetruecolor($targetWidth, $targetHeight);

        try {
            $white = imagecolorallocate($target, 255, 255, 255);
            imagefill($target, 0, 0, $white);
            imagecopyresampled($target, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);
            ob_start();
            imagejpeg($target, null, 75);
            $jpeg = ob_get_clean();
        } finally {
            imagedestroy($source);
            imagedestroy($target);
        }

        if (! is_string($jpeg) || $jpeg === '') {
            throw new IdentityDocumentOcrException('Não foi possível preparar uma imagem para processamento.');
        }

        return ['mime_type' => 'image/jpeg', 'contents' => $jpeg];
    }

    private function maxProviderImages(): int
    {
        return min(
            self::MAX_PROVIDER_IMAGES,
            max(1, (int) config('services.groq.max_images', self::MAX_PROVIDER_IMAGES)),
        );
    }

    private function normalizeExtractedFields(array $data): array
    {
        $fields = [];
        foreach (['first_name', 'last_name', 'id_document_number', 'nationality'] as $field) {
            $value = $data[$field] ?? null;
            if (is_string($value) && trim($value) !== '') {
                $fields[$field] = trim($value);
            }
        }

        if (! isset($fields['first_name']) && is_string($data['full_name'] ?? null)) {
            $nameParts = preg_split('/\s+/u', trim($data['full_name']), 2, PREG_SPLIT_NO_EMPTY) ?: [];
            if (isset($nameParts[0])) {
                $fields['first_name'] = $nameParts[0];
            }
            if (isset($nameParts[1])) {
                $fields['last_name'] = $nameParts[1];
            }
        }

        foreach (['birth_date' => 'birth_date', 'id_document_expiry' => 'id_document_expiry'] as $source => $target) {
            $value = $data[$source] ?? null;
            $date = is_string($value) ? $this->normalizeDate($value) : null;
            if ($date !== null) {
                $fields[$target] = $date;
            }
        }

        $gender = is_string($data['gender'] ?? null) ? mb_strtolower(trim($data['gender'])) : '';
        if (in_array($gender, ['male', 'm', 'masculino'], true)) {
            $fields['gender'] = 'male';
        } elseif (in_array($gender, ['female', 'f', 'feminino'], true)) {
            $fields['gender'] = 'female';
        }

        return $fields;
    }

    private function normalizeDate(string $value): ?string
    {
        if (preg_match('/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/u', $value, $match) === 1) {
            $day = (int) $match[1];
            $month = (int) $match[2];
            $year = (int) $match[3];
        } elseif (preg_match('/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/u', $value, $match) === 1) {
            $year = (int) $match[1];
            $month = (int) $match[2];
            $day = (int) $match[3];
        } else {
            return null;
        }

        return checkdate($month, $day, $year)
            ? sprintf('%04d-%02d-%02d', $year, $month, $day)
            : null;
    }
}
