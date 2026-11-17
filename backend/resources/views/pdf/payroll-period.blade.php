<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>{{ ($isBilingual ?? (($lang ?? 'bilingual') !== 'pt')) ? 'Folha salarial / 工资表' : 'Folha salarial' }}</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bilingualLabel = static fn (string $portuguese, string $mandarin): string => $isBilingual
            ? '<span class="pt">'.e($portuguese).'</span><span class="zh">'.e($mandarin).'</span>'
            : '<span class="pt">'.e($portuguese).'</span>';
        $bilingualInline = static fn (string $portuguese, string $mandarin): string => $isBilingual
            ? e($portuguese).' / '.e($mandarin)
            : e($portuguese);
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
            if ($item->code === 'bonus' || str_contains($text, 'bonus') || str_contains($text, 'bónus')) return 'bonus';
            if (str_contains($text, 'adicional') || str_contains($text, 'additional')) return 'additional';

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
        $resolvedOperator = $operatorName
            ?? auth()->user()?->name
            ?? $period->processedBy?->name
            ?? $period->approvedBy?->name
            ?? 'Sistema';
        $processedByName = $period->processedBy?->name;
        $approvedByName = $period->approvedBy?->name;
        $employeeInssTotal = 0.0;
        $employerInssTotal = 0.0;
        $irtTotal = 0.0;
        $otherDeductionsTotal = 0.0;
        foreach ($period->records as $record) {
            $items = $recordItems($record);
            $irtAmount = $itemTotal($items, 'irt') ?: (float) $record->total_taxes;
            $irtTotal += $irtAmount;
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
        @page { size: A4 landscape; margin: 6mm; }
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
        body { font-family: 'Droid Sans Fallback', 'DejaVu Sans', sans-serif; font-size: 6.5px; color: #1e293b; }
        table { width: 100%; border-collapse: collapse; }
        .header { margin-bottom: 6px; border-bottom: 2px solid #2563eb; }
        .header td { padding: 2px 0 5px; vertical-align: top; }
        .company { font-size: 11px; font-weight: bold; }
        .title { color: #1d4ed8; font-size: 13px; font-weight: bold; text-align: right; }
        .meta { color: #64748b; font-size: 6.8px; text-align: right; line-height: 1.3; }
        .pt, .zh { display: block; }
        .zh { color: #475569; font-size: 5.3px; margin-top: 1px; }
        .emp-code { display: block; color: #475569; font-size: 5.2px; margin-top: 1px; white-space: nowrap; }
        .totals { margin: 6px 0 0; page-break-inside: avoid; }
        .totals td { width: 20%; padding: 3.5px 6px; border: 1px solid #cbd5e1; }
        .total-label { color: #475569; }
        .total-value { font-size: 8.5px; font-weight: bold; margin-top: 1.5px; }
        .records { table-layout: fixed; width: 100%; }
        .records thead { display: table-header-group; }
        .records tbody tr { page-break-inside: avoid; }
        .records th, .records td { border: 1px solid #94a3b8; padding: 2px 1.8px; vertical-align: middle; overflow: hidden; }
        .records th { background: #eaf0f8; text-align: center; font-weight: bold; font-size: 5.7px; line-height: 1.15; word-wrap: break-word; }
        .records thead tr:first-child th { background: #dce6f2; font-size: 6.5px; padding: 2.5px 2px; }
        .records thead tr:first-child th.group-earnings,
        .records thead tr:first-child th.group-deductions,
        .records thead tr:first-child th.group-net { border-left: 1.5px solid #475569; }
        .records .number { text-align: center; }
        .records td.text-cell { white-space: normal; word-wrap: break-word; overflow-wrap: break-word; line-height: 1.15; font-size: 5.9px; }
        .records td.amount { text-align: right; white-space: nowrap; font-size: 5.9px; padding: 2px 1.8px; }
        .records .section-start { border-left: 1.5px solid #475569; }
        .records td.subtotal-gross, .records td.subtotal-deductions { font-weight: bold; }
        .records td.net-cell { font-weight: bold; border-left: 1.5px solid #475569; }
        .records .summary-row td { background: #f1f5f9; font-weight: bold; font-size: 5.7px; padding: 2.5px 1.8px; }
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
                <div class="title">{{ $bilingualInline('FOLHA DE REMUNERAÇÃO', '工资表') }}</div>
                <div class="meta">{{ $bilingualInline('Período', '工资期间') }}: {{ $period->displayName() }}</div>
                <div class="meta">{{ $bilingualInline('Emitido em', '签发日期') }}: {{ now()->format('d/m/Y') }}</div>
                <div class="meta">{{ $bilingualInline('Operador', '操作员') }}: {{ $resolvedOperator }}</div>
            </td>
        </tr>
    </table>

    <table class="records">
        <colgroup>
            <col style="width: 2.2%;">
            <col style="width: 10.5%;">
            <col style="width: 7.2%;">
            <col style="width: 3.0%;">
            <col style="width: 5.6%;">
            <col style="width: 4.1%;">
            <col style="width: 4.1%;">
            <col style="width: 4.1%;">
            <col style="width: 4.1%;">
            <col style="width: 4.1%;">
            <col style="width: 4.1%;">
            <col style="width: 4.1%;">
            <col style="width: 4.1%;">
            <col style="width: 5.7%;">
            <col style="width: 4.2%;">
            <col style="width: 4.6%;">
            <col style="width: 4.8%;">
            <col style="width: 4.2%;">
            <col style="width: 4.2%;">
            <col style="width: 5.2%;">
            <col style="width: 5.8%;">
        </colgroup>
        <thead>
            <tr>
                <th class="number" rowspan="2">{!! $bilingualLabel('N.º', '序号') !!}</th>
                <th rowspan="2">{!! $bilingualLabel('Nome', '姓名') !!}</th>
                <th rowspan="2">{!! $bilingualLabel('Categoria', '类别') !!}</th>
                <th rowspan="2">{!! $bilingualLabel('Faltas (dias)', '缺勤(天)') !!}</th>
                <th class="group-earnings" colspan="10">{!! $bilingualLabel('PROVEITOS', '收入') !!}</th>
                <th class="group-deductions" colspan="6">{!! $bilingualLabel('DESCONTOS', '扣款') !!}</th>
                <th class="group-net net-cell" rowspan="2">{!! $bilingualLabel('Salário líquido', '实发工资') !!}</th>
            </tr>
            <tr>
                <th class="section-start">{!! $bilingualLabel('Salário base', '基本工资') !!}</th>
                <th>{!! $bilingualLabel('Subs. férias', '假期津贴') !!}</th>
                <th>{!! $bilingualLabel('Subs. Natal', '圣诞津贴') !!}</th>
                <th>{!! $bilingualLabel('Abono família', '家庭补贴') !!}</th>
                <th>{!! $bilingualLabel('Subs. alimentação', '餐饮补贴') !!}</th>
                <th>{!! $bilingualLabel('Subs. transporte', '交通补贴') !!}</th>
                <th>{!! $bilingualLabel('Horas extra', '加班费') !!}</th>
                <th>{!! $bilingualLabel('Bónus', '奖金') !!}</th>
                <th>{!! $bilingualLabel('A. adicional', '其他补贴') !!}</th>
                <th class="subtotal-gross">{!! $bilingualLabel('Salário bruto', '应发合计') !!}</th>
                <th class="section-start">{!! $bilingualLabel('Desc. faltas', '缺勤扣款') !!}</th>
                <th>{!! $bilingualLabel('INSS (3%)', 'INSS(3%)') !!}</th>
                <th>{!! $bilingualLabel('IRT', '工资所得税') !!}</th>
                <th>{!! $bilingualLabel('Vales', '预支款') !!}</th>
                <th>{!! $bilingualLabel('Outros desc.', '其他扣款') !!}</th>
                <th class="subtotal-deductions">{!! $bilingualLabel('Total desc.', '扣款合计') !!}</th>
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
                    <td class="text-cell">{{ $record->employee?->full_name ?? '—' }}<span class="emp-code">{{ $record->employee?->employee_code }}</span></td>
                    <td class="text-cell">{{ $record->contract?->position?->title ?? '—' }}</td>
                    <td class="amount">{{ number_format((float) $record->absent_days, 0) }}</td>
                    <td class="amount section-start">{{ number_format((float) $record->base_salary, 2) }}</td>
                    <td class="amount">{{ number_format($value('vacation'), 2) }}</td>
                    <td class="amount">{{ number_format($value('christmas'), 2) }}</td>
                    <td class="amount">{{ number_format($value('family'), 2) }}</td>
                    <td class="amount">{{ number_format($value('meal'), 2) }}</td>
                    <td class="amount">{{ number_format($value('transport'), 2) }}</td>
                    <td class="amount">{{ number_format($value('overtime'), 2) }}</td>
                    <td class="amount">{{ number_format($value('bonus'), 2) }}</td>
                    <td class="amount">{{ number_format($value('additional') + $value('other_earning'), 2) }}</td>
                    <td class="amount subtotal-gross">{{ number_format((float) $record->total_earnings, 2) }}</td>
                    <td class="amount section-start">{{ number_format($absenceAmount, 2) }}</td>
                    <td class="amount">{{ number_format($employeeInss, 2) }}</td>
                    <td class="amount">{{ number_format($irtAmount, 2) }}</td>
                    <td class="amount">{{ number_format($voucherAmount, 2) }}</td>
                    <td class="amount">{{ number_format($otherDeductions, 2) }}</td>
                    <td class="amount subtotal-deductions">{{ number_format($totalDeductions, 2) }}</td>
                    <td class="amount net-cell">{{ number_format((float) $record->net_salary, 2) }}</td>
                </tr>
            @endforeach
            <tr class="summary-row">
                <td colspan="4">{!! $bilingualLabel('Totais da folha', '工资总计') !!}</td>
                <td class="amount section-start">{{ number_format((float) $period->records->sum('base_salary'), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'vacation')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'christmas')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'family')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'meal')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'transport')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'overtime')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'bonus')), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'additional') + $itemTotal($recordItems($record), 'other_earning')), 2) }}</td>
                <td class="amount subtotal-gross">{{ number_format((float) $period->records->sum('total_earnings'), 2) }}</td>
                <td class="amount section-start">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'absence')), 2) }}</td>
                <td class="amount">{{ number_format($employeeInssTotal, 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'irt') ?: (float) $record->total_taxes), 2) }}</td>
                <td class="amount">{{ number_format($period->records->sum(fn ($record) => $itemTotal($recordItems($record), 'voucher')), 2) }}</td>
                <td class="amount">{{ number_format($otherDeductionsTotal, 2) }}</td>
                <td class="amount subtotal-deductions">{{ number_format((float) $period->records->sum('total_deductions') + (float) $period->records->sum('total_taxes'), 2) }}</td>
                <td class="amount net-cell">{{ number_format((float) $period->records->sum('net_salary'), 2) }}</td>
            </tr>
        </tbody>
    </table>

    <table class="totals">
        <tr>
            <td><div class="total-label">{!! $bilingualLabel('INSS dos funcionários (3%)', '员工 INSS（3%）') !!}</div><div class="total-value">{{ number_format($employeeInssTotal, 2) }} {{ $currency }}</div></td>
            <td><div class="total-label">{!! $bilingualLabel('INSS patronal (8%)', '雇主 INSS（8%）') !!}</div><div class="total-value">{{ number_format($employerInssTotal, 2) }} {{ $currency }}</div></td>
            <td><div class="total-label">{!! $bilingualLabel('INSS total (11%)', 'INSS 总额（11%）') !!}</div><div class="total-value">{{ number_format($employeeInssTotal + $employerInssTotal, 2) }} {{ $currency }}</div></td>
            <td><div class="total-label">{!! $bilingualLabel('IRT total', '工资所得税总额') !!}</div><div class="total-value">{{ number_format($irtTotal, 2) }} {{ $currency }}</div></td>
            <td><div class="total-label">{!! $bilingualLabel('Total líquido a pagar', '应付净额') !!}</div><div class="total-value">{{ number_format((float) $period->records->sum('net_salary'), 2) }} {{ $currency }}</div></td>
        </tr>
    </table>

    <div class="footer">
        {!! $bilingualLabel('Documento gerado eletronicamente pelo HRMS', '本工资表由 HRMS 系统生成') !!}
        {{ now()->format('d/m/Y H:i') }} | Operador: {{ $resolvedOperator }}
        @if($processedByName && $processedByName !== $resolvedOperator)
            | Processado por: {{ $processedByName }}
        @endif
        @if($approvedByName)
            | Aprovado por: {{ $approvedByName }}
        @endif
        | {{ $period->tenant->name }}
    </div>
</body>
</html>
