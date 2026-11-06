<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Recibo de Vencimento</title>
    @php
        $bilingualLabel = static fn (string $portuguese, string $mandarin): string => '<span class="label-pt">'.e($portuguese).'</span><span class="label-zh">'.e($mandarin).'</span>';
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
    @endphp
    <style>
        @page { size: A4 landscape; margin: 10mm 12mm; }
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
        body { font-family: 'Droid Sans Fallback', 'DejaVu Sans', sans-serif; font-size: 9px; color: #1e293b; margin: 0; }
        table { width: 100%; border-collapse: collapse; }
        .header { border-bottom: 2px solid #2563eb; padding-bottom: 7px; margin-bottom: 9px; }
        .header td { vertical-align: top; }
        .company { font-size: 13px; font-weight: bold; }
        .title { color: #2563eb; font-size: 15px; font-weight: bold; }
        .meta { color: #64748b; font-size: 8px; }
        .text-right { text-align: right; }
        .bilingual { line-height: 1.25; }
        .label-pt, .label-zh { display: block; }
        .label-zh { color: #475569; font-size: 8px; margin-top: 1px; }
        .info { margin-bottom: 8px; }
        .info td { width: 25%; padding: 3px 8px 3px 0; vertical-align: top; }
        .info-label { color: #64748b; font-size: 8px; }
        .info-value { font-size: 9px; font-weight: bold; }
        .sections { table-layout: fixed; }
        .sections > tbody > tr > td { width: 50%; vertical-align: top; }
        .section-left { padding-right: 6px; }
        .section-right { padding-left: 6px; }
        .section-title { background: #eaf0f8; border-left: 3px solid #2563eb; color: #1e3a8a; font-size: 10px; font-weight: bold; padding: 5px 7px; }
        .items { margin-bottom: 7px; }
        .items th, .items td { border-bottom: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; vertical-align: top; }
        .items th { background: #f8fafc; color: #475569; font-size: 8px; font-weight: bold; }
        .items .amount { text-align: right; white-space: nowrap; width: 25%; }
        .item-name { font-size: 9px; }
        .item-zh { color: #64748b; font-size: 8px; margin-top: 1px; }
        .subtotal td { background: #f8fafc; border-top: 1px solid #cbd5e1; font-weight: bold; padding: 5px 6px; }
        .empty { color: #94a3b8; font-style: italic; padding: 7px 6px !important; }
        .summary { border: 1px solid #cbd5e1; margin-top: 7px; }
        .summary td { padding: 5px 8px; }
        .summary .summary-label { color: #475569; }
        .summary .summary-value { font-weight: bold; text-align: right; white-space: nowrap; }
        .summary .net td { background: #2563eb; color: #fff; font-size: 11px; font-weight: bold; }
        .employer { margin-top: 7px; }
        .employer .section-title { background: #f1f5f9; border-left-color: #64748b; color: #334155; }
        .footer { border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 8px; margin-top: 8px; padding-top: 5px; text-align: center; }
        .keep-together { page-break-inside: avoid; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <div class="company">{{ $record->tenant->name }}</div>
                <div class="meta">{{ $record->tenant->address }}, {{ $record->tenant->city }}</div>
                <div class="meta">NIF: {{ $record->tenant->tax_id }} | {{ $record->tenant->phone }}</div>
            </td>
            <td class="text-right">
                <div class="title">{!! $bilingualLabel('RECIBO DE VENCIMENTO', '工资单') !!}</div>
                <div class="meta bilingual">{!! $bilingualLabel('Período', '工资期间') !!}{{ $record->period->displayName() }}</div>
                <div class="meta bilingual">{!! $bilingualLabel('Emitido em', '签发日期') !!}{{ now()->format('d/m/Y') }}</div>
            </td>
        </tr>
    </table>

    <table class="info">
        <tr>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Funcionário', '员工') !!}</div><div class="info-value">{{ $record->employee->full_name }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Código', '编号') !!}</div><div class="info-value">{{ $record->employee->employee_code }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Cargo', '职位') !!}</div><div class="info-value">{{ $record->contract->position?->title ?? '—' }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Tipo de Contrato', '合同类型') !!}</div><div class="info-value">{{ $record->contract->contract_type }}</div></td>
        </tr>
        <tr>
            <td><div class="info-label bilingual">{!! $bilingualLabel('NIF', '税号') !!}</div><div class="info-value">{{ $record->employee->tax_id ?? '—' }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Dias trabalhados', '工作天数') !!}</div><div class="info-value">{{ $record->work_days }}</div></td>
            <td><div class="info-label bilingual">{!! $bilingualLabel('Moeda', '货币') !!}</div><div class="info-value">{{ $currency }}</div></td>
            <td></td>
        </tr>
    </table>

    <table class="sections">
        <tr>
            <td class="section-left">
                <div class="section-title bilingual">{!! $bilingualLabel('SUBSÍDIOS E RENDIMENTOS', '津贴与收入') !!}</div>
                <table class="items">
                    <thead><tr><th class="bilingual">{!! $bilingualLabel('Descrição', '说明') !!}</th><th class="amount bilingual">{!! $bilingualLabel('Valor', '金额') !!}</th></tr></thead>
                    <tbody>
                        @forelse($earnings as $item)
                            <tr>
                                <td><div class="item-name">{{ $item['name'] ?? $item['code'] ?? '—' }}</div><div class="item-zh">{{ $mandarinName($item) }}</div></td>
                                <td class="amount">{{ number_format((float) ($item['amount'] ?? 0), 2) }}</td>
                            </tr>
                        @empty
                            <tr><td class="empty bilingual" colspan="2">{!! $bilingualLabel('Sem rendimentos neste período', '本期无收入') !!}</td></tr>
                        @endforelse
                        <tr class="subtotal"><td class="bilingual">{!! $bilingualLabel('Total de rendimentos', '收入合计') !!}</td><td class="amount">{{ number_format((float) $record->total_earnings, 2) }}</td></tr>
                    </tbody>
                </table>
            </td>
            <td class="section-right">
                <div class="section-title bilingual">{!! $bilingualLabel('DESCONTOS E IMPOSTOS', '扣款与税费') !!}</div>
                <table class="items">
                    <thead><tr><th class="bilingual">{!! $bilingualLabel('Descrição', '说明') !!}</th><th class="amount bilingual">{!! $bilingualLabel('Valor', '金额') !!}</th></tr></thead>
                    <tbody>
                        @forelse($deductions as $item)
                            <tr>
                                <td><div class="item-name">{{ $item['name'] ?? $item['code'] ?? '—' }}</div><div class="item-zh">{{ $mandarinName($item) }}</div></td>
                                <td class="amount">- {{ number_format(abs((float) ($item['amount'] ?? 0)), 2) }}</td>
                            </tr>
                        @empty
                            <tr><td class="empty bilingual" colspan="2">{!! $bilingualLabel('Sem descontos neste período', '本期无扣款') !!}</td></tr>
                        @endforelse
                        <tr class="subtotal"><td class="bilingual">{!! $bilingualLabel('Total de descontos', '扣款合计') !!}</td><td class="amount">- {{ number_format((float) $record->total_deductions, 2) }}</td></tr>
                        @forelse($taxes as $item)
                            <tr>
                                <td><div class="item-name">{{ $item['name'] ?? $item['code'] ?? '—' }}</div><div class="item-zh">{{ $mandarinName($item) }}</div></td>
                                <td class="amount">- {{ number_format(abs((float) ($item['amount'] ?? 0)), 2) }}</td>
                            </tr>
                        @empty
                            <tr><td class="empty bilingual" colspan="2">{!! $bilingualLabel('Sem impostos neste período', '本期无税费') !!}</td></tr>
                        @endforelse
                        <tr class="subtotal"><td class="bilingual">{!! $bilingualLabel('Total de impostos', '税费合计') !!}</td><td class="amount">- {{ number_format((float) $record->total_taxes, 2) }}</td></tr>
                    </tbody>
                </table>
            </td>
        </tr>
    </table>

    @if($contributions->isNotEmpty())
        <div class="employer keep-together">
            <div class="section-title bilingual">{!! $bilingualLabel('ENCARGOS DA ENTIDADE EMPREGADORA (não descontados ao funcionário)', '雇主承担费用（不从员工工资中扣除）') !!}</div>
            <table class="items">
                <thead><tr><th class="bilingual">{!! $bilingualLabel('Descrição', '说明') !!}</th><th class="amount bilingual">{!! $bilingualLabel('Valor', '金额') !!}</th></tr></thead>
                <tbody>
                    @foreach($contributions as $item)
                        <tr>
                            <td><div class="item-name">{{ $item['name'] ?? $item['code'] ?? '—' }}</div><div class="item-zh">{{ $mandarinName($item) }}</div></td>
                            <td class="amount">{{ number_format((float) ($item['amount'] ?? 0), 2) }}</td>
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    @endif

    <table class="summary keep-together">
        <tr><td class="summary-label bilingual">{!! $bilingualLabel('Total de rendimentos', '收入合计') !!}</td><td class="summary-value">{{ number_format((float) $record->total_earnings, 2) }} {{ $currency }}</td></tr>
        <tr><td class="summary-label bilingual">{!! $bilingualLabel('Total de descontos', '扣款合计') !!}</td><td class="summary-value">- {{ number_format((float) $record->total_deductions, 2) }} {{ $currency }}</td></tr>
        <tr><td class="summary-label bilingual">{!! $bilingualLabel('Total de impostos', '税费合计') !!}</td><td class="summary-value">- {{ number_format((float) $record->total_taxes, 2) }} {{ $currency }}</td></tr>
        <tr class="net"><td class="bilingual">{!! $bilingualLabel('Líquido a receber', '实发工资') !!}</td><td class="summary-value">{{ number_format((float) $record->net_salary, 2) }} {{ $currency }}</td></tr>
    </table>

    <div class="footer">
        <div class="bilingual">{!! $bilingualLabel('Documento gerado eletronicamente pelo HRMS', '本工资单由 HRMS 系统生成') !!}</div>
        <div>{{ now()->format('d/m/Y H:i') }} | {{ $record->tenant->name }}</div>
    </div>
</body>
</html>
