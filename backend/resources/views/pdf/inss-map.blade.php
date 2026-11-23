<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Mapa de INSS — {{ $tenant->name }}</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bi = static fn (string $pt, string $zh): string => $isBilingual
            ? e($pt).' <span class="zh-inline">/ '.e($zh).'</span>'
            : e($pt);
        $currency = $tenant->currency ?? 'AOA';
        $fmt = static fn (float|int|null $v): string => number_format((float) ($v ?? 0), 2, ',', '.');
    @endphp
    <style>
        @page { size: A4 landscape; margin: 10mm 11mm; }
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
        body { font-family: 'DejaVu Sans', 'Droid Sans Fallback', sans-serif; font-size: 8px; color: #1e293b; margin: 0; }
        table { width: 100%; border-collapse: collapse; }
        .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 6px; margin-bottom: 8px; }
        .company { font-size: 11.5px; font-weight: bold; color: #0f172a; }
        .meta { font-size: 7.5px; color: #64748b; }
        .title { font-size: 12px; font-weight: bold; color: #1d4ed8; text-align: right; }
        .zh-inline { color: #64748b; font-size: 7px; font-weight: normal; }
        .badge { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 7.5px; font-weight: bold; }
        .badge-ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .badge-no { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .data-table thead { display: table-header-group; }
        .data-table th { background: #1e293b; color: #ffffff; padding: 4.5px 5px; border: 1px solid #334155; font-size: 7px; text-align: left; }
        .data-table td { padding: 4px 5px; border: 1px solid #cbd5e1; font-size: 7.5px; }
        .data-table tr:nth-child(even) td { background: #f8fafc; }
        .num { text-align: right !important; white-space: nowrap; }
        .center { text-align: center !important; }
        .totals-row td { background: #e2e8f0 !important; font-weight: bold; border-top: 1.5px solid #475569; }
        .signatures { width: 100%; margin-top: 16px; page-break-inside: avoid; }
        .signatures td { width: 50%; padding: 0 36px; text-align: center; vertical-align: bottom; }
        .sig-space { height: 24px; border-bottom: 1px solid #475569; margin-bottom: 3px; }
        .sig-role { font-size: 7.5px; font-weight: bold; }
        .sig-sub { font-size: 6.8px; color: #64748b; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td style="width: 55%;">
                <div class="company">{{ $tenant->name }}</div>
                <div class="meta">NIF: {{ $tenant->tax_id ?? '—' }} · Nº Contribuinte INSS: {{ $tenant->inss_number ?? '—' }}</div>
                <div class="meta">{{ $tenant->address ?? 'Angola' }}</div>
            </td>
            <td style="width: 45%; text-align: right;">
                <div class="title">{!! $bi('MAPA DE CONTRIBUIÇÕES INSS', '社会保险明细表 (INSS)') !!}</div>
                <div class="meta">{!! $bi('Período', '期间') !!}: {{ $period->displayName() }} | {!! $bi('Moeda', '货币') !!}: {{ $currency }}</div>
                <div class="meta" style="margin-top: 2px;">
                    <span class="badge {{ $inssPaid ? 'badge-ok' : 'badge-no' }}">
                        {!! $inssPaid ? $bi('INSS PAGO', '社保已缴') : $bi('INSS NÃO PAGO', '社保未缴') !!}
                    </span>
                </div>
            </td>
        </tr>
    </table>

    <table class="data-table">
        <thead>
            <tr>
                <th class="center" style="width: 3.5%;">N.º</th>
                <th style="width: 8%;">{!! $bi('Código', '编号') !!}</th>
                <th style="width: 21%;">{!! $bi('Nome Completo', '姓名') !!}</th>
                <th style="width: 11%;">{!! $bi('Nº INSS', '社保号') !!}</th>
                <th style="width: 10%;">{!! $bi('NIF', '税号') !!}</th>
                <th style="width: 11.5%;">{!! $bi('Departamento', '部门') !!}</th>
                <th class="num" style="width: 9%;">{!! $bi('Base INSS', '基数') !!}</th>
                <th class="center" style="width: 4.5%;">%</th>
                <th class="num" style="width: 7.5%;">{!! $bi('INSS Trab.', '员工部分') !!}</th>
                <th class="center" style="width: 4.5%;">%</th>
                <th class="num" style="width: 7.5%;">{!! $bi('INSS Emp.', '企业部分') !!}</th>
                <th class="num" style="width: 8%;">{!! $bi('Total INSS', '合计') !!}</th>
            </tr>
        </thead>
        <tbody>
            @foreach($rows as $idx => $row)
                <tr>
                    <td class="center">{{ $idx + 1 }}</td>
                    <td>{{ $row['employee_code'] }}</td>
                    <td><strong>{{ $row['full_name'] }}</strong></td>
                    <td>{{ $row['social_security_id'] }}</td>
                    <td>{{ $row['tax_id'] }}</td>
                    <td>{{ $row['department'] }}</td>
                    <td class="num">{{ $fmt($row['inss_base']) }}</td>
                    <td class="center">{{ number_format((float) $row['employee_rate'], 1, ',', '.') }}%</td>
                    <td class="num">{{ $fmt($row['employee_inss']) }}</td>
                    <td class="center">{{ number_format((float) $row['employer_rate'], 1, ',', '.') }}%</td>
                    <td class="num">{{ $fmt($row['employer_inss']) }}</td>
                    <td class="num"><strong>{{ $fmt($row['total_inss']) }}</strong></td>
                </tr>
            @endforeach
            <tr class="totals-row">
                <td colspan="6">{!! $bi('TOTAIS', '合计') !!} ({{ count($rows) }})</td>
                <td class="num">{{ $fmt($totals['total_inss_base']) }}</td>
                <td></td>
                <td class="num">{{ $fmt($totals['total_inss_employee']) }}</td>
                <td></td>
                <td class="num">{{ $fmt($totals['total_inss_employer']) }}</td>
                <td class="num">{{ $fmt($totals['total_inss']) }} {{ $currency }}</td>
            </tr>
        </tbody>
    </table>

    <table class="signatures">
        <tr>
            <td>
                <div class="sig-space"></div>
                <div class="sig-role">{!! $bi('Recursos Humanos (RH)', '人力资源部') !!}</div>
                <div class="sig-sub">{{ $operatorName }}</div>
            </td>
            <td>
                <div class="sig-space"></div>
                <div class="sig-role">{!! $bi('A Empresa / Direção', '公司 / 雇主签章') !!}</div>
                <div class="sig-sub">{{ $tenant->name }}</div>
            </td>
        </tr>
    </table>
</body>
</html>
