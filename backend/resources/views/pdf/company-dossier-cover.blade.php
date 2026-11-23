<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>{{ $tenant->name }} — Dossiê Completo</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bi = static fn (string $pt, string $zh): string => $isBilingual
            ? e($pt).' <span class="zh-inline">/ '.e($zh).'</span>'
            : e($pt);
        $currency = $tenant->currency ?? 'AOA';
        $t = $financials['totals'];
        $fmt = static fn (float|int|null $v): string => number_format((float) ($v ?? 0), 2, ',', '.');

        $sectionLabels = [
            'payroll_sheet' => ['Folha de Salário', '工资表'],
            'payslips' => ['Recibos de Vencimento (Espelhados)', '员工工资单汇总'],
            'inss_map' => ['Mapa de Contribuições INSS', '社会保险明细表'],
            'irt_map' => ['Mapa de Retenção de IRT', '个人所得税明细表'],
            'inss_payment_proof' => ['Comprovativo de Pagamento do INSS', '社保付款凭证'],
            'attendance' => ['Relatório de Assiduidade e Presenças', '考勤汇总报告'],
        ];

        $mandatoryRows = [
            ['key' => 'inss_guide', 'pt' => 'Guia do INSS', 'zh' => '社保缴费单'],
            ['key' => 'inss_payment_proof', 'pt' => 'Comprovativo de Pagamento do INSS', 'zh' => '社保付款凭证'],
            ['key' => 'payslips_summary_pdf', 'pt' => 'PDF de Resumo de Todos os Recibos', 'zh' => '全部工资单汇总PDF'],
            ['key' => 'payroll_sheet', 'pt' => 'Folha de Salário', 'zh' => '工资表'],
        ];
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
        @font-face {
            font-family: 'Droid Sans Fallback';
            src: url('{{ resource_path('fonts/DroidSansFallbackFull.ttf') }}') format('truetype');
            font-weight: bold;
            font-style: normal;
        }
        @endif
        * { box-sizing: border-box; }
        body { font-family: 'DejaVu Sans', 'Droid Sans Fallback', sans-serif; font-size: 8.8px; color: #1e293b; line-height: 1.35; margin: 0; }
        table { width: 100%; border-collapse: collapse; }
        .header { border-bottom: 2.5px solid #1d4ed8; padding-bottom: 8px; margin-bottom: 10px; }
        .header td { vertical-align: top; }
        .company { font-size: 13px; font-weight: bold; color: #0f172a; }
        .meta { font-size: 8px; color: #64748b; margin-top: 1.5px; }
        .doc-title { font-size: 14px; font-weight: bold; color: #1d4ed8; text-align: right; }
        .doc-title-zh { font-size: 9.5px; color: #475569; text-align: right; margin-top: 1px; }
        .zh-inline { color: #64748b; font-size: 7.8px; font-weight: normal; }

        .status-banner {
            margin: 8px 0 10px;
            border: 1.5px solid {{ $inssPaid ? '#16a34a' : '#dc2626' }};
            background: {{ $inssPaid ? '#f0fdf4' : '#fef2f2' }};
            padding: 8px 10px;
        }
        .status-banner td { vertical-align: middle; }
        .badge {
            display: inline-block;
            padding: 2.5px 7px;
            border-radius: 3px;
            font-size: 8px;
            font-weight: bold;
        }
        .badge-ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .badge-no { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .badge-warn { background: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }

        .section-title {
            font-size: 8.8px;
            font-weight: bold;
            text-transform: uppercase;
            color: #1e3a8a;
            background: #eff6ff;
            border-left: 3px solid #2563eb;
            padding: 4px 8px;
            margin: 10px 0 6px;
        }
        .kpi-table { margin-bottom: 8px; }
        .kpi-table td {
            width: 25%;
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            padding: 6px 8px;
        }
        .kpi-label { font-size: 7.4px; color: #64748b; display: block; }
        .kpi-val { font-size: 10.5px; font-weight: bold; color: #0f172a; margin-top: 2px; }

        .data-table th {
            background: #1e293b;
            color: #ffffff;
            font-size: 7.8px;
            padding: 5px 7px;
            border: 1px solid #334155;
            text-align: left;
        }
        .data-table td {
            padding: 5px 7px;
            border: 1px solid #cbd5e1;
            font-size: 8.2px;
        }
        .data-table tr:nth-child(even) td { background: #f8fafc; }
        .toc-list { width: 100%; border: 1px solid #cbd5e1; }
        .toc-list td { padding: 4.5px 8px; border-bottom: 1px solid #e2e8f0; font-size: 8.4px; }
        .toc-list tr:last-child td { border-bottom: none; }

        .signatures { width: 100%; margin-top: 22px; page-break-inside: avoid; }
        .signatures td { width: 50%; padding: 0 28px; text-align: center; vertical-align: bottom; }
        .sig-space { height: 30px; border-bottom: 1px solid #475569; margin-bottom: 4px; }
        .sig-role { font-size: 8px; font-weight: bold; color: #0f172a; }
        .sig-sub { font-size: 7px; color: #64748b; margin-top: 1px; }
        .footer { margin-top: 14px; text-align: center; color: #64748b; font-size: 7.2px; border-top: 1px solid #e2e8f0; padding-top: 5px; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td style="width: 56%;">
                <div class="company">{{ $tenant->name }}</div>
                <div class="meta">NIF: {{ $tenant->tax_id ?? '—' }}@if($tenant->inss_number) | Nº INSS: {{ $tenant->inss_number }}@endif</div>
                <div class="meta">{{ trim(($tenant->address ?? '').' '.($tenant->city ?? '').' '.($tenant->province ?? '')) ?: 'Angola' }}</div>
                @if($tenant->email || $tenant->phone)
                    <div class="meta">{{ trim(($tenant->email ?? '').' '.($tenant->phone ? '· '.$tenant->phone : '')) }}</div>
                @endif
            </td>
            <td style="width: 44%;">
                <div class="doc-title">RESUMO COMPLETO DA FOLHA</div>
                @if($isBilingual)
                    <div class="doc-title-zh">公司薪酬及合规完整报告</div>
                @endif
                <div class="meta" style="text-align:right;">{!! $bi('Período', '期间') !!}: <strong>{{ $period->displayName() }}</strong></div>
                <div class="meta" style="text-align:right;">{!! $bi('Intervalo', '日期范围') !!}: {{ $period->period_start?->format('d/m/Y') }} – {{ $period->period_end?->format('d/m/Y') }}</div>
                <div class="meta" style="text-align:right;">{!! $bi('Emitido em', '签发日期') !!}: {{ now()->format('d/m/Y H:i') }} | {!! $bi('Operador', '操作员') !!}: {{ $operatorName }}</div>
            </td>
        </tr>
    </table>

    <table class="status-banner">
        <tr>
            <td style="width: 55%;">
                <div style="font-size: 9px; font-weight: bold; color: {{ $inssPaid ? '#166534' : '#991b1b' }};">
                    {!! $bi('SITUAÇÃO DO PAGAMENTO DO INSS', '社保缴费状态') !!}
                </div>
                <div style="font-size: 8px; color: #334155; margin-top: 2px;">
                    {!! $bi('Comprovativo anexado', '已附凭证') !!}: <strong>{{ $inssProofDoc->file_name }}</strong>
                    @if($inssProofDoc->paid_at)
                        · {{ $inssProofDoc->paid_at->format('d/m/Y') }}
                    @endif
                </div>
            </td>
            <td style="width: 45%; text-align: right;">
                <span class="badge {{ $inssPaid ? 'badge-ok' : 'badge-no' }}">
                    {!! $inssPaid ? $bi('INSS PAGO', '社保已缴') : $bi('INSS NÃO PAGO', '社保未缴') !!}
                </span>
                <span class="badge {{ $inssProofSent ? 'badge-ok' : 'badge-warn' }}" style="margin-left: 4px;">
                    {!! $inssProofSent ? $bi('COMPROVATIVO ENVIADO', '凭证已发送') : $bi('NÃO ENVIADO', '未发送') !!}
                </span>
            </td>
        </tr>
    </table>

    <div class="section-title">{!! $bi('RESUMO FINANCEIRO DO PERÍODO', '期间财务汇总') !!}</div>
    <table class="kpi-table">
        <tr>
            <td>
                <span class="kpi-label">{!! $bi('Funcionários', '员工人数') !!}</span>
                <div class="kpi-val">{{ $t['employees_count'] }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Total Bruto', '应发总额') !!}</span>
                <div class="kpi-val">{{ $fmt($t['total_gross']) }} {{ $currency }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Total Líquido', '实发总额') !!}</span>
                <div class="kpi-val">{{ $fmt($t['total_net']) }} {{ $currency }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Custo Total Empregador', '用工总成本') !!}</span>
                <div class="kpi-val">{{ $fmt($t['total_employer_cost']) }} {{ $currency }}</div>
            </td>
        </tr>
        <tr>
            <td>
                <span class="kpi-label">{!! $bi('INSS Trabalhador (3%)', '员工社保') !!}</span>
                <div class="kpi-val">{{ $fmt($t['total_inss_employee']) }} {{ $currency }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('INSS Empresa (8%)', '企业社保') !!}</span>
                <div class="kpi-val">{{ $fmt($t['total_inss_employer']) }} {{ $currency }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Total INSS a Pagar', '社保合计') !!}</span>
                <div class="kpi-val">{{ $fmt($t['total_inss']) }} {{ $currency }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Total IRT Retido', '代扣个税总额') !!}</span>
                <div class="kpi-val">{{ $fmt($t['total_irt']) }} {{ $currency }}</div>
            </td>
        </tr>
    </table>

    <div class="section-title">{!! $bi('ESTADO DOS DOCUMENTOS OBRIGATÓRIOS DO RELATÓRIO', '合规文件及状态清单') !!}</div>
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 38%;">{!! $bi('Documento Obrigatório', '必备文件') !!}</th>
                <th style="width: 24%;">{!! $bi('Anexo', '附件状态') !!}</th>
                <th style="width: 19%;">{!! $bi('Enviado', '发送状态') !!}</th>
                <th style="width: 19%;">{!! $bi('Pago', '付款状态') !!}</th>
            </tr>
        </thead>
        <tbody>
            @foreach($mandatoryRows as $row)
                @php($st = $mandatoryStatus[$row['key']] ?? ['attached' => false, 'is_sent' => false, 'is_paid' => false, 'file_name' => null])
                <tr>
                    <td><strong>{!! $bi($row['pt'], $row['zh']) !!}</strong></td>
                    <td>{{ $st['attached'] ? ($st['file_name'] ?? 'Anexado') : 'Não anexado' }}</td>
                    <td>
                        <span class="badge {{ $st['is_sent'] ? 'badge-ok' : 'badge-no' }}">
                            {!! $st['is_sent'] ? $bi('ENVIADO', '已发送') : $bi('NÃO ENVIADO', '未发送') !!}
                        </span>
                    </td>
                    <td>
                        @if($row['key'] === 'inss_payment_proof')
                            <span class="badge {{ ($mandatoryStatus['inss_paid'] ?? false) ? 'badge-ok' : 'badge-no' }}">
                                {!! ($mandatoryStatus['inss_paid'] ?? false) ? $bi('PAGO', '已缴') : $bi('NÃO PAGO', '未缴') !!}
                            </span>
                        @else
                            <span class="badge {{ $st['is_paid'] ? 'badge-ok' : 'badge-warn' }}">
                                {!! $st['is_paid'] ? $bi('PAGO', '已付') : $bi('N/A', '—') !!}
                            </span>
                        @endif
                    </td>
                </tr>
            @endforeach
            <tr>
                <td colspan="2"><strong>{!! $bi('Situação Geral do Resumo', '汇总完成状态') !!}</strong></td>
                <td colspan="2">
                    <span class="badge {{ $report->is_summary_complete ? 'badge-ok' : 'badge-warn' }}">
                        {!! $report->is_summary_complete ? $bi('CONCLUÍDO / VERIFICADO', '已完成') : $bi('PENDENTE', '待完成') !!}
                    </span>
                </td>
            </tr>
        </tbody>
    </table>

    <div class="section-title">{!! $bi('SECÇÕES INCLUÍDAS NESTE DOCUMENTO', '本报告包含章节') !!}</div>
    <table class="toc-list">
        @foreach($sections as $idx => $sec)
            @php([$pt, $zh] = $sectionLabels[$sec] ?? [$sec, $sec])
            <tr>
                <td style="width: 8%;"><strong>{{ $idx + 1 }}.</strong></td>
                <td>{!! $bi($pt, $zh) !!}</td>
            </tr>
        @endforeach
    </table>

    <table class="signatures">
        <tr>
            <td>
                <div class="sig-space"></div>
                <div class="sig-role">{!! $bi('Recursos Humanos (RH)', '人力资源部') !!}</div>
                <div class="sig-sub">{{ $period->approvedBy?->name ?? $operatorName }}</div>
            </td>
            <td>
                <div class="sig-space"></div>
                <div class="sig-role">{!! $bi('A Empresa / Direção', '公司 / 雇主签章') !!}</div>
                <div class="sig-sub">{{ $tenant->name }}</div>
            </td>
        </tr>
    </table>

    <div class="footer">
        HumanCore HRMS · {{ $tenant->name }} · {!! $bi('Dossiê gerado automaticamente', '系统自动生成') !!}
    </div>
</body>
</html>
