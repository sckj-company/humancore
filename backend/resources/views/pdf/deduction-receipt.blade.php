<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Comprovativo - {{ $deduction->name }}</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bi = static fn (string $pt, string $zh): string => $isBilingual
            ? e($pt).' <span class="zh-inline">/ '.e($zh).'</span>'
            : e($pt);
        $biBlock = static fn (string $pt, string $zh): string => $isBilingual
            ? '<span class="pt">'.e($pt).'</span><span class="zh-sub">'.e($zh).'</span>'
            : '<span class="pt">'.e($pt).'</span>';
        $tenant = $deduction->tenant;
        $employee = $deduction->employee;
        $currency = $tenant->currency ?? 'AOA';
        $totalAmount = (float) ($deduction->total_amount ?? $deduction->amount ?? 0);
        $paidAmount = (float) ($deduction->paid_amount ?? 0);
        $remainingAmount = max(0, $totalAmount - $paidAmount);
        $requestedDate = ($deduction->requested_at ?? $deduction->created_at)?->format('d/m/Y H:i') ?? now()->format('d/m/Y H:i');
        $installments = $deduction->installments ?? collect();
        $visibleInstallments = $installments->take(10);
        $hiddenInstallmentsCount = max(0, $installments->count() - $visibleInstallments->count());
        $documentCode = sprintf('COMP-%s-%05d', strtoupper(substr($deduction->deduction_type, 0, 3)), $deduction->id);
        [$titlePt, $titleZh] = match ($deduction->deduction_type) {
            'advance' => ['COMPROVATIVO DE ADIANTAMENTO SALARIAL / VALE', '预支工资 / 借款凭证'],
            'fine' => ['COMPROVATIVO DE DESCONTO — MULTA', '罚款扣款凭证'],
            'loan' => ['COMPROVATIVO DE EMPRÉSTIMO INTERNO', '内部借款凭证'],
            'pension' => ['COMPROVATIVO DE DESCONTO — PENSÃO ALIMENTÍCIA', '抚养费扣款凭证'],
            'insurance' => ['COMPROVATIVO DE DESCONTO — SEGURO', '保险扣款凭证'],
            'garnishment' => ['COMPROVATIVO DE DESCONTO — PENHORA', '法院扣押扣款凭证'],
            'union_fee' => ['COMPROVATIVO DE DESCONTO — QUOTA SINDICAL', '工会会费扣款凭证'],
            default => ['COMPROVATIVO DE DESCONTO SALARIAL', '工资扣款凭证'],
        };
        $installmentStatusZh = static fn (string $status): string => match ($status) {
            'pending' => '待扣款',
            'paid' => '已扣款',
            'cancelled' => '已取消',
            default => $status,
        };
        $deductionStatusZh = static fn (string $status): string => match ($status) {
            'active' => '有效',
            'completed' => '已完成',
            'cancelled' => '已取消',
            'paused' => '已暂停',
            default => $status,
        };
        $deductionTypeZh = static fn (string $type): string => match ($type) {
            'advance' => '预支工资',
            'fine' => '罚款',
            'loan' => '内部借款',
            'pension' => '抚养费',
            'insurance' => '保险扣款',
            'garnishment' => '法院扣押',
            'union_fee' => '工会会费',
            default => '其他扣款',
        };
    @endphp
    <style>
        @page { size: A4 portrait; margin: 10mm 12mm; }
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
            font-family: 'DejaVu Sans', 'Droid Sans Fallback', sans-serif;
            font-size: 9px;
            line-height: 1.28;
            color: #1e293b;
            margin: 0;
            padding: 0;
        }
        .sheet {
            page-break-inside: avoid;
        }
        table { width: 100%; border-collapse: collapse; }
        .header-bar {
            border-bottom: 2px solid #1d4ed8;
            padding-bottom: 6px;
            margin-bottom: 7px;
        }
        .company-name { font-size: 12.5px; font-weight: bold; color: #0f172a; }
        .company-meta { font-size: 7.8px; color: #475569; margin-top: 1px; }
        .doc-title { font-size: 11px; font-weight: bold; color: #1d4ed8; text-align: right; }
        .doc-title-zh { font-size: 9px; color: #475569; text-align: right; margin-top: 1px; }
        .doc-code { font-size: 8px; color: #475569; text-align: right; margin-top: 2px; }
        .zh-inline { color: #64748b; font-size: 7.8px; font-weight: normal; }
        .pt { display: block; }
        .zh-sub { display: block; color: #64748b; font-size: 7px; font-weight: normal; margin-top: 1px; }

        .section-title {
            font-size: 8.2px;
            font-weight: bold;
            text-transform: uppercase;
            color: #1e3a8a;
            background: #eff6ff;
            border-left: 3px solid #2563eb;
            padding: 3px 7px;
            margin: 6px 0 4px;
        }
        .info-grid td {
            padding: 3px 6px;
            border: 1px solid #e2e8f0;
            font-size: 8.5px;
            vertical-align: top;
        }
        .info-label {
            display: block;
            font-size: 7.2px;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 1px;
        }
        .info-value {
            font-weight: bold;
            color: #0f172a;
        }

        .summary-boxes {
            margin: 6px 0;
        }
        .summary-boxes td {
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            padding: 4px 6px;
            width: 25%;
        }
        .summary-amount {
            font-size: 10px;
            font-weight: bold;
            color: #0f172a;
        }

        .installments-table th {
            background: #f1f5f9;
            color: #334155;
            font-size: 7.5px;
            text-transform: uppercase;
            text-align: left;
            padding: 3.5px 5px;
            border: 1px solid #cbd5e1;
        }
        .installments-table td {
            padding: 2.8px 5px;
            border: 1px solid #e2e8f0;
            font-size: 8.2px;
        }
        .num { text-align: right; }
        .center { text-align: center; }

        .declaration {
            margin-top: 6px;
            padding: 5px 7px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            font-size: 8px;
            color: #334155;
            line-height: 1.32;
        }
        .declaration-zh {
            margin-top: 3px;
            color: #475569;
            font-size: 7.5px;
        }

        .signatures {
            margin-top: 12px;
            page-break-inside: avoid;
        }
        .signatures td {
            width: 33.33%;
            padding: 0 8px;
            text-align: center;
            vertical-align: bottom;
        }
        .sig-space {
            height: 24px;
            border-bottom: 1px solid #334155;
            margin-bottom: 3px;
        }
        .sig-role {
            font-size: 8px;
            font-weight: bold;
            color: #0f172a;
        }
        .sig-sub {
            font-size: 7px;
            color: #64748b;
        }

        .footer-note {
            margin-top: 7px;
            border-top: 1px solid #e2e8f0;
            padding-top: 4px;
            font-size: 7px;
            color: #64748b;
        }
    </style>
</head>
<body>
    <div class="sheet">
        <div class="header-bar">
            <table>
                <tr>
                    <td style="width: 53%;">
                        <div class="company-name">{{ $tenant?->name ?? 'Empresa' }}</div>
                        <div class="company-meta">
                            @if($tenant?->tax_id) NIF: {{ $tenant->tax_id }} · @endif
                            {{ $tenant?->address ?? 'Angola' }}
                        </div>
                    </td>
                    <td style="width: 47%;">
                        <div class="doc-title">{{ $titlePt }}</div>
                        @if($isBilingual)
                            <div class="doc-title-zh">{{ $titleZh }}</div>
                        @endif
                        <div class="doc-code">Ref.: {{ $documentCode }} · {!! $bi('Pedido', '申请日期') !!}: {{ $requestedDate }}</div>
                    </td>
                </tr>
            </table>
        </div>

        <div class="section-title">{!! $bi('1. Identificação do Trabalhador', '1. 员工信息') !!}</div>
        <table class="info-grid">
            <tr>
                <td style="width: 46%;">
                    <span class="info-label">{!! $bi('Nome Completo', '姓名') !!}</span>
                    <span class="info-value">{{ $employee?->full_name ?? '—' }}</span>
                </td>
                <td style="width: 22%;">
                    <span class="info-label">{!! $bi('Código', '工号') !!}</span>
                    <span class="info-value">{{ $employee?->employee_code ?? '—' }}</span>
                </td>
                <td style="width: 32%;">
                    <span class="info-label">{!! $bi('BI / Identificação', '身份证/证件号') !!}</span>
                    <span class="info-value">{{ $employee?->national_id ?? $employee?->tax_id ?? '—' }}</span>
                </td>
            </tr>
            <tr>
                <td>
                    <span class="info-label">{!! $bi('Departamento', '部门') !!}</span>
                    <span class="info-value">{{ $employee?->department?->name ?? '—' }}</span>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Cargo / Função', '职位') !!}</span>
                    <span class="info-value">{{ $employee?->position?->title ?? '—' }}</span>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Estado Atual', '当前状态') !!}</span>
                    <span class="info-value">
                        {{ $deduction->status_label }}
                        @if($isBilingual)
                            <span class="zh-inline">/ {{ $deductionStatusZh($deduction->status) }}</span>
                        @endif
                    </span>
                </td>
            </tr>
        </table>

        <div class="section-title">{!! $bi('2. Detalhes da Operação', '2. 扣款/预支详情') !!}</div>
        <table class="info-grid">
            <tr>
                <td style="width: 46%;">
                    <span class="info-label">{!! $bi('Descrição / Finalidade', '说明/用途') !!}</span>
                    <span class="info-value">{{ $deduction->name }}</span>
                </td>
                <td style="width: 27%;">
                    <span class="info-label">{!! $bi('Tipo', '类型') !!}</span>
                    <span class="info-value">
                        {{ $deduction->type_label }}
                        @if($isBilingual)
                            <span class="zh-inline">/ {{ $deductionTypeZh($deduction->deduction_type) }}</span>
                        @endif
                    </span>
                </td>
                <td style="width: 27%;">
                    <span class="info-label">{!! $bi('Data de Registo / Pedido', '登记/申请日期') !!}</span>
                    <span class="info-value">{{ $requestedDate }}</span>
                </td>
            </tr>
            @if($deduction->legal_basis || $deduction->notes)
            <tr>
                <td colspan="3">
                    <span class="info-label">{!! $bi('Observações / Fundamento', '备注/依据') !!}</span>
                    <span>{{ \Illuminate\Support\Str::limit(trim(($deduction->legal_basis ? $deduction->legal_basis.' · ' : '').($deduction->notes ?? '')), 180) }}</span>
                </td>
            </tr>
            @endif
        </table>

        <table class="summary-boxes">
            <tr>
                <td>
                    <span class="info-label">{!! $bi('Valor Total', '总金额') !!}</span>
                    <div class="summary-amount">
                        @if($deduction->amount_type === 'percentage' && ! $deduction->total_amount)
                            {{ number_format((float) $deduction->percentage, 2, ',', '.') }}%
                        @else
                            {{ number_format($totalAmount, 2, ',', '.') }} {{ $currency }}
                        @endif
                    </div>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Parcelas', '分期数') !!}</span>
                    <div class="summary-amount">
                        {{ $installments->count() > 0 ? $installments->count().'x' : ($deduction->installment_count ? $deduction->installment_count.'x' : ($isBilingual ? 'Única / 单次' : 'Única / Recorrente')) }}
                    </div>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Já Descontado / Pago', '已扣/已付') !!}</span>
                    <div class="summary-amount">{{ number_format($paidAmount, 2, ',', '.') }} {{ $currency }}</div>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Saldo Por Descontar', '待扣余额') !!}</span>
                    <div class="summary-amount">{{ number_format($remainingAmount, 2, ',', '.') }} {{ $currency }}</div>
                </td>
            </tr>
        </table>

        <div class="section-title">{!! $bi('3. Plano de Amortização / Parcelas', '3. 还款/扣款计划') !!}</div>
        @if($visibleInstallments->isNotEmpty())
            <table class="installments-table">
                <thead>
                    <tr>
                        <th style="width: 8%;" class="center">#</th>
                        <th style="width: 24%;">{!! $bi('Mês de Desconto', '扣款月份') !!}</th>
                        <th style="width: 18%;" class="num">{!! $bi('Percentagem', '比例') !!}</th>
                        <th style="width: 26%;" class="num">{!! $bi('Valor (' . $currency . ')', '金额') !!}</th>
                        <th style="width: 24%;" class="center">{!! $bi('Estado', '状态') !!}</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($visibleInstallments as $item)
                        <tr>
                            <td class="center">{{ $item->installment_number }}</td>
                            <td>{{ $item->reference_month }}</td>
                            <td class="num">{{ number_format((float) $item->percentage, 2, ',', '.') }}%</td>
                            <td class="num">{{ number_format((float) $item->amount, 2, ',', '.') }}</td>
                            <td class="center">
                                {{ \App\Models\DeductionInstallment::STATUSES[$item->status] ?? $item->status }}
                                @if($isBilingual)
                                    <span class="zh-inline">/ {{ $installmentStatusZh($item->status) }}</span>
                                @endif
                            </td>
                        </tr>
                    @endforeach
                    @if($hiddenInstallmentsCount > 0)
                        <tr>
                            <td colspan="5" class="center" style="color: #475569; font-style: italic;">
                                (+ {{ $hiddenInstallmentsCount }} parcela(s) adicional(ais) registada(s) no sistema)
                            </td>
                        </tr>
                    @endif
                </tbody>
            </table>
        @else
            <table class="installments-table">
                <tbody>
                    <tr>
                        <td>
                            Desconto {{ $deduction->is_recurring ? 'recorrente mensal' : 'pontual' }} a iniciar em
                            <strong>{{ $deduction->starts_at?->format('Y-m') ?? 'processamento imediato' }}</strong> —
                            Valor por período: <strong>{{ $deduction->amount_label }}</strong>.
                            @if($isBilingual)
                                <br><span class="zh-inline">起始扣款月份：{{ $deduction->starts_at?->format('Y-m') ?? '立即执行' }} · 每期金额：{{ $deduction->amount_label }}</span>
                            @endif
                        </td>
                    </tr>
                </tbody>
            </table>
        @endif

        <div class="declaration">
            <strong>{!! $bi('Declaração e Autorização de Desconto:', '声明与扣款授权：') !!}</strong>
            Eu, <strong>{{ $employee?->full_name ?? '____________________' }}</strong>, declaro ter recebido / tomado conhecimento do valor e das condições acima descritos e autorizo expressamente a entidade empregadora a proceder ao respetivo desconto em folha salarial, nos meses e percentagens discriminados no plano de amortização, nos termos da legislação laboral aplicável.
            @if($isBilingual)
                <div class="declaration-zh">
                    本人 <strong>{{ $employee?->full_name ?? '____________________' }}</strong> 确认已知悉并收到上述金额及条款，并明确授权雇主依据适用劳动法及上述分期计划从本人薪资中扣除相应款项。
                </div>
            @endif
        </div>

        <table class="signatures">
            <tr>
                <td>
                    <div class="sig-space"></div>
                    <div class="sig-role">{!! $biBlock('O Trabalhador', '员工签名') !!}</div>
                    <div class="sig-sub">{{ $employee?->full_name ?? '' }} · {!! $bi('Data', '日期') !!}: ___/___/_____</div>
                </td>
                <td>
                    <div class="sig-space"></div>
                    <div class="sig-role">{!! $biBlock('Recursos Humanos', '人力资源部') !!}</div>
                    <div class="sig-sub">{{ $operatorName }} · {!! $bi('Data', '日期') !!}: ___/___/_____</div>
                </td>
                <td>
                    <div class="sig-space"></div>
                    <div class="sig-role">{!! $biBlock('Direção / Aprovação', '管理层审批') !!}</div>
                    <div class="sig-sub">{{ $deduction->approver?->name ?? 'Responsável' }} · {!! $bi('Data', '日期') !!}: ___/___/_____</div>
                </td>
            </tr>
        </table>

        <div class="footer-note">
            {!! $bi('Emitido por', '签发人') !!}: {{ $operatorName }} · {{ now()->format('d/m/Y H:i') }} · {{ config('app.name', 'HumanCore') }} · {!! $bi('Documento válido após assinatura e carregamento no sistema.', '本文件经签字并上传系统后生效。') !!}
        </div>
    </div>
</body>
</html>
