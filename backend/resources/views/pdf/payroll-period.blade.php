<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Folha salarial / 工资表</title>
    @php
        $bilingualLabel = static fn (string $portuguese, string $mandarin): string => '<span class="pt">'.e($portuguese).'</span><span class="zh">'.e($mandarin).'</span>';
        $classifyItem = static function ($item): string {
            $text = mb_strtolower(str_replace(['_', '-'], ' ', $item->code.' '.$item->name));

            if ($item->category === 'employer_contribution' || $item->code === 'employer_inss') return 'employer_contribution';
            if ($item->code === 'base_salary') return 'base_salary';
            if ($item->code === 'inss') return 'inss';
            if ($item->code === 'irt') return 'irt';
            if (str_contains($text, 'falta') || str_contains($text, 'absence')) return 'absence';
            if ($item->deduction?->deduction_type === 'advance' || str_contains($text, 'vale') || str_contains($text, 'voucher') || str_contains($text, 'adiantamento') || str_contains($text, 'advance')) return 'voucher';
            if (str_contains($text, 'feria') || str_contains($text, 'férias') || str_contains($text, 'vacation')) return 'vacation';
            if (str_contains($text, 'natal') || str_contains($text, 'christmas')) return 'christmas';
            if (str_contains($text, 'familia') || str_contains($text, 'família') || str_contains($text, 'family')) return 'family';
            if (str_contains($text, 'refeicao') || str_contains($text, 'refeição') || str_contains($text, 'meal') || str_contains($text, 'aliment')) return 'meal';
            if (str_contains($text, 'transporte') || str_contains($text, 'transport')) return 'transport';
            if (str_contains($text, 'extra') || str_contains($text, 'overtime')) return 'overtime';
            if (str_contains($text, 'adicional') || str_contains($text, 'bonus') || str_contains($text, 'bónus')) return 'additional';

            return in_array($item->category, ['deduction', 'tax'], true) ? 'other_deduction' : 'other_earning';
        };
        $itemTotal = static fn ($items, string $group): float => (float) $items
            ->filter(fn ($item) => $classifyItem($item) === $group)
            ->sum(fn ($item) => abs((float) $item->amount));
        $recordItems = static function ($record) {
            if ($record->items->isNotEmpty()) return $record->items;

            return collect($record->details['breakdown'] ?? [])->map(fn ($item) => (object) [
                'code' => $item['code'] ?? '',
                'name' => $item['name'] ?? $item['code'] ?? '—',
                'category' => ($item['type'] ?? 'earning') === 'benefit' ? 'earning' : ($item['type'] ?? 'earning'),
                'amount' => $item['amount'] ?? 0,
                'deduction' => null,
            ]);
        };
        $currency = $period->tenant->currency ?? 'AOA';
        $employeeInssTotal = 0.0;
        $employerInssTotal = 0.0;
        $otherDeductionsTotal = 0.0;
        foreach ($period->records as $record) {
            $items = $recordItems($record);
            $irtAmount = $itemTotal($items, 'irt') ?: (float) $record->total_taxes;
            $employeeInssTotal += $itemTotal($items, 'inss');
            $employerInssTotal += abs((float) ($items->firstWhere('code', 'employer_inss')?->amount ?? $record->employer_inss ?? 0));
            $otherDeductionsTotal += max(
                0,
                (float) $record->total_deductions + (float) $record->total_taxes
                    - $itemTotal($items, 'inss')
                    - $irtAmount
                    - $itemTotal($items, 'absence')
                    - $itemTotal($items, 'voucher'),
            );
        }
    @endphp
    <style>
        @page { size: A4 landscape; margin: 8mm; }
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
        body { font-family: 'Droid Sans Fallback', 'DejaVu Sans', sans-serif; font-size: 7px; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; }
        .header { margin-bottom: 7px; border-bottom: 2px solid #2563eb; }
        .header td { padding: 2px 0 6px; vertical-align: top; }
        .company { font-size: 12px; font-weight: bold; }
        .title { color: #1d4ed8; font-size: 14px; font-weight: bold; text-align: right; }
        .meta { color: #64748b; font-size: 7px; text-align: right; }
        .pt, .zh { display: block; }
        .zh { color: #475569; font-size: 6px; margin-top: 1px; }
        .totals { margin: 8px 0 0; page-break-inside: avoid; }
        .totals td { width: 25%; padding: 4px 6px; border: 1px solid #cbd5e1; }
        .total-label { color: #475569; }
        .total-value { font-size: 9px; font-weight: bold; margin-top: 2px; }
        .records { table-layout: fixed; }
        .records th, .records td { border: 1px solid #94a3b8; padding: 3px 2px; vertical-align: middle; }
        .records th { background: #eaf0f8; text-align: center; font-weight: bold; }
        .records thead tr:first-child th { background: #dce6f2; font-size: 7px; }
        .records .number { width: 2.5%; text-align: center; }
        .records .employee { width: 10%; }
        .records .category { width: 6.5%; }
        .records .absent-days { width: 3.5%; }
        .records .earning { width: 5.2%; }
        .records .deduction { width: 5%; }
        .records .total-earnings { width: 5.5%; }
        .records .total-deductions { width: 5%; }
        .records .net { width: 5.5%; font-weight: bold; }
        .records td.amount { text-align: right; white-space: nowrap; }
        .records .summary-row td { background: #f1f5f9; font-weight: bold; }
        .footer { margin-top: 6px; text-align: center; color: #94a3b8; font-size: 6px; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td>
                <div class="company">{{ $period->tenant->name }}</div>
                <div class="meta" style="text-align:left">{{ $period->tenant->address }}, {{ $period->tenant->city }}</div>
                <div class="meta" style="text-align:left">NIF: {{ $period->tenant->tax_id }}</div>
            </td>
            <td>
                <div class="title">{!! $bilingualLabel('FOLHA DE REMUNERAÇÃO', '工资表') !!}</div>
                <div class="meta">{!! $bilingualLabel('Período', '工资期间') !!}{{ $period->displayName() }}</div>
                <div class="meta">{!! $bilingualLabel('Emitido em', '签发日期') !!}{{ now()->format('d/m/Y') }}</div>
            </td>
        </tr>
    </table>

    <table class="records">
        <thead>
            <tr>
                <th class="number" rowspan="2">{!! $bilingualLabel('N.º', '序号') !!}</th>
                <th class="employee" rowspan="2">{!! $bilingualLabel('Nome', '姓名') !!}</th>
                <th class="category" rowspan="2">{!! $bilingualLabel('Categoria', '类别') !!}</th>
                <th class="absent-days" rowspan="2">{!! $bilingualLabel('Faltas (dias)', '缺勤（天）') !!}</th>
                <th colspan="9">{!! $bilingualLabel('PROVEITOS', '收入') !!}</th>
                <th colspan="6">{!! $bilingualLabel('DESCONTOS', '扣款') !!}</th>
                <th class="net" rowspan="2">{!! $bilingualLabel('Salário líquido', '实发工资') !!}</th>
            </tr>
            <tr>
                <th class="earning">{!! $bilingualLabel('Salário base', '基本工资') !!}</th>
                <th class="earning">{!! $bilingualLabel('Subs. férias', '假期津贴') !!}</th>
                <th class="earning">{!! $bilingualLabel('Subs. Natal', '圣诞津贴') !!}</th>
                <th class="earning">{!! $bilingualLabel('Abono família', '家庭补贴') !!}</th>
                <th class="earning">{!! $bilingualLabel('Subs. alimentação', '餐饮补贴') !!}</th>
                <th class="earning">{!! $bilingualLabel('Subs. transporte', '交通补贴') !!}</th>
                <th class="earning">{!! $bilingualLabel('Horas extra', '加班费') !!}</th>
                <th class="earning">{!! $bilingualLabel('A. adicional', '其他补贴') !!}</th>
                <th class="total-earnings">{!! $bilingualLabel('Salário ilíquido', '税前工资') !!}</th>
                <th class="deduction">{!! $bilingualLabel('Falta', '缺勤扣款') !!}</th>
                <th class="deduction">{!! $bilingualLabel('INSS (3%)', 'INSS（3%）') !!}</th>
                <th class="deduction">{!! $bilingualLabel('IRT', '工资所得税') !!}</th>
                <th class="deduction">{!! $bilingualLabel('Vales', '预支款') !!}</th>
                <th class="deduction">{!! $bilingualLabel('Outros descontos', '其他扣款') !!}</th>
                <th class="total-deductions">{!! $bilingualLabel('Total descontos', '扣款合计') !!}</th>
            </tr>
        </thead>
        <tbody>
            @foreach($period->records as $index => $record)
                @php
                    $items = $recordItems($record);
                    $value = static fn (string $group): float => $itemTotal($items, $group);
                    $employeeInss = $value('inss');
                    $irtAmount = $value('irt') ?: (float) $record->total_taxes;
                    $absenceAmount = $value('absence');
                    $voucherAmount = $value('voucher');
                    $totalDeductions = (float) $record->total_deductions + (float) $record->total_taxes;
                    $otherDeductions = max(0, $totalDeductions - $employeeInss - $irtAmount - $absenceAmount - $voucherAmount);
                @endphp
                <tr>
                    <td class="number">{{ $index + 1 }}</td>
                    <td>{{ $record->employee?->full_name ?? '—' }}<br><span class="zh">{{ $record->employee?->employee_code }}</span></td>
                    <td>{{ $record->contract?->position?->title ?? '—' }}</td>
                    <td class="amount">{{ number_format((float) $record->absent_days, 0) }}</td>
                    <td class="amount">{{ number_format((float) $record->base_salary, 2) }}</td>
                    <td class="amount">{{ number_format($value('vacation'), 2) }}</td>
                    <td class="amount">{{ number_format($value('christmas'), 2) }}</td>
                    <td class="amount">{{ number_format($value('family'), 2) }}</td>
                    <td class="amount">{{ number_format($value('meal'), 2) }}</td>
                    <td class="amount">{{ number_format($value('transport'), 2) }}</td>
                    <td class="amount">{{ number_format($value('overtime'), 2) }}</td>
                    <td class="amount">{{ number_format($value('additional') + $value('other_earning'), 2) }}</td>
                    <td class="amount">{{ number_format((float) $record->total_earnings, 2) }}</td>
                    <td class="amount">{{ number_format($absenceAmount, 2) }}</td>
                    <td class="amount">{{ number_format($employeeInss, 2) }}</td>
                    <td class="amount">{{ number_format($irtAmount, 2) }}</td>
                    <td class="amount">{{ number_format($voucherAmount, 2) }}</td>
                    <td class="amount">{{ number_format($otherDeductions, 2) }}</td>
                    <td class="amount">{{ number_format($totalDeductions, 2) }}</td>
                    <td class="amount net">{{ number_format((float) $record->net_salary, 2) }}</td>
                </tr>
            @endforeach
            <tr class="summary-row">
                <td colspan="4">{!! $bilingualLabel('Totais da folha', '工资总计') !!}</td>
                <td class="amount">{{ number_format((float) $period->records->sum('base_salary'), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'vacation')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'christmas')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'family')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'meal')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'transport')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'overtime')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'additional') + $itemTotal($recordItems($record), 'other_earning')), 2) }}</td>
                <td class="amount">{{ number_format((float) $period->records->sum('total_earnings'), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'absence')), 2) }}</td>
                <td class="amount">{{ number_format($employeeInssTotal, 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'irt') ?: (float) $record->total_taxes), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'voucher')), 2) }}</td>
                <td class="amount">{{ number_format($otherDeductionsTotal, 2) }}</td>
                <td class="amount">{{ number_format((float) $period->records->sum('total_deductions') + (float) $period->records->sum('total_taxes'), 2) }}</td>
                <td class="amount net">{{ number_format((float) $period->records->sum('net_salary'), 2) }}</td>
            </tr>
        </tbody>
    </table>

    <table class="totals">
        <tr>
            <td><div class="total-label">{!! $bilingualLabel('INSS dos funcionários (3%)', '员工 INSS（3%）') !!}</div><div class="total-value">{{ number_format($employeeInssTotal, 2) }} {{ $currency }}</div></td>
            <td><div class="total-label">{!! $bilingualLabel('INSS patronal (8%)', '雇主 INSS（8%）') !!}</div><div class="total-value">{{ number_format($employerInssTotal, 2) }} {{ $currency }}</div></td>
            <td><div class="total-label">{!! $bilingualLabel('INSS total (11%)', 'INSS 总额（11%）') !!}</div><div class="total-value">{{ number_format($employeeInssTotal + $employerInssTotal, 2) }} {{ $currency }}</div></td>
            <td><div class="total-label">{!! $bilingualLabel('Total líquido a pagar', '应付净额') !!}</div><div class="total-value">{{ number_format((float) $period->records->sum('net_salary'), 2) }} {{ $currency }}</div></td>
        </tr>
    </table>

    <div class="footer">
        {!! $bilingualLabel('Documento gerado eletronicamente pelo HRMS', '本工资表由 HRMS 系统生成') !!}
        {{ now()->format('d/m/Y H:i') }} | {{ $period->tenant->name }}
    </div>
</body>
</html>
