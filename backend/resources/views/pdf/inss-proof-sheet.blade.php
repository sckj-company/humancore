<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Comprovativo INSS — {{ $tenant->name }}</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bi = static fn (string $pt, string $zh): string => $isBilingual
            ? e($pt).' <span class="zh-inline">/ '.e($zh).'</span>'
            : e($pt);
    @endphp
    <style>
        @page { size: A4 portrait; margin: 12mm 13mm; }
        @if($isBilingual)
        @font-face {
            font-family: 'Droid Sans Fallback';
            src: url('{{ resource_path('fonts/DroidSansFallbackFull.ttf') }}') format('truetype');
            font-weight: normal;
            font-style: normal;
        }
        @endif
        * { box-sizing: border-box; }
        body { font-family: {{ $isBilingual ? "'Droid Sans Fallback', " : '' }}'DejaVu Sans', sans-serif; font-size: 9px; color: #1e293b; margin: 0; }
        table { width: 100%; border-collapse: collapse; }
        .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 7px; margin-bottom: 10px; }
        .company { font-size: 12px; font-weight: bold; }
        .title { font-size: 13px; font-weight: bold; color: #1d4ed8; text-align: right; }
        .meta { font-size: 8px; color: #64748b; }
        .zh-inline { color: #64748b; font-size: 7.5px; font-weight: normal; }
        .info-table { margin-bottom: 10px; border: 1px solid #cbd5e1; background: #f8fafc; }
        .info-table td { padding: 6px 8px; border: 1px solid #e2e8f0; vertical-align: top; }
        .label { font-size: 7.2px; color: #64748b; display: block; }
        .value { font-size: 9px; font-weight: bold; color: #0f172a; margin-top: 2px; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 8.2px; font-weight: bold; }
        .badge-ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .badge-no { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .badge-warn { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
        .preview-box {
            border: 1px solid #cbd5e1;
            padding: 10px;
            text-align: center;
            background: #ffffff;
            margin-top: 8px;
        }
        .preview-box img { max-width: 100%; max-height: 185mm; object-fit: contain; }
        .note-box {
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            padding: 14px;
            font-size: 9.2px;
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td style="width: 55%;">
                <div class="company">{{ $tenant->name }}</div>
                <div class="meta">NIF: {{ $tenant->tax_id ?? '—' }} · Nº INSS: {{ $tenant->inss_number ?? '—' }}</div>
            </td>
            <td style="width: 45%; text-align: right;">
                <div class="title">{!! $bi('COMPROVATIVO DE PAGAMENTO INSS', '社保付款凭证') !!}</div>
                <div class="meta">{!! $bi('Período', '期间') !!}: {{ $period->displayName() }}</div>
            </td>
        </tr>
    </table>

    <table class="info-table">
        <tr>
            <td style="width: 50%;">
                <span class="label">{!! $bi('Título do Documento', '文件标题') !!}</span>
                <div class="value">{{ $document->title }}</div>
            </td>
            <td style="width: 50%;">
                <span class="label">{!! $bi('Ficheiro Anexado', '附件文件名') !!}</span>
                <div class="value">{{ $document->file_name }}</div>
            </td>
        </tr>
        <tr>
            <td>
                <span class="label">{!! $bi('Estado do Pagamento', '付款状态') !!}</span>
                <div style="margin-top: 4px;">
                    <span class="badge {{ $inssPaid ? 'badge-ok' : 'badge-no' }}">
                        {!! $inssPaid ? $bi('PAGO', '已付款') : $bi('NÃO PAGO', '未付款') !!}
                    </span>
                </div>
            </td>
            <td>
                <span class="label">{!! $bi('Estado de Envio', '发送状态') !!}</span>
                <div style="margin-top: 4px;">
                    <span class="badge {{ $inssProofSent ? 'badge-ok' : 'badge-warn' }}">
                        {!! $inssProofSent ? $bi('ENVIADO', '已发送') : $bi('NÃO ENVIADO', '未发送') !!}
                    </span>
                </div>
            </td>
        </tr>
        <tr>
            <td>
                <span class="label">{!! $bi('Carregado em', '上传时间') !!}</span>
                <div class="value">{{ $document->created_at?->format('d/m/Y H:i') ?? '—' }}</div>
            </td>
            <td>
                <span class="label">{!! $bi('Carregado por', '上传人') !!}</span>
                <div class="value">{{ $document->uploadedBy?->name ?? $operatorName }}</div>
            </td>
        </tr>
        @if($document->notes)
            <tr>
                <td colspan="2">
                    <span class="label">{!! $bi('Observações', '备注') !!}</span>
                    <div class="value" style="font-weight: normal;">{{ $document->notes }}</div>
                </td>
            </tr>
        @endif
    </table>

    @if($imageDataUri)
        <div class="preview-box">
            <img src="{{ $imageDataUri }}" alt="{{ $document->file_name }}">
        </div>
    @elseif($hasAttachedPdf)
        <div class="note-box">
            <strong>{!! $bi('Documento PDF Anexado:', '已附PDF原件:') !!}</strong>
            {!! $bi('O comprovativo original em formato PDF segue imediatamente nas páginas seguintes deste dossiê.', '社保付款凭证原件PDF附于本页之后。') !!}
        </div>
    @else
        <div class="note-box">
            <strong>{!! $bi('Ficheiro registado:', '已登记文件:') !!}</strong> {{ $document->file_name }}
            ({{ $document->mime_type ?? 'documento' }})
        </div>
    @endif
</body>
</html>
