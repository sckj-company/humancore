<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Resumo Geral das Empresas e Folhas</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bi = static fn (string $pt, string $zh): string => $isBilingual
            ? e($pt).' <span class="zh-inline">/ '.e($zh).'</span>'
            : e($pt);
        $range = $overview['range'];
        $totals = $overview['totals'];
        $companies = $overview['companies'];
        $periodRows = $overview['period_rows'] ?? [];
        $monthlyTimeline = $overview['monthly_timeline'] ?? [];
        $fmt = static fn (float|int|null $v): string => number_format((float) ($v ?? 0), 2, ',', '.');
        [$perPt, $perZh] = match ($range['periodicity']) {
            'quarterly' => ['Trimestral', '季度报告'],
            'semiannual' => ['Semestral', '半年度报告'],
            'annual' => ['Anual', '年度报告'],
            default => ['Mensal', '月度报告'],
        };
    @endphp
    <style>
        @page { size: A4 landscape; margin: 9mm 10mm; }
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
        body { font-family: 'DejaVu Sans', 'Droid Sans Fallback', sans-serif; font-size: 7.5px; color: #1e293b; margin: 0; line-height: 1.3; }
        table { width: 100%; border-collapse: collapse; }
        .header { border-bottom: 2.5px solid #1d4ed8; padding-bottom: 6px; margin-bottom: 8px; }
        .brand { font-size: 12px; font-weight: bold; color: #0f172a; }
        .meta { font-size: 7.4px; color: #64748b; }
        .title { font-size: 12.5px; font-weight: bold; color: #1d4ed8; text-align: right; }
        .zh-inline { color: #64748b; font-size: 6.8px; font-weight: normal; }
        .kpi-row { margin-bottom: 8px; }
        .kpi-row td { width: 16.66%; border: 1px solid #cbd5e1; background: #f8fafc; padding: 5px 6px; text-align: center; }
        .kpi-label { display: block; font-size: 6.6px; color: #64748b; text-transform: uppercase; }
        .kpi-val { font-size: 9.8px; font-weight: bold; color: #0f172a; margin-top: 1.5px; }
        .section-title {
            font-size: 8px;
            font-weight: bold;
            text-transform: uppercase;
            color: #1e3a8a;
            background: #eff6ff;
            border-left: 3px solid #2563eb;
            padding: 3.5px 7px;
            margin: 8px 0 4px;
        }
        .data-table thead { display: table-header-group; }
        .data-table th { background: #1e293b; color: #ffffff; padding: 4px 4.5px; border: 1px solid #334155; font-size: 6.8px; text-align: left; }
        .data-table td { padding: 3.8px 4.5px; border: 1px solid #cbd5e1; font-size: 7.1px; vertical-align: middle; }
        .data-table tr:nth-child(even) td { background: #f8fafc; }
        .num { text-align: right !important; white-space: nowrap; }
        .center { text-align: center !important; }
        .totals-row td { background: #e2e8f0 !important; font-weight: bold; border-top: 1.5px solid #475569; }
        .badge { display: inline-block; padding: 1px 4.5px; border-radius: 2.5px; font-size: 6.5px; font-weight: bold; }
        .b-ok { background: #dcfce7; color: #166534; border: 1px solid #86efac; }
        .b-no { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
        .b-na { background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; }
        .page-break { page-break-before: always; }
        .signatures { width: 100%; margin-top: 14px; page-break-inside: avoid; }
        .signatures td { width: 50%; padding: 0 36px; text-align: center; vertical-align: bottom; }
        .sig-space { height: 22px; border-bottom: 1px solid #475569; margin-bottom: 3px; }
        .sig-role { font-size: 7.4px; font-weight: bold; }
        .sig-sub { font-size: 6.6px; color: #64748b; }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td style="width: 55%;">
                <div class="brand">HumanCore HRMS — {!! $bi('Gestão Global & Conformidade Salarial', '平台薪酬与合规总览') !!}</div>
                <div class="meta">{!! $bi('Âmbito', '范围') !!}: <strong>{{ $scopeLabel }}</strong></div>
                <div class="meta">{!! $bi('Periodicidade', '周期类型') !!}: {{ $perPt }}@if($isBilingual) / {{ $perZh }}@endif · {{ $range['label'] }} ({{ \Carbon\Carbon::parse($range['start_date'])->format('d/m/Y') }} – {{ \Carbon\Carbon::parse($range['end_date'])->format('d/m/Y') }})</div>
            </td>
            <td style="width: 45%; text-align: right;">
                <div class="title">{!! $bi('RESUMO GERAL DE FOLHAS E ESTADOS', '工资及合规状态总报告') !!}</div>
                <div class="meta">{!! $bi('Emitido em', '签发日期') !!}: {{ now()->format('d/m/Y H:i') }}</div>
                <div class="meta">{!! $bi('Operador', '操作员') !!}: {{ $operatorName }}</div>
            </td>
        </tr>
    </table>

    <table class="kpi-row">
        <tr>
            <td>
                <span class="kpi-label">{!! $bi('Empresas / Aprovadas', '企业数 / 已批') !!}</span>
                <div class="kpi-val">{{ $totals['companies_total'] }} / {{ $totals['companies_with_approved_payroll'] }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Resumos Concluídos', '已完成汇总') !!}</span>
                <div class="kpi-val">{{ $totals['reports_complete_count'] }} / {{ $totals['periods_count'] }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('INSS Pago (Períodos)', '社保已缴期间') !!}</span>
                <div class="kpi-val">{{ $totals['inss_paid_periods_count'] }} / {{ $totals['periods_count'] }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Total Bruto', '应发总额') !!}</span>
                <div class="kpi-val">{{ $fmt($totals['total_gross']) }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Total INSS + IRT', '社保+个税') !!}</span>
                <div class="kpi-val">{{ $fmt($totals['total_inss'] + $totals['total_irt']) }}</div>
            </td>
            <td>
                <span class="kpi-label">{!! $bi('Total Líquido', '实发总额') !!}</span>
                <div class="kpi-val">{{ $fmt($totals['total_net']) }}</div>
            </td>
        </tr>
    </table>

    <div class="section-title">{!! $bi('1. ESTADOS DE ENVIO E CONFORMIDADE POR EMPRESA', '1. 各公司资料提交与合规状态') !!}</div>
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 24%;">{!! $bi('Empresa / NIF', '公司 / 税号') !!}</th>
                <th class="center" style="width: 7%;">{!! $bi('Folhas', '期数') !!}</th>
                <th class="center" style="width: 10%;">{!! $bi('Guia INSS', '社保单') !!}</th>
                <th class="center" style="width: 11%;">{!! $bi('Comp. INSS', '付款凭证') !!}</th>
                <th class="center" style="width: 10%;">{!! $bi('INSS Pago', '社保已缴') !!}</th>
                <th class="center" style="width: 10%;">{!! $bi('PDF Recibos', '工资单') !!}</th>
                <th class="center" style="width: 10%;">{!! $bi('Folha Sal.', '工资表') !!}</th>
                <th class="center" style="width: 11%;">{!! $bi('Sit. Resumo', '汇总状态') !!}</th>
                <th class="center" style="width: 7%;">{!! $bi('Docs', '文件') !!}</th>
            </tr>
        </thead>
        <tbody>
            @foreach($companies as $c)
                @php($comp = $c['compliance'])
                <tr>
                    <td>
                        <strong>{{ $c['name'] }}</strong>
                        @if($c['tax_id'])<div style="font-size:6.3px;color:#64748b;">NIF: {{ $c['tax_id'] }}</div>@endif
                    </td>
                    <td class="center">{{ $c['periods_count'] }}</td>
                    @if(! $c['has_approved_payroll'])
                        <td class="center" colspan="7"><span class="badge b-na">{!! $bi('Sem folha aprovada no período', '所选期间无已批工资表') !!}</span></td>
                    @else
                        <td class="center"><span class="badge {{ $comp['inss_guide_sent'] ? 'b-ok' : 'b-no' }}">{{ $comp['inss_guide_sent'] ? 'SIM' : 'NÃO' }}</span></td>
                        <td class="center"><span class="badge {{ $comp['inss_payment_proof_sent'] ? 'b-ok' : 'b-no' }}">{{ $comp['inss_payment_proof_sent'] ? 'SIM' : 'NÃO' }}</span></td>
                        <td class="center"><span class="badge {{ $comp['inss_paid'] ? 'b-ok' : 'b-no' }}">{{ $comp['inss_paid'] ? 'PAGO' : 'NÃO' }}</span></td>
                        <td class="center"><span class="badge {{ $comp['payslips_summary_sent'] ? 'b-ok' : 'b-no' }}">{{ $comp['payslips_summary_sent'] ? 'SIM' : 'NÃO' }}</span></td>
                        <td class="center"><span class="badge {{ $comp['payroll_sheet_sent'] ? 'b-ok' : 'b-no' }}">{{ $comp['payroll_sheet_sent'] ? 'SIM' : 'NÃO' }}</span></td>
                        <td class="center"><span class="badge {{ $comp['is_summary_complete'] ? 'b-ok' : 'b-no' }}">{{ $comp['is_summary_complete'] ? 'CONCLUÍDO' : 'PENDENTE' }}</span></td>
                        <td class="center">{{ $c['documents_count'] }}</td>
                    @endif
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="section-title">{!! $bi('2. RESUMO FINANCEIRO POR EMPRESA', '2. 各公司财务汇总') !!}</div>
    <table class="data-table">
        <thead>
            <tr>
                <th style="width: 24%;">{!! $bi('Empresa', '公司') !!}</th>
                <th class="center" style="width: 6%;">{!! $bi('Func.', '人数') !!}</th>
                <th class="num" style="width: 11%;">{!! $bi('Salário Bruto', '应发工资') !!}</th>
                <th class="num" style="width: 9.5%;">{!! $bi('INSS Trab.', '员工社保') !!}</th>
                <th class="num" style="width: 9.5%;">{!! $bi('INSS Emp.', '企业社保') !!}</th>
                <th class="num" style="width: 10%;">{!! $bi('Total INSS', '社保合计') !!}</th>
                <th class="num" style="width: 9.5%;">{!! $bi('IRT Retido', '个税') !!}</th>
                <th class="num" style="width: 10%;">{!! $bi('Salário Líquido', '实发工资') !!}</th>
                <th class="num" style="width: 10.5%;">{!! $bi('Custo Emp.', '用工总成本') !!}</th>
            </tr>
        </thead>
        <tbody>
            @foreach($companies as $c)
                <tr>
                    <td><strong>{{ $c['name'] }}</strong> <span style="color:#64748b;">({{ $c['currency'] }})</span></td>
                    <td class="center">{{ $c['employees_count'] }}</td>
                    <td class="num">{{ $fmt($c['total_gross']) }}</td>
                    <td class="num">{{ $fmt($c['total_inss_employee']) }}</td>
                    <td class="num">{{ $fmt($c['total_inss_employer']) }}</td>
                    <td class="num">{{ $fmt($c['total_inss']) }}</td>
                    <td class="num">{{ $fmt($c['total_irt']) }}</td>
                    <td class="num"><strong>{{ $fmt($c['total_net']) }}</strong></td>
                    <td class="num">{{ $fmt($c['total_employer_cost']) }}</td>
                </tr>
            @endforeach
            <tr class="totals-row">
                <td>{!! $bi('TOTAIS GERAIS', '总计') !!}</td>
                <td class="center">{{ $totals['employees_count'] }}</td>
                <td class="num">{{ $fmt($totals['total_gross']) }}</td>
                <td class="num">{{ $fmt($totals['total_inss_employee']) }}</td>
                <td class="num">{{ $fmt($totals['total_inss_employer']) }}</td>
                <td class="num">{{ $fmt($totals['total_inss']) }}</td>
                <td class="num">{{ $fmt($totals['total_irt']) }}</td>
                <td class="num">{{ $fmt($totals['total_net']) }}</td>
                <td class="num">{{ $fmt($totals['total_employer_cost']) }}</td>
            </tr>
        </tbody>
    </table>

    @if(count($monthlyTimeline) > 1 || ($range['periodicity'] !== 'monthly' && count($periodRows) > 0))
        <div class="section-title">{!! $bi('3. EVOLUÇÃO MENSAL E DETALHE DE PERÍODOS', '3. 月度趋势及期间明细') !!}</div>
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 18%;">{!! $bi('Empresa', '公司') !!}</th>
                    <th style="width: 16%;">{!! $bi('Período', '期间') !!}</th>
                    <th class="center" style="width: 7%;">{!! $bi('Func.', '人数') !!}</th>
                    <th class="num" style="width: 12%;">{!! $bi('Bruto', '应发') !!}</th>
                    <th class="num" style="width: 11%;">{!! $bi('Total INSS', '社保') !!}</th>
                    <th class="num" style="width: 11%;">{!! $bi('IRT', '个税') !!}</th>
                    <th class="num" style="width: 12%;">{!! $bi('Líquido', '实发') !!}</th>
                    <th class="center" style="width: 6.5%;">{!! $bi('INSS', '已缴') !!}</th>
                    <th class="center" style="width: 6.5%;">{!! $bi('Resumo', '完成') !!}</th>
                </tr>
            </thead>
            <tbody>
                @foreach($periodRows as $pr)
                    <tr>
                        <td>{{ $pr['tenant_name'] }}</td>
                        <td>{{ $pr['period_name'] }}</td>
                        <td class="center">{{ $pr['employees_count'] }}</td>
                        <td class="num">{{ $fmt($pr['total_gross']) }}</td>
                        <td class="num">{{ $fmt($pr['total_inss']) }}</td>
                        <td class="num">{{ $fmt($pr['total_irt']) }}</td>
                        <td class="num">{{ $fmt($pr['total_net']) }}</td>
                        <td class="center"><span class="badge {{ $pr['inss_paid'] ? 'b-ok' : 'b-no' }}">{{ $pr['inss_paid'] ? 'PAGO' : 'NÃO' }}</span></td>
                        <td class="center"><span class="badge {{ $pr['is_summary_complete'] ? 'b-ok' : 'b-no' }}">{{ $pr['is_summary_complete'] ? 'SIM' : 'NÃO' }}</span></td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    @if(! empty($skippedCompanies))
        <div class="section-title">{!! $bi('EMPRESAS EXCLUÍDAS DO LOTE DE DOSSIÊS', '未生成完整档案的公司') !!}</div>
        <table class="data-table">
            <thead>
                <tr>
                    <th style="width: 32%;">{!! $bi('Empresa', '公司') !!}</th>
                    <th style="width: 68%;">{!! $bi('Motivo', '原因') !!}</th>
                </tr>
            </thead>
            <tbody>
                @foreach($skippedCompanies as $sk)
                    <tr>
                        <td><strong>{{ $sk['tenant_name'] }}</strong></td>
                        <td>{{ $sk['reason'] }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif

    <table class="signatures">
        <tr>
            <td>
                <div class="sig-space"></div>
                <div class="sig-role">{!! $bi('Recursos Humanos (RH)', '人力资源部') !!}</div>
                <div class="sig-sub">{{ $operatorName }}</div>
            </td>
            <td>
                <div class="sig-space"></div>
                <div class="sig-role">{!! $bi('Administração / Entidade Empregadora', '管理层 / 雇主') !!}</div>
                <div class="sig-sub">{{ $scopeLabel }}</div>
            </td>
        </tr>
    </table>
</body>
</html>
