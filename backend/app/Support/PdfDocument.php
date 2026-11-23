<?php

namespace App\Support;

use Barryvdh\DomPDF\Facade\Pdf;
use Barryvdh\DomPDF\PDF as DomPdfDocument;
use Illuminate\Support\Facades\File;

class PdfDocument
{
    public const LANG_PT = 'pt';
    public const LANG_BILINGUAL = 'bilingual';

    public static function resolveLanguage(?string $lang): string
    {
        $normalized = strtolower(trim((string) $lang));

        return match ($normalized) {
            'pt', 'pt-pt', 'pt-ao', 'portuguese', 'portugues' => self::LANG_PT,
            default => self::LANG_BILINGUAL,
        };
    }

    /**
     * Render a Blade view as a DomPDF document with CJK/Mandarin font support.
     *
     * @param  array<string, mixed>  $data
     */
    public static function make(
        string $view,
        array $data = [],
        string $paper = 'a4',
        string $orientation = 'portrait',
        ?string $lang = null,
    ): DomPdfDocument {
        self::ensureMemoryHeadroom();

        $resolvedLang = self::resolveLanguage($lang);
        $fontCache = storage_path('framework/cache/dompdf/fonts');
        File::ensureDirectoryExists($fontCache);

        return Pdf::setOption([
            'font_dir' => $fontCache,
            'font_cache' => $fontCache,
            'chroot' => base_path(),
            'default_font' => 'DejaVu Sans',
            'isFontSubsettingEnabled' => true,
        ])
            ->loadView($view, array_merge($data, [
                'lang' => $resolvedLang,
                'isBilingual' => $resolvedLang === self::LANG_BILINGUAL,
            ]))
            ->setPaper($paper, $orientation);
    }

    private static function ensureMemoryHeadroom(string $target = '512M'): void
    {
        $current = trim((string) ini_get('memory_limit'));
        if ($current === '' || $current === '-1') {
            return;
        }

        $parseBytes = static function (string $val): int {
            $unit = strtolower(substr($val, -1));
            $num = (int) $val;

            return match ($unit) {
                'g' => $num * 1024 * 1024 * 1024,
                'm' => $num * 1024 * 1024,
                'k' => $num * 1024,
                default => $num,
            };
        };

        if ($parseBytes($current) < $parseBytes($target)) {
            @ini_set('memory_limit', $target);
        }
    }
}
