<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Termo de Rescisão e Quitação de Contrato de Trabalho</title>
    <style>
        @if(!empty($cjkFontPath))
        @font-face {
            font-family: 'Droid Sans Fallback';
            font-style: normal;
            font-weight: normal;
            src: url('file://{{ $cjkFontPath }}') format('truetype');
        }
        @font-face {
            font-family: 'Droid Sans Fallback';
            font-style: normal;
            font-weight: bold;
            src: url('file://{{ $cjkFontPath }}') format('truetype');
        }
        @endif
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'DejaVu Sans', 'Droid Sans Fallback', sans-serif;
            font-size: 10px;
            color: #1e293b;
            line-height: 1.45;
            padding: 24px 28px;
        }
        .header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 14px;
        }
        .company-name {
            font-size: 15px;
            font-weight: bold;
            color: #0f172a;
        }
        .doc-title {
            font-size: 13px;
            font-weight: bold;
            text-transform: uppercase;
            color: #1e293b;
            margin-top: 6px;
        }
        .doc-subtitle {
            font-size: 9px;
            color: #475569;
            margin-top: 2px;
        }
        .section {
            margin-bottom: 12px;
        }
        .section-title {
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
            background: #f1f5f9;
            border-left: 3px solid #0f172a;
            padding: 4px 8px;
            margin-bottom: 6px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            border: 1px solid #cbd5e1;
            padding: 5px 7px;
            text-align: left;
            vertical-align: top;
        }
        th {
            background: #f8fafc;
            font-weight: bold;
            font-size: 9px;
            text-transform: uppercase;
            color: #334155;
        }
        .text-right { text-align: right; }
        .font-mono { font-family: 'DejaVu Sans Mono', 'DejaVu Sans', 'Droid Sans Fallback', monospace; }
        .totals-box {
            margin-top: 10px;
            border: 1.5px solid #0f172a;
            background: #f8fafc;
            padding: 8px 10px;
        }
        .notes-list {
            margin-left: 16px;
            font-size: 9px;
            color: #334155;
        }
        .notes-list li {
            margin-bottom: 3px;
        }
        .signatures {
            margin-top: 26px;
            width: 100%;
        }
        .signatures td {
            border: none;
            width: 50%;
            text-align: center;
            padding-top: 28px;
        }
        .sig-line {
            border-top: 1px solid #334155;
            width: 80%;
            margin: 0 auto 4px auto;
            padding-top: 4px;
            font-size: 9px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    @php
        $currency = $tenant?->currency ?? 'AOA';
        $fmt = fn($val) => number_format((float) $val, 2, ',', '.') . ' ' . $currency;
    @endphp

    <div class="header">
        <div class="company-name">{{ $tenant?->name ?? 'Empresa' }}</div>
        <div style="font-size: 9px; color: #475569;">
            @if($tenant?->tax_id) NIF: {{ $tenant->tax_id }} @endif
            @if($tenant?->inss_number) · INSS: {{ $tenant->inss_number }} @endif
            @if($tenant?->address) · {{ $tenant->address }} @endif
        </div>
        <div class="doc-title">Termo de Rescisão de Contrato de Trabalho e Quitação Final</div>
        <div class="doc-subtitle">{{ $settlement['legal_basis'] ?? 'Lei Geral do Trabalho (LGT Angola)' }}</div>
    </div>

    <div class="section">
        <div class="section-title">1. Identificação do Trabalhador e Vínculo Contratual</div>
        <table>
            <tr>
                <th style="width: 22%;">Trabalhador</th>
                <td style="width: 33%;"><strong>{{ $settlement['employee_name'] ?? $employee?->full_name }}</strong> ({{ $settlement['employee_code'] ?? $employee?->employee_code }})</td>
                <th style="width: 20%;">Departamento / Cargo</th>
                <td style="width: 25%;">{{ $settlement['department'] ?? '—' }} / {{ $settlement['position'] ?? '—' }}</td>
            </tr>
            <tr>
                <th>Data de Admissão</th>
                <td>{{ $settlement['hire_date'] ?? '—' }}</td>
                <th>Data de Cessação</th>
                <td><strong>{{ $settlement['termination_date'] ?? '—' }}</strong></td>
            </tr>
            <tr>
                <th>Antiguidade</th>
                <td>{{ $settlement['tenure']['years'] ?? 0 }} anos ({{ $settlement['tenure']['months'] ?? 0 }} meses / {{ $settlement['tenure']['days'] ?? 0 }} dias)</td>
                <th>Salário Base Mensal</th>
                <td class="font-mono">{{ $fmt($settlement['base_salary'] ?? 0) }}</td>
            </tr>
            <tr>
                <th>Modalidade da Rescisão</th>
                <td colspan="3"><strong>{{ $settlement['termination_type_label'] ?? $settlement['termination_type'] }}</strong></td>
            </tr>
            @if(!empty($settlement['termination_reason']))
            <tr>
                <th>Motivo / Fundamentação</th>
                <td colspan="3">{{ $settlement['termination_reason'] }}</td>
            </tr>
            @endif
        </table>
    </div>

    <div class="section">
        <div class="section-title">2. Discriminação de Proveitos e Direitos Legais (Créditos)</div>
        <table>
            <thead>
                <tr>
                    <th>Rubrica / Direito Legal</th>
                    <th class="text-right" style="width: 16%;">Qtd. / Ref.</th>
                    <th class="text-right" style="width: 20%;">Valor Unitário</th>
                    <th class="text-right" style="width: 22%;">Total ({{ $currency }})</th>
                </tr>
            </thead>
            <tbody>
                @foreach(($settlement['earnings_breakdown'] ?? []) as $item)
                <tr>
                    <td>{{ $item['name'] }}</td>
                    <td class="text-right font-mono">{{ $item['quantity'] !== null ? $item['quantity'] : '—' }}</td>
                    <td class="text-right font-mono">{{ !empty($item['unit_rate']) ? $fmt($item['unit_rate']) : '—' }}</td>
                    <td class="text-right font-mono"><strong>{{ $fmt($item['amount'] ?? 0) }}</strong></td>
                </tr>
                @endforeach
                <tr style="background: #f1f5f9;">
                    <td colspan="3"><strong>TOTAL BRUTO DE PROVEITOS DA RESCISÃO</strong></td>
                    <td class="text-right font-mono"><strong>{{ $fmt($settlement['totals']['gross_settlement'] ?? 0) }}</strong></td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-title">3. Descontos Legais, Adiantamentos, Activos e Pendências (Débitos)</div>
        <table>
            <thead>
                <tr>
                    <th>Descrição do Desconto / Pendência</th>
                    <th style="width: 24%;">Categoria</th>
                    <th class="text-right" style="width: 22%;">Valor Descontado ({{ $currency }})</th>
                </tr>
            </thead>
            <tbody>
                @forelse(($settlement['deductions_breakdown'] ?? []) as $ded)
                <tr>
                    <td>{{ $ded['name'] }}</td>
                    <td>
                        @switch($ded['category'] ?? '')
                            @case('tax') Imposto / Segurança Social @break
                            @case('advance_or_loan') Adiantamento / Empréstimo @break
                            @case('asset_liability') Activo / Equipamento Pendente @break
                            @case('attendance') Faltas / Assiduidade @break
                            @case('notice') Aviso Prévio @break
                            @default Desconto Adicional
                        @endswitch
                    </td>
                    <td class="text-right font-mono">- {{ $fmt($ded['amount'] ?? 0) }}</td>
                </tr>
                @empty
                <tr>
                    <td colspan="3" style="text-align: center; color: #64748b;">Sem descontos ou pendências a abater.</td>
                </tr>
                @endforelse
                <tr style="background: #fef2f2;">
                    <td colspan="2"><strong>TOTAL DE DESCONTOS E PENDÊNCIAS ABATIDAS</strong></td>
                    <td class="text-right font-mono"><strong>- {{ $fmt($settlement['totals']['total_deductions'] ?? 0) }}</strong></td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="totals-box">
        <table>
            <tr>
                <td style="border: none; font-size: 11px;"><strong>VALOR LÍQUIDO FINAL A PAGAR AO TRABALHADOR:</strong></td>
                <td style="border: none; font-size: 13px;" class="text-right font-mono">
                    <strong>{{ $fmt($settlement['totals']['net_settlement'] ?? 0) }}</strong>
                </td>
            </tr>
            @if(($settlement['totals']['remaining_employee_debt'] ?? 0) > 0)
            <tr>
                <td style="border: none; color: #b91c1c; font-size: 10px;">
                    <strong>SALDO DEVEDOR REMANESCENTE DO EX-FUNCIONÁRIO À EMPRESA:</strong>
                </td>
                <td style="border: none; color: #b91c1c; font-size: 11px;" class="text-right font-mono">
                    <strong>{{ $fmt($settlement['totals']['remaining_employee_debt']) }}</strong>
                </td>
            </tr>
            @endif
        </table>
    </div>

    @if(!empty($settlement['legal_notes']))
    <div class="section" style="margin-top: 12px;">
        <div class="section-title">4. Enquadramento e Observações Legais</div>
        <ul class="notes-list">
            @foreach($settlement['legal_notes'] as $note)
                <li>{{ $note }}</li>
            @endforeach
        </ul>
    </div>
    @endif

    <table class="signatures">
        <tr>
            <td>
                <div class="sig-line">Pela Entidade Empregadora ({{ $tenant?->name ?? 'Empresa' }})</div>
                <div style="font-size: 8px; color: #64748b;">Data: ____/____/________</div>
            </td>
            <td>
                <div class="sig-line">O Trabalhador ({{ $settlement['employee_name'] ?? $employee?->full_name }})</div>
                <div style="font-size: 8px; color: #64748b;">Declaro ter recebido o valor líquido acima discriminado para plena quitação.</div>
            </td>
        </tr>
    </table>
</body>
</html>
