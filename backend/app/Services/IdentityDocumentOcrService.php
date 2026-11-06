<?php

namespace App\Services;

use App\Exceptions\IdentityDocumentOcrException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;

class IdentityDocumentOcrService
{
    public function extract(UploadedFile $image): array
    {
        $mimeType = $image->getMimeType();
        $fileType = match ($mimeType) {
            'application/pdf' => 'PDF',
            'image/png' => 'PNG',
            'image/jpeg' => 'JPG',
            default => throw new IdentityDocumentOcrException('Formato não suportado pelo OCR.space: '.($mimeType ?: 'desconhecido').'.'),
        };

        $path = $image->getRealPath();
        $stream = is_string($path) ? fopen($path, 'rb') : false;

        if ($stream === false) {
            throw new IdentityDocumentOcrException('Não foi possível abrir a imagem.');
        }

        try {
            $response = Http::timeout(30)
                ->connectTimeout(10)
                ->withHeaders(['apikey' => config('services.ocr_space.key')])
                ->attach('file', $stream, 'identity-document.'.($image->guessExtension() ?? 'img'))
                ->post(config('services.ocr_space.endpoint'), [
                    'OCREngine' => 2,
                    'filetype' => $fileType,
                    'isOverlayRequired' => 'false',
                    'scale' => 'true',
                ])
                ->throw();
        } finally {
            fclose($stream);
        }

        $payload = $response->json();
        $hasProviderError = is_array($payload)
            && in_array($payload['IsErroredOnProcessing'] ?? false, [true, 'true', 1, '1'], true);

        if (! is_array($payload)) {
            throw new IdentityDocumentOcrException('Resposta inválida do OCR.space.');
        }

        if ($hasProviderError) {
            throw new IdentityDocumentOcrException($this->providerErrorMessage($payload));
        }

        $parsedResults = $payload['ParsedResults'] ?? null;
        if (! is_array($parsedResults)) {
            return [];
        }

        $text = implode("\n", array_filter(
            array_map(
                fn (mixed $result): string => is_array($result) && is_string($result['ParsedText'] ?? null)
                    ? $result['ParsedText']
                    : '',
                $parsedResults,
            ),
            fn (string $pageText): bool => trim($pageText) !== '',
        ));

        if (trim($text) === '') {
            $providerError = $this->providerErrorMessage($payload);
            if ($providerError !== '') {
                throw new IdentityDocumentOcrException($providerError);
            }

            return [];
        }

        return $this->parseFields($text);
    }

    private function providerErrorMessage(array $payload): string
    {
        $messages = [];

        foreach (['ErrorMessage', 'ErrorDetails'] as $key) {
            $value = $payload[$key] ?? null;
            if (is_string($value) && trim($value) !== '') {
                $messages[] = trim($value);
            } elseif (is_array($value)) {
                foreach ($value as $message) {
                    if (is_string($message) && trim($message) !== '') {
                        $messages[] = trim($message);
                    }
                }
            }
        }

        foreach ($payload['ParsedResults'] ?? [] as $result) {
            if (! is_array($result)) {
                continue;
            }

            foreach (['ErrorMessage', 'ErrorDetails'] as $key) {
                $value = $result[$key] ?? null;
                if (is_string($value) && trim($value) !== '') {
                    $messages[] = trim($value);
                }
            }
        }

        return mb_substr(implode(' | ', array_unique($messages)), 0, 500);
    }

    private function parseFields(string $text): array
    {
        $lines = array_values(array_filter(
            array_map('trim', preg_split('/\R/u', $text) ?: []),
            fn (string $line): bool => $line !== '',
        ));

        $fields = [];
        $fullName = $this->labeledValue($lines, '/^nome(?:\s+completo)?\s*[:\-]?\s*(.*)$/iu');

        if ($fullName !== null) {
            $nameParts = preg_split('/\s+/u', $fullName, 2, PREG_SPLIT_NO_EMPTY) ?: [];
            if (isset($nameParts[0])) {
                $fields['first_name'] = $nameParts[0];
            }
            if (isset($nameParts[1])) {
                $fields['last_name'] = $nameParts[1];
            }
        }

        $documentNumber = $this->labeledValue(
            $lines,
            '/^(?:(?:n[º°.]?\s*)?(?:do\s+)?bi|n[uú]mero\s+do\s+bi)\s*[:\-]?\s*(.*)$/iu',
        );
        if (preg_match('/\b\d{9}\s*[a-z]{2}\s*\d{3}\b/iu', $text, $match) === 1) {
            $fields['id_document_number'] = strtoupper(preg_replace('/\s+/', '', $match[0]) ?? $match[0]);
        } elseif ($documentNumber !== null) {
            $fields['id_document_number'] = $documentNumber;
        }

        $birthDate = $this->labeledValue($lines, '/^(?:data\s+de\s+)?nascimento\s*[:\-]?\s*(.*)$/iu');
        $normalizedBirthDate = $birthDate === null ? null : $this->normalizeDate($birthDate);
        if ($normalizedBirthDate !== null) {
            $fields['birth_date'] = $normalizedBirthDate;
        }

        $expiryDate = $this->labeledValue(
            $lines,
            '/^(?:data\s+de\s+)?(?:validade|expira[cç][aã]o)\s*[:\-]?\s*(.*)$/iu',
        );
        $normalizedExpiryDate = $expiryDate === null ? null : $this->normalizeDate($expiryDate);
        if ($normalizedExpiryDate !== null) {
            $fields['id_document_expiry'] = $normalizedExpiryDate;
        }

        $gender = $this->labeledValue($lines, '/^sexo\s*[:\-]?\s*(.*)$/iu');
        if ($gender !== null) {
            $normalizedGender = mb_strtolower($gender);
            if (preg_match('/^(?:m|masculino)\b/u', $normalizedGender) === 1) {
                $fields['gender'] = 'male';
            } elseif (preg_match('/^(?:f|feminino)\b/u', $normalizedGender) === 1) {
                $fields['gender'] = 'female';
            }
        }

        $nationality = $this->labeledValue($lines, '/^nacionalidade\s*[:\-]?\s*(.*)$/iu');
        if ($nationality !== null) {
            $fields['nationality'] = $nationality;
        }

        return $fields;
    }

    private function labeledValue(array $lines, string $pattern): ?string
    {
        foreach ($lines as $index => $line) {
            if (preg_match($pattern, $line, $match) !== 1) {
                continue;
            }

            $value = trim($match[1] ?? '', " \t\n\r\0\x0B:-–—");
            if ($value !== '') {
                return $value;
            }

            $nextLine = $lines[$index + 1] ?? null;

            return is_string($nextLine) && ! preg_match('/^[\p{L}\s]+[:：]/u', $nextLine)
                ? $nextLine
                : null;
        }

        return null;
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
