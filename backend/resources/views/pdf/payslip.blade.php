<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Recibo de Vencimento</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bilingualLabel = static fn (string $portuguese, string $mandarin): string => $isBilingual
            ? '<span class="label-pt">'.e($portuguese).'</span><span class="label-zh">'.e($mandarin).'</span>'
            : '<span class="label-pt">'.e($portuguese).'</span>';
        $bilingualInline = static fn (string $portuguese, string $mandarin): string => $isBilingual
            ? e($portuguese).' <span class="zh-inline">/ '.e($mandarin).'</span>'
            : e($portuguese);
    @endphp
    <style>
        @page { size: A4 portrait; margin: 14mm 14mm; }
        @if($isBilingual)
        @font-face {
            font-family: 'Droid Sans Fallback';
            src: url('{{ resource_path('fonts/DroidSansFallbackFull.ttf') }}') format('truetype');
            font-weight: normal;
            font-style: normal;
        }
        @font-face {
            font-family: 'Droid Sans Fallback';
            src: url('{{ resource_path('fonts/DroidSansFallbackFull.ttf') }}') format('truetype');
            font-weight: bold;
            font-style: normal;
        }
        @endif
        * { box-sizing: border-box; }
        body {
            font-family: 'DejaVu Sans', 'Droid Sans Fallback', sans-serif;
            font-size: 9px;
            line-height: 1.35;
            color: #1e293b;
            margin: 0;
            padding: 0;
        }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .header { border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 10px; }
        .header td { vertical-align: top; }
        .header-left { width: 60%; }
        .header-right { width: 40%; text-align: right; }
        .company { font-size: 13px; font-weight: bold; color: #0f172a; margin-bottom: 2px; }
        .title { color: #2563eb; font-size: 14px; font-weight: bold; }
        .title-zh { color: #475569; font-size: 9px; font-weight: normal; margin-top: 1px; }
        .meta { color: #64748b; font-size: 8px; margin-top: 1px; }
        .bilingual { line-height: 1.25; }
        .label-pt, .label-zh { display: block; }
        .label-zh { color: #64748b; font-size: 7.5px; margin-top: 1px; }
        .zh-inline { color: #64748b; font-size: 8px; font-weight: normal; }
        .info {
            margin-bottom: 10px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
        }
        .info td {
            width: 25%;
            padding: 5px 8px;
            vertical-align: top;
            border-right: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
        }
        .info tr td:last-child { border-right: none; }
        .info tr:last-child td { border-bottom: none; }
        .info-label { color: #64748b; font-size: 7.5px; }
        .info-value { font-size: 9px; font-weight: bold; margin-top: 2px; color: #0f172a; }
        .block {
            margin-bottom: 9px;
            border: 1px solid #cbd5e1;
            page-break-inside: avoid;
        }
        .section-title {
            background: #eaf0f8;
            border-left: 3px solid #2563eb;
            border-bottom: 1px solid #cbd5e1;
            color: #1e3a8a;
            font-size: 9.5px;
            font-weight: bold;
            padding: 5px 8px;
        }
        .items th, .items td {
            border-bottom: 1px solid #e2e8f0;
            padding: 4px 8px;
            text-align: left;
            vertical-align: middle;
        }
        .items tr:last-child td { border-bottom: none; }
        .items th {
            background: #f8fafc;
            color: #475569;
            font-size: 8px;
            font-weight: bold;
        }
        .col-desc { width: 70%; }
        .col-amount { width: 30%; text-align: right !important; white-space: nowrap; }
        .items td.col-amount { font-weight: normal; color: #0f172a; }
        .subtotal td {
            background: #f1f5f9;
            border-top: 1px solid #cbd5e1;
            border-bottom: 1px solid #cbd5e1;
            font-weight: bold;
            padding: 5px 8px;
        }
        .empty { color: #94a3b8; font-style: italic; padding: 6px 8px !important; }
        .employer .section-title {
            background: #f1f5f9;
            border-left-color: #64748b;
            color: #334155;
        }
        .summary {
            border: 1px solid #cbd5e1;
            margin-top: 10px;
            page-break-inside: avoid;
        }
        .summary td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
        .summary tr:last-child td { border-bottom: none; }
        .summary .summary-label { width: 65%; color: #475569; }
        .summary .summary-value { width: 35%; font-weight: bold; text-align: right; white-space: nowrap; color: #0f172a; }
        .summary .net td { background: #2563eb; color: #ffffff; font-size: 11px; font-weight: bold; padding: 7px 8px; }
        .summary .net .zh-inline { color: #dbeafe; }
        .summary .net .summary-value { color: #ffffff; }
        .signatures { margin-top: 18px; page-break-inside: avoid; }
        .signatures td { width: 50%; padding: 0 18px; text-align: center; vertical-align: bottom; }
        .sig-line { border-top: 1px solid #94a3b8; padding-top: 4px; font-size: 8px; color: #475569; margin-top: 22px; }
        .footer { border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 7.5px; margin-top: 12px; padding-top: 5px; text-align: center; }
    </style>
</head>
<body>
    @include('pdf.partials.payslip-sheet', [
        'record' => $record,
        'operatorName' => $operatorName ?? null,
        'isBilingual' => $isBilingual,
        'bilingualLabel' => $bilingualLabel,
        'bilingualInline' => $bilingualInline,
    ])
</body>
</html>
