<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Recibo de Vencimento</title>
    @php
        $bilingualLabel = static fn (string $portuguese, string $mandarin): string => '<span class="label-pt">'.e($portuguese).'</span><span class="label-zh">'.e($mandarin).'</span>';
        $bilingualInline = static fn (string $portuguese, string $mandarin): string => e($portuguese).' <span class="zh-inline">/ '.e($mandarin).'</span>';
        $items = collect($record->details['breakdown'] ?? []);

        if ($items->isEmpty() && $record->relationLoaded('items')) {
            $items = $record->items->map(fn ($item) => [
                'code' => $item->code,
                'name' => $item->name,
                'type' => match ($item->category) {
                    'earning' => 'earning',
                    'deduction' => 'deduction',
                    'tax' => 'tax',
                    'employer_contribution' => 'contribution',
                    default => 'earning',
                },
                'amount' => (float) $item->amount,
            ]);
        } elseif ($record->relationLoaded('items')) {
            $itemCodes = $items->pluck('code');
            $employerItems = $record->items
                ->where('category', 'employer_contribution')
                ->reject(fn ($item) => $itemCodes->contains($item->code))
                ->map(fn ($item) => [
                    'code' => $item->code,
                    'name' => $item->name,
                    'type' => 'contribution',
                    'amount' => (float) $item->amount,
                ]);
            $items = $items->concat($employerItems);
        }

        $earnings = $items->filter(fn ($item) => in_array($item['type'] ?? null, ['earning', 'benefit'], true))->values();
        $deductions = $items->where('type', 'deduction')->filter(fn ($item) => (float) ($item['amount'] ?? 0) !== 0.0)->values();
        $taxes = $items->where('type', 'tax')->filter(fn ($item) => (float) ($item['amount'] ?? 0) !== 0.0)->values();
        $contributions = $items->where('type', 'contribution')->filter(fn ($item) => (float) ($item['amount'] ?? 0) !== 0.0)->values();
        $mandarinName = static fn (array $item): string => match ($item['code'] ?? '') {
            'base_salary' => '基本工资',
            'meal_subsidy', 'meal_allowance', 'meal_benefit' => '餐饮补贴',
            'transport_allowance', 'transport_subsidy' => '交通补贴',
            'vacation_subsidy' => '假期津贴',
            'christmas_subsidy' => '圣诞津贴',
            'family_allowance' => '家庭补贴',
            'additional_allowance' => '其他补贴',
            'bonus', 'productivity_bonus' => '奖金',
            'overtime' => '加班费',
            'absence' => '缺勤扣款',
            'lateness' => '迟到扣款',
            'inss' => '员工社会保险',
            'irt' => '工资所得税',
            'employer_inss' => '雇主社会保险',
            default => match ($item['type'] ?? '') {
                'earning', 'benefit' => '其他收入',
                'deduction' => '其他扣款',
                'tax' => '其他税费',
                'contribution' => '雇主缴费',
                default => '工资项目',
            },
        };
        $currency = $record->currency ?: $record->tenant->currency;
        $contractTypeLabel = match ($record->contract->contract_type) {
            'permanent' => 'Efetivo / 无固定期限',
            'fixed_term' => 'Termo Certo / 固定期限',
            'internship' => 'Estágio / 实习',
            'part_time' => 'Tempo Parcial / 兼职',
            default => $record->contract->contract_type,
        };
    @endphp
    <style>
        @page { size: A4 portrait; margin: 14mm 14mm; }
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
        * { box-sizing: border-box; }
        body {
            font-family: 'Droid Sans Fallback', 'DejaVu Sans', sans-serif;
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
    <table class="header">
        <tr>
            <td class="header-left">
                <div class="company">{{ $record->tenant->name }}</div>
                <div class="meta">{{ $record->tenant->address }}, {{ $record->tenant->city }}</div>
                <div class="meta">NIF: {{ $record->tenant->tax_id }}@if($record->tenant->phone) | {{ $record->tenant->phone }}@endif</div>
            </td>
            <td class="header-right">
                <div class="title">RECIBO DE VENCIMENTO</div>
                <div class="title-zh">工资单</div>
                <div class="meta">Período / 工资期间: {{ $record->period->displayName() }}</div>
                <div class="meta">Emitido em / 签发日期: {{ now()->format('d/m/Y') }}</div>
            </td>
        </tr>
    </table>

    <table class="info">
        <tr>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Funcionário', '员工') !!}</div><div class="info-value">{{ $record->employee->full_name }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Código', '编号') !!}</div><div class="info-value">{{ $record->employee->employee_code }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Cargo', '职位') !!}</div><div class="info-value">{{ $record->contract->position?->title ?? '—' }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Contrato', '合同类型') !!}</div><div class="info-value">{{ $contractTypeLabel }}</div></td>
        </tr>
        <tr>
            <td><div class="info-label bilingual">{!! $bilingualLabel('NIF', '税号') !!}</div><div class="info-value">{{ $record->employee->tax_id ?? '—' }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Dias trabalhados', '工作天数') !!}</div><div class="info-value">{{ $record->work_days }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Faltas', '缺勤') !!}</div><div class="info-value">{{ $record->absent_days ?? 0 }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Moeda', '货币') !!}</div><div class="info-value">{{ $currency }}</div></td>
        </tr>
    </table>

    <div class="block">
        <div class="section-title">{!! $bilingualInline('SUBSÍDIOS E RENDIMENTOS', '津贴与收入') !!}</div>
        <table class="items">
            <thead>
                <tr>
                    <th class="col-desc">{!! $bilingualInline('Descrição', '说明') !!}</th>
                    <th class="col-amount">{!! $bilingualInline('Valor (' . $currency . ')', '金额') !!}</th>
                </tr>
            </thead>
            <tbody>
                @forelse($earnings as $item)
                    <tr>
                        <td class="col-desc">{{ $item['name'] ?? $item['code'] ?? '—' }} <span class="zh-inline">/ {{ $mandarinName($item) }}</span></td>
                        <td class="col-amount">{{ number_format((float) ($item['amount'] ?? 0), 2) }}</td>
                    </tr>
                @empty
                    <tr><td class="empty" colspan="2">{!! $bilingualInline('Sem rendimentos neste período', '本期无收入') !!}</td></tr>
                @endforelse
                <tr class="subtotal">
                    <td class="col-desc">{!! $bilingualInline('Total de rendimentos', '收入合计') !!}</td>
                    <td class="col-amount">{{ number_format((float) $record->total_earnings, 2) }}</td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="block">
        <div class="section-title">{!! $bilingualInline('DESCONTOS E IMPOSTOS', '扣款与税费') !!}</div>
        <table class="items">
            <thead>
                <tr>
                    <th class="col-desc">{!! $bilingualInline('Descrição', '说明') !!}</th>
                    <th class="col-amount">{!! $bilingualInline('Valor (' . $currency . ')', '金额') !!}</th>
                </tr>
            </thead>
            <tbody>
                @forelse($deductions as $item)
                    <tr>
                        <td class="col-desc">{{ $item['name'] ?? $item['code'] ?? '—' }} <span class="zh-inline">/ {{ $mandarinName($item) }}</span></td>
                        <td class="col-amount">- {{ number_format(abs((float) ($item['amount'] ?? 0)), 2) }}</td>
                    </tr>
                @empty
                    <tr><td class="empty" colspan="2">{!! $bilingualInline('Sem descontos neste período', '本期无扣款') !!}</td></tr>
                @endforelse
                <tr class="subtotal">
                    <td class="col-desc">{!! $bilingualInline('Total de descontos', '扣款合计') !!}</td>
                    <td class="col-amount">- {{ number_format((float) $record->total_deductions, 2) }}</td>
                </tr>
                @forelse($taxes as $item)
                    <tr>
                        <td class="col-desc">{{ $item['name'] ?? $item['code'] ?? '—' }} <span class="zh-inline">/ {{ $mandarinName($item) }}</span></td>
                        <td class="col-amount">- {{ number_format(abs((float) ($item['amount'] ?? 0)), 2) }}</td>
                    </tr>
                @empty
                    <tr><td class="empty" colspan="2">{!! $bilingualInline('Sem impostos neste período', '本期无税费') !!}</td></tr>
                @endforelse
                <tr class="subtotal">
                    <td class="col-desc">{!! $bilingualInline('Total de impostos', '税费合计') !!}</td>
                    <td class="col-amount">- {{ number_format((float) $record->total_taxes, 2) }}</td>
                </tr>
            </tbody>
        </table>
    </div>

    @if($contributions->isNotEmpty())
        <div class="block employer">
            <div class="section-title">{!! $bilingualInline('ENCARGOS DA ENTIDADE EMPREGADORA', '雇主承担费用') !!}</div>
            <table class="items">
                <tbody>
                    @foreach($contributions as $item)
                        <tr>
                            <td class="col-desc">{{ $item['name'] ?? $item['code'] ?? '—' }} <span class="zh-inline">/ {{ $mandarinName($item) }}</span></td>
                            <td class="col-amount">{{ number_format((float) ($item['amount'] ?? 0), 2) }}</td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    @endif

    <table class="summary">
        <tr>
            <td class="summary-label">{!! $bilingualInline('Total de rendimentos', '收入合计') !!}</td>
            <td class="summary-value">{{ number_format((float) $record->total_earnings, 2) }} {{ $currency }}</td>
        </tr>
        <tr>
            <td class="summary-label">{!! $bilingualInline('Total de descontos', '扣款合计') !!}</td>
            <td class="summary-value">- {{ number_format((float) $record->total_deductions, 2) }} {{ $currency }}</td>
        </tr>
        <tr>
            <td class="summary-label">{!! $bilingualInline('Total de impostos', '税费合计') !!}</td>
            <td class="summary-value">- {{ number_format((float) $record->total_taxes, 2) }} {{ $currency }}</td>
        </tr>
        <tr class="net">
            <td>{!! $bilingualInline('Líquido a receber', '实发工资') !!}</td>
            <td class="summary-value">{{ number_format((float) $record->net_salary, 2) }} {{ $currency }}</td>
        </tr>
    </table>

    <table class="signatures">
        <tr>
            <td><div class="sig-line">{!! $bilingualInline('Entidade Empregadora', '雇主签章') !!}</div></td>
            <td><div class="sig-line">{!! $bilingualInline('O Funcionário', '员工签名') !!}</div></td>
        </tr>
    </table>

    <div class="footer">
        {!! $bilingualInline('Documento gerado eletronicamente pelo HRMS', '本工资单由 HRMS 系统生成') !!}
        | {{ now()->format('d/m/Y H:i') }} | {{ $record->tenant->name }}
    </div>
</body>
</html>
