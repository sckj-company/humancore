<?php

namespace App\Support;

use RuntimeException;
use Symfony\Component\Process\Process;

class PdfMergerService
{
    public function isValidPdf(string $binary): bool
    {
        return strlen($binary) > 32 && str_starts_with(ltrim($binary), '%PDF-');
    }

    /**
     * Merge an ordered list of PDF binaries into a single multi-page PDF.
     *
     * Invalid/corrupted individual external chunks are safely skipped if merging
     * fails so generated internal report sections remain printable.
     *
     * @param  array<int, string>  $pdfBinaries
     */
    public function merge(array $pdfBinaries): string
    {
        $chunks = array_values(array_filter(
            $pdfBinaries,
            fn ($bin) => is_string($bin) && $this->isValidPdf($bin)
        ));

        if ($chunks === []) {
            throw new RuntimeException('Nenhum documento PDF válido disponível para junção.');
        }

        if (count($chunks) === 1) {
            return $chunks[0];
        }

        $tempFiles = [];
        $outputFile = tempnam(sys_get_temp_dir(), 'hrms_pdf_out_');
        if ($outputFile === false) {
            throw new RuntimeException('Não foi possível criar ficheiro temporário para gerar PDF.');
        }
        $outputPdf = $outputFile.'.pdf';
        @unlink($outputFile);
        $tempFiles[] = $outputPdf;

        try {
            $chunkPaths = [];
            foreach ($chunks as $index => $binary) {
                $base = tempnam(sys_get_temp_dir(), "hrms_pdf_in_{$index}_");
                if ($base === false) {
                    continue;
                }
                $path = $base.'.pdf';
                @unlink($base);
                file_put_contents($path, $binary);
                $chunkPaths[] = $path;
                $tempFiles[] = $path;
            }

            if ($this->runMerger($chunkPaths, $outputPdf)) {
                $merged = file_get_contents($outputPdf);
                if (is_string($merged) && $this->isValidPdf($merged)) {
                    return $merged;
                }
            }

            // Fallback: isolate and keep only chunks that merge cleanly together
            $healthyPaths = [];
            foreach ($chunkPaths as $candidate) {
                $probe = $healthyPaths;
                $probe[] = $candidate;
                if (count($probe) === 1) {
                    if ($this->probeSinglePdf($candidate)) {
                        $healthyPaths[] = $candidate;
                    }
                } elseif ($this->runMerger($probe, $outputPdf)) {
                    $healthyPaths[] = $candidate;
                }
            }

            if (count($healthyPaths) === 1) {
                $single = file_get_contents($healthyPaths[0]);
                if (is_string($single) && $this->isValidPdf($single)) {
                    return $single;
                }
            }

            if (count($healthyPaths) > 1 && $this->runMerger($healthyPaths, $outputPdf)) {
                $merged = file_get_contents($outputPdf);
                if (is_string($merged) && $this->isValidPdf($merged)) {
                    return $merged;
                }
            }

            throw new RuntimeException('Falha ao combinar os documentos PDF selecionados.');
        } finally {
            foreach ($tempFiles as $path) {
                if (is_string($path) && file_exists($path)) {
                    @unlink($path);
                }
            }
        }
    }

    /**
     * @param  array<int, string>  $inputPaths
     */
    private function runMerger(array $inputPaths, string $outputPath): bool
    {
        if ($inputPaths === []) {
            return false;
        }

        @unlink($outputPath);

        if ($this->binaryExists('pdfunite')) {
            $process = new Process(array_merge(['pdfunite'], $inputPaths, [$outputPath]));
            $process->setTimeout(60);
            $process->run();
            if ($process->isSuccessful() && file_exists($outputPath) && filesize($outputPath) > 32) {
                return true;
            }
        }

        if ($this->binaryExists('gs')) {
            @unlink($outputPath);
            $process = new Process(array_merge([
                'gs',
                '-dBATCH',
                '-dNOPAUSE',
                '-q',
                '-sDEVICE=pdfwrite',
                "-sOutputFile={$outputPath}",
            ], $inputPaths));
            $process->setTimeout(60);
            $process->run();
            if ($process->isSuccessful() && file_exists($outputPath) && filesize($outputPath) > 32) {
                return true;
            }
        }

        return false;
    }

    private function probeSinglePdf(string $path): bool
    {
        $content = file_get_contents($path);
        if (! is_string($content) || ! $this->isValidPdf($content)) {
            return false;
        }

        if ($this->binaryExists('gs')) {
            $probeOut = $path.'.probe.pdf';
            $process = new Process([
                'gs',
                '-dBATCH',
                '-dNOPAUSE',
                '-q',
                '-sDEVICE=pdfwrite',
                "-sOutputFile={$probeOut}",
                $path,
            ]);
            $process->setTimeout(20);
            $process->run();
            if (file_exists($probeOut)) {
                @unlink($probeOut);
            }

            return $process->isSuccessful();
        }

        return true;
    }

    private function binaryExists(string $binary): bool
    {
        if (file_exists("/usr/bin/{$binary}")) {
            return true;
        }

        $check = new Process(['which', $binary]);
        $check->setTimeout(5);
        $check->run();

        return $check->isSuccessful() && trim($check->getOutput()) !== '';
    }
}
