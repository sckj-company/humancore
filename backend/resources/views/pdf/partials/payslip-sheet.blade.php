@php
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
    $currency = $record->currency ?: ($record->tenant?->currency ?? 'AOA');
    $resolvedOperator = $operatorName
        ?? auth()->user()?->name
        ?? $record->period?->processedBy?->name
        ?? $record->approvedBy?->name
        ?? 'Sistema';
    $contractType = $record->contract?->contract_type;
    $contractTypeLabel = match ($contractType) {
        'permanent' => $isBilingual ? 'Efetivo / 无固定期限' : 'Efetivo',
        'fixed_term' => $isBilingual ? 'Termo Certo / 固定期限' : 'Termo Certo',
        'internship' => $isBilingual ? 'Estágio / 实习' : 'Estágio',
        'part_time' => $isBilingual ? 'Tempo Parcial / 兼职' : 'Tempo Parcial',
        default => $contractType ?? '—',
    };
@endphp

<table class="header">
    <tr>
        <td class="header-left">
            <div class="company">{{ $record->tenant?->name }}</div>
            <div class="meta">{{ $record->tenant?->address }}, {{ $record->tenant?->city }}</div>
            <div class="meta">NIF: {{ $record->tenant?->tax_id }}@if($record->tenant?->phone) | {{ $record->tenant->phone }}@endif</div>
        </td>
        <td class="header-right">
            <div class="title">RECIBO DE VENCIMENTO</div>
            @if($isBilingual)
                <div class="title-zh">工资单</div>
            @endif
            <div class="meta">{{ $isBilingual ? 'Período / 工资期间' : 'Período' }}: {{ $record->period?->displayName() }}</div>
            <div class="meta">{{ $isBilingual ? 'Emitido em / 签发日期' : 'Emitido em' }}: {{ now()->format('d/m/Y') }}</div>
            <div class="meta">{{ $isBilingual ? 'Operador / 操作员' : 'Operador' }}: {{ $resolvedOperator }}</div>
        </td>
    </tr>
</table>

<table class="info">
    <tr>
        <td><div class="info-label bilingual">{!! $bilingualLabel('Funcionário', '员工') !!}</div><div class="info-value">{{ $record->employee?->full_name ?? '—' }}</div></td>
        <td><div class="info-label bilingual">{!! $bilingualLabel('Código', '编号') !!}</div><div class="info-value">{{ $record->employee?->employee_code ?? '—' }}</div></td>
        <td><div class="info-label bilingual">{!! $bilingualLabel('Cargo', '职位') !!}</div><div class="info-value">{{ $record->contract?->position?->title ?? '—' }}</div></td>
        <td><div class="info-label bilingual">{!! $bilingualLabel('Contrato', '合同类型') !!}</div><div class="info-value">{{ $contractTypeLabel }}</div></td>
    </tr>
    <tr>
        <td><div class="info-label bilingual">{!! $bilingualLabel('NIF', '税号') !!}</div><div class="info-value">{{ $record->employee?->tax_id ?? '—' }}</div></td>
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
                    <td class="col-desc">{{ $item['name'] ?? $item['code'] ?? '—' }}@if($isBilingual) <span class="zh-inline">/ {{ $mandarinName($item) }}</span>@endif</td>
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
                    <td class="col-desc">{{ $item['name'] ?? $item['code'] ?? '—' }}@if($isBilingual) <span class="zh-inline">/ {{ $mandarinName($item) }}</span>@endif</td>
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
                    <td class="col-desc">{{ $item['name'] ?? $item['code'] ?? '—' }}@if($isBilingual) <span class="zh-inline">/ {{ $mandarinName($item) }}</span>@endif</td>
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
                        <td class="col-desc">{{ $item['name'] ?? $item['code'] ?? '—' }}@if($isBilingual) <span class="zh-inline">/ {{ $mandarinName($item) }}</span>@endif</td>
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
    | {{ now()->format('d/m/Y H:i') }} | Operador: {{ $resolvedOperator }} | {{ $record->tenant?->name }}
</div>
