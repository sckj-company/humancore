<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>{{ $report['period']['label'] }}</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bi = static fn (string $pt, string $zh): string => $isBilingual
            ? e($pt).' <span class="zh-inline">/ '.e($zh).'</span>'
            : e($pt);
        $biBlock = static fn (string $pt, string $zh): string => $isBilingual
            ? '<span class="pt">'.e($pt).'</span><span class="zh-sub">'.e($zh).'</span>'
            : '<span class="pt">'.e($pt).'</span>';
        $tenant = $report['tenant'] ?? null;
        $period = $report['period'];
        $filters = $report['filters'];
        $totals = $report['totals'];
        $employees = $report['employees'];
        $entries = $report['entries'];
        [$periodTypePt, $periodTypeZh] = match ($period['type']) {
            'daily' => ['Diário', '日报'],
            'weekly' => ['Semanal', '周报'],
            'monthly' => ['Mensal', '月报'],
            default => ['Personalizado', '自定义'],
        };
        $statusZh = static fn (string $status): string => match ($status) {
            'present' => '出勤',
            'late' => '迟到',
            'absent' => '缺勤',
            'on_leave' => '请假/休假',
            'half_day' => '半天',
            default => $status,
        };
    @endphp
    <style>
        @page { size: A4 {{ $isSingleEmployee ? 'portrait' : 'landscape' }}; margin: 10mm 11mm; }
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
            font-size: 8.5px;
            line-height: 1.35;
            color: #1e293b;
            margin: 0;
        }
        table { width: 100%; border-collapse: collapse; }
        .header {
            border-bottom: 2px solid #1d4ed8;
            padding-bottom: 6px;
            margin-bottom: 8px;
        }
        .company { font-size: 12px; font-weight: bold; color: #0f172a; }
        .company-sub { font-size: 8px; color: #64748b; }
        .report-title { font-size: 12px; font-weight: bold; color: #1d4ed8; text-align: right; }
        .report-title-zh { font-size: 9.5px; color: #475569; text-align: right; margin-top: 1px; }
        .report-sub { font-size: 8px; color: #475569; text-align: right; margin-top: 2px; }
        .zh-inline { color: #64748b; font-size: 7.5px; font-weight: normal; }
        .pt { display: block; }
        .zh-sub { display: block; color: #94a3b8; font-size: 6.5px; font-weight: normal; margin-top: 1px; }
        .kpi-row .zh-sub { color: #64748b; }

        .filters-bar {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            padding: 5px 8px;
            margin-bottom: 8px;
            font-size: 8px;
            color: #334155;
        }
        .kpi-row { margin-bottom: 9px; }
        .kpi-row td {
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            padding: 5px 7px;
            text-align: center;
        }
        .kpi-label {
            display: block;
            font-size: 7px;
            text-transform: uppercase;
            color: #64748b;
        }
        .kpi-val {
            font-size: 11px;
            font-weight: bold;
            color: #0f172a;
        }

        .section-title {
            font-size: 8.5px;
            font-weight: bold;
            text-transform: uppercase;
            color: #1e3a8a;
            background: #eff6ff;
            border-left: 3px solid #2563eb;
            padding: 3.5px 7px;
            margin: 9px 0 5px;
        }
        .data-table th {
            background: #1e293b;
            color: #ffffff;
            font-size: 7.5px;
            text-transform: uppercase;
            padding: 4.5px 6px;
            border: 1px solid #334155;
            text-align: left;
        }
        .data-table td {
            padding: 4px 6px;
            border: 1px solid #e2e8f0;
            font-size: 8px;
            vertical-align: middle;
        }
        .data-table tr:nth-child(even) td { background: #f8fafc; }
        .num { text-align: right !important; }
        .center { text-align: center !important; }
        .badge {
            display: inline-block;
            padding: 1.5px 5px;
            border-radius: 3px;
            font-size: 7.2px;
            font-weight: bold;
        }
        .st-present { background: #dcfce7; color: #166534; }
        .st-late { background: #fef3c7; color: #92400e; }
        .st-absent { background: #fee2e2; color: #991b1b; }
        .st-on_leave { background: #dbeafe; color: #1e40af; }
        .st-half_day { background: #f1f5f9; color: #334155; }
        .footer {
            margin-top: 10px;
            border-top: 1px solid #cbd5e1;
            padding-top: 4px;
            font-size: 7.5px;
            color: #64748b;
        }
    </style>
</head>
<body>
    <table class="header">
        <tr>
            <td style="width: 55%;">
                <div class="company">{{ $tenant?->name ?? 'Empresa' }}</div>
                <div class="company-sub">
                    @if($tenant?->tax_id) NIF: {{ $tenant->tax_id }} · @endif
                    {{ $tenant?->address ?? 'Angola' }}
                </div>
            </td>
            <td style="width: 45%;">
                <div class="report-title">RELATÓRIO DE PRESENÇAS ({{ strtoupper($periodTypePt) }})</div>
                @if($isBilingual)
                    <div class="report-title-zh">考勤报告（{{ $periodTypeZh }}）</div>
                @endif
                <div class="report-sub">
                    {!! $bi('Período', '期间') !!}: {{ \Carbon\Carbon::parse($period['start_date'])->format('d/m/Y') }}
                    @if($period['start_date'] !== $period['end_date'])
                        a {{ \Carbon\Carbon::parse($period['end_date'])->format('d/m/Y') }}
                    @endif
                    ({{ $period['days_count'] }} {!! $bi('dia(s)', '天') !!})
                </div>
            </td>
        </tr>
    </table>

    <div class="filters-bar">
        <strong>{!! $bi('Filtros aplicados', '筛选条件') !!}:</strong>
        {!! $bi('Modalidade', '类型') !!}: <strong>{{ $periodTypePt }}@if($isBilingual) / {{ $periodTypeZh }}@endif</strong>
        @if(! empty($filters['employee_name']))
            · {!! $bi('Funcionário', '员工') !!}: <strong>{{ $filters['employee_name'] }}</strong>
        @else
            · {!! $bi('Âmbito', '范围') !!}: <strong>{!! $bi('Todos os funcionários filtrados', '全部符合条件员工') !!} ({{ $totals['employees_count'] }})</strong>
        @endif
        @if(! empty($filters['department_name'])) · {!! $bi('Departamento', '部门') !!}: <strong>{{ $filters['department_name'] }}</strong> @endif
        @if(! empty($filters['employee_status']) && $filters['employee_status'] !== 'all') · {!! $bi('Estado do Funcionário', '员工状态') !!}: <strong>{{ $filters['employee_status'] }}</strong> @endif
        @if(! empty($filters['attendance_status']) && $filters['attendance_status'] !== 'all') · {!! $bi('Estado de Presença', '考勤状态') !!}: <strong>{{ \App\Services\Attendance\AttendanceReportService::STATUS_LABELS[$filters['attendance_status']] ?? $filters['attendance_status'] }}</strong> @endif
        @if(! empty($filters['search'])) · {!! $bi('Pesquisa', '搜索') !!}: <strong>"{{ $filters['search'] }}"</strong> @endif
    </div>

    <table class="kpi-row">
        <tr>
            <td><span class="kpi-label">{!! $biBlock('Funcionários', '员工人数') !!}</span><span class="kpi-val">{{ $totals['employees_count'] }}</span></td>
            <td><span class="kpi-label">{!! $biBlock('Presenças', '出勤次数') !!}</span><span class="kpi-val" style="color:#166534;">{{ $totals['present_count'] }}</span></td>
            <td><span class="kpi-label">{!! $biBlock('Atrasos', '迟到次数') !!}</span><span class="kpi-val" style="color:#b45309;">{{ $totals['late_count'] }} ({{ $totals['total_late_minutes'] }} min)</span></td>
            <td><span class="kpi-label">{!! $biBlock('Faltas', '缺勤次数') !!}</span><span class="kpi-val" style="color:#b91c1c;">{{ $totals['absent_count'] }}</span></td>
            <td><span class="kpi-label">{!! $biBlock('Ausências / Férias', '请假 / 休假') !!}</span><span class="kpi-val" style="color:#1d4ed8;">{{ $totals['on_leave_count'] }}</span></td>
            <td><span class="kpi-label">{!! $biBlock('Horas Trabalhadas', '工作总工时') !!}</span><span class="kpi-val">{{ number_format($totals['total_worked_hours'], 2, ',', '.') }} h</span></td>
            <td><span class="kpi-label">{!! $biBlock('Horas Extras', '加班工时') !!}</span><span class="kpi-val">{{ number_format($totals['total_overtime_hours'], 2, ',', '.') }} h</span></td>
            <td><span class="kpi-label">{!! $biBlock('Assiduidade', '出勤率') !!}</span><span class="kpi-val">{{ number_format($totals['attendance_rate'], 1, ',', '.') }}%</span></td>
        </tr>
    </table>

    <div class="section-title">{!! $bi('1. Resumo Consolidado por Funcionário', '1. 员工考勤汇总') !!}</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>{!! $biBlock('Código', '工号') !!}</th>
                <th>{!! $biBlock('Nome do Funcionário', '员工姓名') !!}</th>
                <th>{!! $biBlock('Departamento', '部门') !!}</th>
                <th>{!! $biBlock('Cargo', '职位') !!}</th>
                <th class="center">{!! $biBlock('Presente', '出勤') !!}</th>
                <th class="center">{!! $biBlock('Atrasos', '迟到') !!}</th>
                <th class="center">{!! $biBlock('Faltas', '缺勤') !!}</th>
                <th class="center">{!! $biBlock('Férias/Aus.', '请假') !!}</th>
                <th class="num">{!! $biBlock('Min. Atraso', '迟到(分)') !!}</th>
                <th class="num">{!! $biBlock('Horas Trab.', '工时(小时)') !!}</th>
                <th class="num">{!! $biBlock('H. Extras', '加班(小时)') !!}</th>
                <th class="num">{!! $biBlock('Assiduidade', '出勤率') !!}</th>
            </tr>
        </thead>
        <tbody>
            @forelse($employees as $row)
                <tr>
                    <td>{{ $row['employee_code'] }}</td>
                    <td><strong>{{ $row['full_name'] }}</strong></td>
                    <td>{{ $row['department'] }}</td>
                    <td>{{ $row['position'] }}</td>
                    <td class="center">{{ $row['present_days'] }}</td>
                    <td class="center">{{ $row['late_days'] }}</td>
                    <td class="center">{{ $row['absent_days'] }}</td>
                    <td class="center">{{ $row['leave_days'] }}</td>
                    <td class="num">{{ $row['late_minutes'] }}</td>
                    <td class="num">{{ number_format($row['worked_hours'], 2, ',', '.') }}h</td>
                    <td class="num">{{ number_format($row['overtime_hours'], 2, ',', '.') }}h</td>
                    <td class="num"><strong>{{ number_format($row['attendance_rate'], 1, ',', '.') }}%</strong></td>
                </tr>
            @empty
                <tr>
                    <td colspan="12" class="center">{!! $bi('Nenhum funcionário encontrado para os filtros aplicados.', '未找到符合筛选条件的员工。') !!}</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <div class="section-title">{!! $bi('2. Registos Diários Detalhados', '2. 每日考勤明细') !!} ({{ count($entries) }})</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>{!! $biBlock('Data', '日期') !!}</th>
                @if(! $isSingleEmployee)
                    <th>{!! $biBlock('Código', '工号') !!}</th>
                    <th>{!! $biBlock('Funcionário', '员工') !!}</th>
                    <th>{!! $biBlock('Departamento', '部门') !!}</th>
                @endif
                <th>{!! $biBlock('Turno', '班次') !!}</th>
                <th class="center">{!! $biBlock('Entrada', '上班打卡') !!}</th>
                <th class="center">{!! $biBlock('Saída', '下班打卡') !!}</th>
                <th class="num">{!! $biBlock('Horas', '工时') !!}</th>
                <th class="num">{!! $biBlock('Atraso (min)', '迟到(分)') !!}</th>
                <th class="num">{!! $biBlock('Extras (h)', '加班(小时)') !!}</th>
                <th class="center">{!! $biBlock('Estado', '状态') !!}</th>
                <th>{!! $biBlock('Observações', '备注') !!}</th>
            </tr>
        </thead>
        <tbody>
            @forelse($entries as $entry)
                <tr>
                    <td>{{ $entry['date_formatted'] }}</td>
                    @if(! $isSingleEmployee)
                        <td>{{ $entry['employee_code'] }}</td>
                        <td>{{ $entry['employee_name'] }}</td>
                        <td>{{ $entry['department'] }}</td>
                    @endif
                    <td>{{ $entry['shift_name'] }}</td>
                    <td class="center">{{ $entry['clock_in'] }}</td>
                    <td class="center">{{ $entry['clock_out'] }}</td>
                    <td class="num">{{ number_format($entry['worked_hours'], 2, ',', '.') }}h</td>
                    <td class="num">{{ $entry['late_minutes'] }}</td>
                    <td class="num">{{ number_format($entry['overtime_hours'], 2, ',', '.') }}h</td>
                    <td class="center">
                        <span class="badge st-{{ $entry['status'] }}">
                            {{ $entry['status_label'] }}@if($isBilingual) / {{ $statusZh($entry['status']) }}@endif
                        </span>
                    </td>
                    <td>{{ $entry['notes'] ?? '—' }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="{{ $isSingleEmployee ? 9 : 12 }}" class="center">{!! $bi('Sem marcações de presença registadas neste período.', '该期间暂无考勤打卡记录。') !!}</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <div class="footer">
        {!! $bi('Gerado por', '生成人') !!}: {{ $operatorName }} · {{ now()->format('d/m/Y H:i') }} · {{ config('app.name', 'HumanCore') }}
    </div>
</body>
</html>
