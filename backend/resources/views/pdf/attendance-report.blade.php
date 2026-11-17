<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>{{ $report['period']['label'] }}</title>
    @php
        $tenant = $report['tenant'] ?? null;
        $period = $report['period'];
        $filters = $report['filters'];
        $totals = $report['totals'];
        $employees = $report['employees'];
        $entries = $report['entries'];
        $periodTypeLabel = match ($period['type']) {
            'daily' => 'Diário',
            'weekly' => 'Semanal',
            'monthly' => 'Mensal',
            default => 'Personalizado',
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
        .report-sub { font-size: 8px; color: #475569; text-align: right; margin-top: 2px; }

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
                <div class="report-title">RELATÓRIO DE PRESENÇAS ({{ strtoupper($periodTypeLabel) }})</div>
                <div class="report-sub">
                    Período: {{ \Carbon\Carbon::parse($period['start_date'])->format('d/m/Y') }}
                    @if($period['start_date'] !== $period['end_date'])
                        a {{ \Carbon\Carbon::parse($period['end_date'])->format('d/m/Y') }}
                    @endif
                    ({{ $period['days_count'] }} dia(s))
                </div>
            </td>
        </tr>
    </table>

    <div class="filters-bar">
        <strong>Filtros aplicados:</strong>
        Modalidade: <strong>{{ $periodTypeLabel }}</strong>
        @if(! empty($filters['employee_name'])) · Funcionário: <strong>{{ $filters['employee_name'] }}</strong> @else · Âmbito: <strong>Todos os funcionários filtrados ({{ $totals['employees_count'] }})</strong> @endif
        @if(! empty($filters['department_name'])) · Departamento: <strong>{{ $filters['department_name'] }}</strong> @endif
        @if(! empty($filters['employee_status']) && $filters['employee_status'] !== 'all') · Estado do Funcionário: <strong>{{ $filters['employee_status'] }}</strong> @endif
        @if(! empty($filters['attendance_status']) && $filters['attendance_status'] !== 'all') · Estado de Presença: <strong>{{ \App\Services\Attendance\AttendanceReportService::STATUS_LABELS[$filters['attendance_status']] ?? $filters['attendance_status'] }}</strong> @endif
        @if(! empty($filters['search'])) · Pesquisa: <strong>"{{ $filters['search'] }}"</strong> @endif
    </div>

    <table class="kpi-row">
        <tr>
            <td><span class="kpi-label">Funcionários</span><span class="kpi-val">{{ $totals['employees_count'] }}</span></td>
            <td><span class="kpi-label">Presenças</span><span class="kpi-val" style="color:#166534;">{{ $totals['present_count'] }}</span></td>
            <td><span class="kpi-label">Atrasos</span><span class="kpi-val" style="color:#b45309;">{{ $totals['late_count'] }} ({{ $totals['total_late_minutes'] }} min)</span></td>
            <td><span class="kpi-label">Faltas</span><span class="kpi-val" style="color:#b91c1c;">{{ $totals['absent_count'] }}</span></td>
            <td><span class="kpi-label">Ausências / Férias</span><span class="kpi-val" style="color:#1d4ed8;">{{ $totals['on_leave_count'] }}</span></td>
            <td><span class="kpi-label">Horas Trabalhadas</span><span class="kpi-val">{{ number_format($totals['total_worked_hours'], 2, ',', '.') }} h</span></td>
            <td><span class="kpi-label">Horas Extras</span><span class="kpi-val">{{ number_format($totals['total_overtime_hours'], 2, ',', '.') }} h</span></td>
            <td><span class="kpi-label">Assiduidade</span><span class="kpi-val">{{ number_format($totals['attendance_rate'], 1, ',', '.') }}%</span></td>
        </tr>
    </table>

    <div class="section-title">1. Resumo Consolidado por Funcionário</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>Código</th>
                <th>Nome do Funcionário</th>
                <th>Departamento</th>
                <th>Cargo</th>
                <th class="center">Presente</th>
                <th class="center">Atrasos</th>
                <th class="center">Faltas</th>
                <th class="center">Férias/Aus.</th>
                <th class="num">Min. Atraso</th>
                <th class="num">Horas Trab.</th>
                <th class="num">H. Extras</th>
                <th class="num">Assiduidade</th>
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
                    <td colspan="12" class="center">Nenhum funcionário encontrado para os filtros aplicados.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <div class="section-title">2. Registos Diários Detalhados ({{ count($entries) }} registo(s))</div>
    <table class="data-table">
        <thead>
            <tr>
                <th>Data</th>
                @if(! $isSingleEmployee)
                    <th>Código</th>
                    <th>Funcionário</th>
                    <th>Departamento</th>
                @endif
                <th>Turno</th>
                <th class="center">Entrada</th>
                <th class="center">Saída</th>
                <th class="num">Horas</th>
                <th class="num">Atraso (min)</th>
                <th class="num">Extras (h)</th>
                <th class="center">Estado</th>
                <th>Observações</th>
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
                        <span class="badge st-{{ $entry['status'] }}">{{ $entry['status_label'] }}</span>
                    </td>
                    <td>{{ $entry['notes'] ?? '—' }}</td>
                </tr>
            @empty
                <tr>
                    <td colspan="{{ $isSingleEmployee ? 9 : 12 }}" class="center">Sem marcações de presença registadas neste período.</td>
                </tr>
            @endforelse
        </tbody>
    </table>

    <div class="footer">
        Gerado por {{ $operatorName }} em {{ now()->format('d/m/Y H:i') }} · {{ config('app.name', 'HumanCore') }}
    </div>
</body>
</html>
