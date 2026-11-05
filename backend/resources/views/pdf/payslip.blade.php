<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Recibo de Vencimento</title>
    @php
        $bilingualLabel = static fn (string $portuguese, string $mandarin): string => '<span class="label-pt">'.e($portuguese).'</span><span class="label-zh">'.e($mandarin).'</span>';
    @endphp
    <style>
        @font-face {
            font-family: 'Droid Sans Fallback';
            src: url('{{ resource_path('fonts/DroidSansFallbackFull.ttf') }}') format('truetype');
            font-weight: normal;
            font-style: normal;
        }
        * { box-sizing: border-box; }
        body { font-family: 'Droid Sans Fallback', 'DejaVu Sans', sans-serif; font-size: 11px; color: #1e293b; margin: 0; padding: 20px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 20px; }
        .company { font-size: 14px; font-weight: bold; }
        .title { font-size: 16px; font-weight: bold; color: #2563eb; }
        .meta { font-size: 10px; color: #64748b; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
        th { background-color: #f1f5f9; font-weight: 600; }
        .text-right { text-align: right; }
        .totals { background-color: #f8fafc; padding: 12px; border: 1px solid #e2e8f0; border-radius: 4px; }
        .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
        .totals-label { font-weight: 500; color: #64748b; }
        .totals-value { font-weight: 600; }
        .net { background-color: #2563eb; color: white; padding: 10px 14px; border-radius: 4px; margin-top: 8px; font-size: 13px; }
        .net .totals-value { font-size: 14px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; margin: 12px 0; }
        .info-grid > div { font-size: 11px; }
        .info-grid .label { color: #64748b; font-size: 9px; text-transform: uppercase; }
        .label-pt, .label-zh { display: block; }
        .label-zh { margin-top: 2px; font-size: 9px; }
        .footer { margin-top: 24px; font-size: 9px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <div class="company">{{ $record->tenant->name }}</div>
            <div class="meta">{{ $record->tenant->address }}, {{ $record->tenant->city }}</div>
            <div class="meta">NIF: {{ $record->tenant->tax_id }} | {{ $record->tenant->phone }}</div>
        </div>
        <div class="text-right">
            <div class="title">{!! $bilingualLabel('RECIBO DE VENCIMENTO', '工资单') !!}</div>
            <div class="meta"><span class="label-pt">Período</span><span class="label-zh">工资期间</span>{{ $record->period->name }}</div>
            <div class="meta"><span class="label-pt">Emitido em</span><span class="label-zh">签发日期</span>{{ now()->format('d/m/Y') }}</div>
        </div>
    </div>

    <div class="info-grid">
        <div>
            <div class="label">{!! $bilingualLabel('Funcionário', '员工') !!}</div>
            <div>{{ $record->employee->full_name }}</div>
        </div>
        <div>
            <div class="label">{!! $bilingualLabel('Código', '编号') !!}</div>
            <div>{{ $record->employee->employee_code }}</div>
        </div>
        <div>
            <div class="label">{!! $bilingualLabel('Cargo', '职位') !!}</div>
            <div>{{ $record->contract->position?->title ?? '—' }}</div>
        </div>
        <div>
            <div class="label">{!! $bilingualLabel('Tipo de Contrato', '合同类型') !!}</div>
            <div>{{ $record->contract->contract_type }}</div>
        </div>
        <div>
            <div class="label">{!! $bilingualLabel('NIF', '税号') !!}</div>
            <div>{{ $record->employee->tax_id ?? '—' }}</div>
        </div>
        <div>
            <div class="label">{!! $bilingualLabel('Dias trabalhados', '工作天数') !!}</div>
            <div>{{ $record->work_days }}</div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th>{!! $bilingualLabel('Código', '代码') !!}</th>
                <th>{!! $bilingualLabel('Descrição', '说明') !!}</th>
                <th class="text-right">{!! $bilingualLabel('Valor', '金额') !!}</th>
            </tr>
        </thead>
        <tbody>
            @foreach($record->details['breakdown'] ?? [] as $item)
                <tr>
                    <td>{{ $item['code'] }}</td>
                    <td>{{ $item['name'] }}</td>
                    <td class="text-right">{{ number_format($item['amount'], 2) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="totals">
        <div class="totals-row">
            <div class="totals-label">{!! $bilingualLabel('Total Rendimentos', '收入合计') !!}</div>
            <div class="totals-value">{{ number_format($record->total_earnings, 2) }} {{ $record->tenant->currency }}</div>
        </div>
        <div class="totals-row">
            <div class="totals-label">{!! $bilingualLabel('Total Descontos', '扣款合计') !!}</div>
            <div class="totals-value">- {{ number_format($record->total_deductions, 2) }} {{ $record->tenant->currency }}</div>
        </div>
        <div class="totals-row">
            <div class="totals-label">{!! $bilingualLabel('Total Impostos', '税费合计') !!}</div>
            <div class="totals-value">- {{ number_format($record->total_taxes, 2) }} {{ $record->tenant->currency }}</div>
        </div>
        <div class="net totals-row">
            <div>{!! $bilingualLabel('Líquido a Receber', '实发工资') !!}</div>
            <div class="totals-value">{{ number_format($record->net_salary, 2) }} {{ $record->tenant->currency }}</div>
        </div>
    </div>

    <div class="footer">
        <div>{!! $bilingualLabel('Documento gerado eletronicamente pelo HRMS', '由 HRMS 电子生成') !!}</div>
        <div>{{ now()->format('d/m/Y H:i') }} | {{ $record->tenant->name }}</div>
    </div>
</body>
</html>
