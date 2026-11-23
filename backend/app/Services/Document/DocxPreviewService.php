<?php

namespace App\Services\Document;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use ZipArchive;

class DocxPreviewService
{
    /**
     * Converte o conteúdo binário de um ficheiro .docx em HTML estruturado e seguro para visualização in-app.
     *
     * @return array{html: string, text: string, paragraphs_count: int, tables_count: int, images_count: int}
     */
    public function convertBinaryToHtml(string $binary): array
    {
        $tmpFile = tempnam(sys_get_temp_dir(), 'humancore_docx_');
        if ($tmpFile === false) {
            throw new \RuntimeException('Não foi possível criar ficheiro temporário para leitura do documento .docx.');
        }

        try {
            file_put_contents($tmpFile, $binary);

            $zip = new ZipArchive;
            if ($zip->open($tmpFile) !== true) {
                throw new \RuntimeException('O ficheiro não é um documento .docx (OpenXML) válido.');
            }

            $documentXml = $zip->getFromName('word/document.xml');
            if ($documentXml === false) {
                $zip->close();
                throw new \RuntimeException('Estrutura word/document.xml não encontrada no ficheiro .docx.');
            }

            $relsXml = $zip->getFromName('word/_rels/document.xml.rels');
            $mediaMap = $this->extractMediaRelationships($zip, $relsXml ?: '');
            $zip->close();

            return $this->parseDocumentXml($documentXml, $mediaMap);
        } finally {
            @unlink($tmpFile);
        }
    }

    /**
     * @return array<string, string>
     */
    protected function extractMediaRelationships(ZipArchive $zip, string $relsXml): array
    {
        if (trim($relsXml) === '') {
            return [];
        }

        $dom = new DOMDocument;
        if (! @$dom->loadXML($relsXml, LIBXML_NOERROR | LIBXML_NOWARNING)) {
            return [];
        }

        $map = [];
        foreach ($dom->getElementsByTagName('Relationship') as $rel) {
            if (! $rel instanceof DOMElement) {
                continue;
            }
            $id = $rel->getAttribute('Id');
            $target = $rel->getAttribute('Target');
            if (! $id || ! $target) {
                continue;
            }

            $normalizedTarget = 'word/'.ltrim($target, '/');
            if (str_starts_with($target, 'media/')) {
                $normalizedTarget = 'word/'.$target;
            }

            $ext = strtolower(pathinfo($normalizedTarget, PATHINFO_EXTENSION));
            $mime = match ($ext) {
                'png' => 'image/png',
                'jpg', 'jpeg' => 'image/jpeg',
                'gif' => 'image/gif',
                'webp' => 'image/webp',
                'svg' => 'image/svg+xml',
                default => null,
            };

            if (! $mime) {
                continue;
            }

            $imageBytes = $zip->getFromName($normalizedTarget);
            if ($imageBytes !== false && strlen($imageBytes) <= 5 * 1024 * 1024) {
                $map[$id] = 'data:'.$mime.';base64,'.base64_encode($imageBytes);
            }
        }

        return $map;
    }

    /**
     * @param  array<string, string>  $mediaMap
     * @return array{html: string, text: string, paragraphs_count: int, tables_count: int, images_count: int}
     */
    protected function parseDocumentXml(string $xml, array $mediaMap): array
    {
        $dom = new DOMDocument;
        if (! @$dom->loadXML($xml, LIBXML_NOERROR | LIBXML_NOWARNING)) {
            throw new \RuntimeException('Não foi possível interpretar o conteúdo XML do documento .docx.');
        }

        $xpath = new DOMXPath($dom);
        $xpath->registerNamespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
        $xpath->registerNamespace('a', 'http://schemas.openxmlformats.org/drawingml/2006/main');
        $xpath->registerNamespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships');
        $xpath->registerNamespace('v', 'urn:schemas-microsoft-com:vml');

        $bodyNodes = $xpath->query('//w:body');
        $body = $bodyNodes && $bodyNodes->length > 0 ? $bodyNodes->item(0) : $dom->documentElement;

        $htmlBlocks = [];
        $plainLines = [];
        $paragraphsCount = 0;
        $tablesCount = 0;
        $imagesCount = 0;
        $inList = false;

        if ($body) {
            foreach ($body->childNodes as $child) {
                if (! $child instanceof DOMElement) {
                    continue;
                }

                if ($child->localName === 'p') {
                    $parsedP = $this->renderParagraph($child, $xpath, $mediaMap, $imagesCount);
                    if ($parsedP['is_list']) {
                        if (! $inList) {
                            $htmlBlocks[] = '<ul class="docx-list">';
                            $inList = true;
                        }
                        $htmlBlocks[] = $parsedP['html'];
                    } else {
                        if ($inList) {
                            $htmlBlocks[] = '</ul>';
                            $inList = false;
                        }
                        if ($parsedP['html'] !== '') {
                            $htmlBlocks[] = $parsedP['html'];
                        }
                    }

                    if ($parsedP['text'] !== '') {
                        $plainLines[] = $parsedP['text'];
                        $paragraphsCount++;
                    }
                } elseif ($child->localName === 'tbl') {
                    if ($inList) {
                        $htmlBlocks[] = '</ul>';
                        $inList = false;
                    }
                    $parsedTable = $this->renderTable($child, $xpath, $mediaMap, $imagesCount);
                    $htmlBlocks[] = $parsedTable['html'];
                    if ($parsedTable['text'] !== '') {
                        $plainLines[] = $parsedTable['text'];
                    }
                    $tablesCount++;
                }
            }
        }

        if ($inList) {
            $htmlBlocks[] = '</ul>';
        }

        $htmlContent = implode("\n", $htmlBlocks);
        if (trim($htmlContent) === '') {
            $htmlContent = '<p class="docx-empty">Documento .docx sem texto visível.</p>';
        }

        return [
            'html' => '<div class="docx-document">'.$htmlContent.'</div>',
            'text' => implode("\n", $plainLines),
            'paragraphs_count' => $paragraphsCount,
            'tables_count' => $tablesCount,
            'images_count' => $imagesCount,
        ];
    }

    /**
     * @param  array<string, string>  $mediaMap
     * @return array{html: string, text: string, is_list: bool}
     */
    protected function renderParagraph(DOMElement $p, DOMXPath $xpath, array $mediaMap, int &$imagesCount): array
    {
        $styleNodes = $xpath->query('./w:pPr/w:pStyle', $p);
        $styleVal = ($styleNodes && $styleNodes->length > 0 && $styleNodes->item(0) instanceof DOMElement)
            ? strtolower($styleNodes->item(0)->getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'val') ?: $styleNodes->item(0)->getAttribute('w:val'))
            : '';

        $jcNodes = $xpath->query('./w:pPr/w:jc', $p);
        $align = ($jcNodes && $jcNodes->length > 0 && $jcNodes->item(0) instanceof DOMElement)
            ? strtolower($jcNodes->item(0)->getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'val') ?: $jcNodes->item(0)->getAttribute('w:val'))
            : '';

        $numPrNodes = $xpath->query('./w:pPr/w:numPr', $p);
        $isList = $numPrNodes !== false && $numPrNodes->length > 0;

        $inlineHtml = '';
        $plainText = '';

        foreach ($p->childNodes as $node) {
            if (! $node instanceof DOMElement) {
                continue;
            }

            if ($node->localName === 'r') {
                $run = $this->renderRun($node, $xpath, $mediaMap, $imagesCount);
                $inlineHtml .= $run['html'];
                $plainText .= $run['text'];
            } elseif ($node->localName === 'hyperlink') {
                foreach ($node->childNodes as $hChild) {
                    if ($hChild instanceof DOMElement && $hChild->localName === 'r') {
                        $run = $this->renderRun($hChild, $xpath, $mediaMap, $imagesCount);
                        $inlineHtml .= $run['html'];
                        $plainText .= $run['text'];
                    }
                }
            }
        }

        if (trim($inlineHtml) === '' && trim($plainText) === '') {
            return ['html' => '', 'text' => '', 'is_list' => false];
        }

        $alignStyle = match ($align) {
            'center' => ' style="text-align:center;"',
            'right', 'end' => ' style="text-align:right;"',
            'both', 'distribute' => ' style="text-align:justify;"',
            default => '',
        };

        if ($isList) {
            return [
                'html' => "<li{$alignStyle}>{$inlineHtml}</li>",
                'text' => '• '.trim($plainText),
                'is_list' => true,
            ];
        }

        $tag = match (true) {
            str_contains($styleVal, 'heading1') || str_contains($styleVal, 'titulo1') || $styleVal === 'title' => 'h1',
            str_contains($styleVal, 'heading2') || str_contains($styleVal, 'titulo2') || $styleVal === 'subtitle' => 'h2',
            str_contains($styleVal, 'heading3') || str_contains($styleVal, 'titulo3') => 'h3',
            str_contains($styleVal, 'heading4') || str_contains($styleVal, 'titulo4') => 'h4',
            default => 'p',
        };

        return [
            'html' => "<{$tag}{$alignStyle}>{$inlineHtml}</{$tag}>",
            'text' => trim($plainText),
            'is_list' => false,
        ];
    }

    /**
     * @param  array<string, string>  $mediaMap
     * @return array{html: string, text: string}
     */
    protected function renderRun(DOMElement $r, DOMXPath $xpath, array $mediaMap, int &$imagesCount): array
    {
        $bold = $this->isFormattingEnabled($xpath->query('./w:rPr/w:b', $r));
        $italic = $this->isFormattingEnabled($xpath->query('./w:rPr/w:i', $r));
        $underline = $this->isFormattingEnabled($xpath->query('./w:rPr/w:u', $r));
        $strike = $this->isFormattingEnabled($xpath->query('./w:rPr/w:strike', $r));

        $htmlParts = [];
        $textParts = [];

        foreach ($r->childNodes as $child) {
            if (! $child instanceof DOMElement) {
                continue;
            }

            if ($child->localName === 't') {
                $escaped = htmlspecialchars($child->textContent, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
                $htmlParts[] = $escaped;
                $textParts[] = $child->textContent;
            } elseif ($child->localName === 'tab') {
                $htmlParts[] = '&emsp;';
                $textParts[] = "\t";
            } elseif ($child->localName === 'br' || $child->localName === 'cr') {
                $htmlParts[] = '<br>';
                $textParts[] = "\n";
            } elseif ($child->localName === 'drawing' || $child->localName === 'pict') {
                $blips = $xpath->query('.//a:blip | .//v:imagedata', $child);
                if ($blips) {
                    foreach ($blips as $blip) {
                        if (! $blip instanceof DOMElement) {
                            continue;
                        }
                        $rId = $blip->getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed')
                            ?: $blip->getAttribute('r:embed')
                            ?: $blip->getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
                            ?: $blip->getAttribute('r:id');
                        if ($rId && isset($mediaMap[$rId])) {
                            $imagesCount++;
                            $htmlParts[] = '<img src="'.$mediaMap[$rId].'" alt="Imagem do documento" class="docx-image" />';
                        }
                    }
                }
            }
        }

        $html = implode('', $htmlParts);
        if ($html === '') {
            return ['html' => '', 'text' => ''];
        }

        if ($underline) {
            $html = "<u>{$html}</u>";
        }
        if ($strike) {
            $html = "<s>{$html}</s>";
        }
        if ($italic) {
            $html = "<em>{$html}</em>";
        }
        if ($bold) {
            $html = "<strong>{$html}</strong>";
        }

        return [
            'html' => $html,
            'text' => implode('', $textParts),
        ];
    }

    /**
     * @param  array<string, string>  $mediaMap
     * @return array{html: string, text: string}
     */
    protected function renderTable(DOMElement $tbl, DOMXPath $xpath, array $mediaMap, int &$imagesCount): array
    {
        $rowsHtml = [];
        $rowsText = [];
        $rowIndex = 0;

        foreach ($tbl->childNodes as $tr) {
            if (! $tr instanceof DOMElement || $tr->localName !== 'tr') {
                continue;
            }

            $cellsHtml = [];
            $cellsText = [];
            $isHeaderRow = $rowIndex === 0 && ($xpath->query('./w:trPr/w:tblHeader', $tr)?->length ?? 0) > 0;

            foreach ($tr->childNodes as $tc) {
                if (! $tc instanceof DOMElement || $tc->localName !== 'tc') {
                    continue;
                }

                $gridSpanNodes = $xpath->query('./w:tcPr/w:gridSpan', $tc);
                $colspan = 1;
                if ($gridSpanNodes && $gridSpanNodes->length > 0 && $gridSpanNodes->item(0) instanceof DOMElement) {
                    $val = $gridSpanNodes->item(0)->getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'val')
                        ?: $gridSpanNodes->item(0)->getAttribute('w:val');
                    $colspan = max(1, (int) $val);
                }

                $cellInnerHtml = [];
                $cellInnerText = [];
                foreach ($tc->childNodes as $p) {
                    if ($p instanceof DOMElement && $p->localName === 'p') {
                        $parsedP = $this->renderParagraph($p, $xpath, $mediaMap, $imagesCount);
                        if ($parsedP['html'] !== '') {
                            $cellInnerHtml[] = $parsedP['html'];
                        }
                        if ($parsedP['text'] !== '') {
                            $cellInnerText[] = $parsedP['text'];
                        }
                    }
                }

                $colspanAttr = $colspan > 1 ? " colspan=\"{$colspan}\"" : '';
                $cellTag = $isHeaderRow ? 'th' : 'td';
                $cellsHtml[] = "<{$cellTag}{$colspanAttr}>".implode('', $cellInnerHtml)."</{$cellTag}>";
                $cellsText[] = implode(' ', $cellInnerText);
            }

            if ($cellsHtml !== []) {
                $rowsHtml[] = '<tr>'.implode('', $cellsHtml).'</tr>';
                $rowsText[] = implode(' | ', $cellsText);
                $rowIndex++;
            }
        }

        return [
            'html' => '<div class="docx-table-wrap"><table class="docx-table">'.implode('', $rowsHtml).'</table></div>',
            'text' => implode("\n", $rowsText),
        ];
    }

    protected function isFormattingEnabled(?\DOMNodeList $nodes): bool
    {
        if (! $nodes || $nodes->length === 0) {
            return false;
        }
        $node = $nodes->item(0);
        if (! $node instanceof DOMElement) {
            return true;
        }
        $val = strtolower(
            $node->getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'val')
            ?: $node->getAttribute('w:val')
        );

        return ! in_array($val, ['0', 'false', 'none'], true);
    }
}
