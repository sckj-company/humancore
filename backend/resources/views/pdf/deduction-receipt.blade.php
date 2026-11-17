<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Comprovativo - {{ $deduction->name }}</title>
    @php
        $tenant = $deduction->tenant;
        $employee = $deduction->employee;
        $currency = $tenant->currency ?? 'AOA';
        $totalAmount = (float) ($deduction->total_amount ?? $deduction->amount ?? 0);
        $paidAmount = (float) ($deduction->paid_amount ?? 0);
        $remainingAmount = max(0, $totalAmount - $paidAmount);
        $requestedDate = ($deduction->requested_at ?? $deduction->created_at)?->format('d/m/Y H:i') ?? now()->format('d/m/Y H:i');
        $installments = $deduction->installments ?? collect();
        $visibleInstallments = $installments->take(12);
        $hiddenInstallmentsCount = max(0, $installments->count() - $visibleInstallments->count());
        $documentCode = sprintf('COMP-%s-%05d', strtoupper(substr($deduction->deduction_type, 0, 3)), $deduction->id);
        $titleLabel = match ($deduction->deduction_type) {
            'advance' => 'COMPROVATIVO DE ADIANTAMENTO SALARIAL / VALE',
            'loan' => 'COMPROVATIVO DE EMPRÉSTIMO INTERNO',
            'pension' => 'COMPROVATIVO DE DESCONTO — PENSÃO ALIMENTÍCIA',
            default => 'COMPROVATIVO DE DESCONTO / VALE',
        };
    @endphp
    <style>
        @page { size: A4 portrait; margin: 11mm 13mm; }
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
            font-size: 9.5px;
            line-height: 1.32;
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
            padding-bottom: 7px;
            margin-bottom: 9px;
        }
        .company-name { font-size: 13px; font-weight: bold; color: #0f172a; }
        .company-meta { font-size: 8px; color: #475569; margin-top: 2px; }
        .doc-title { font-size: 11.5px; font-weight: bold; color: #1d4ed8; text-align: right; }
        .doc-code { font-size: 8.5px; color: #475569; text-align: right; margin-top: 2px; }

        .section-title {
            font-size: 8.5px;
            font-weight: bold;
            text-transform: uppercase;
            color: #1e3a8a;
            background: #eff6ff;
            border-left: 3px solid #2563eb;
            padding: 3.5px 7px;
            margin: 8px 0 5px;
        }
        .info-grid td {
            padding: 3.5px 6px;
            border: 1px solid #e2e8f0;
            font-size: 9px;
            vertical-align: top;
        }
        .info-label {
            display: block;
            font-size: 7.5px;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 1px;
        }
        .info-value {
            font-weight: bold;
            color: #0f172a;
        }

        .summary-boxes {
            margin: 7px 0;
        }
        .summary-boxes td {
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            padding: 5px 7px;
            width: 25%;
        }
        .summary-amount {
            font-size: 10.5px;
            font-weight: bold;
            color: #0f172a;
        }

        .installments-table th {
            background: #f1f5f9;
            color: #334155;
            font-size: 8px;
            text-transform: uppercase;
            text-align: left;
            padding: 4px 6px;
            border: 1px solid #cbd5e1;
        }
        .installments-table td {
            padding: 3.2px 6px;
            border: 1px solid #e2e8f0;
            font-size: 8.5px;
        }
        .num { text-align: right; }
        .center { text-align: center; }

        .declaration {
            margin-top: 8px;
            padding: 6px 8px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            font-size: 8.5px;
            color: #334155;
            line-height: 1.38;
        }

        .signatures {
            margin-top: 16px;
            page-break-inside: avoid;
        }
        .signatures td {
            width: 33.33%;
            padding: 0 8px;
            text-align: center;
            vertical-align: bottom;
        }
        .sig-space {
            height: 28px;
            border-bottom: 1px solid #334155;
            margin-bottom: 4px;
        }
        .sig-role {
            font-size: 8.5px;
            font-weight: bold;
            color: #0f172a;
        }
        .sig-sub {
            font-size: 7.5px;
            color: #64748b;
        }

        .footer-note {
            margin-top: 9px;
            border-top: 1px solid #e2e8f0;
            padding-top: 4px;
            font-size: 7.5px;
            color: #64748b;
        }
    </style>
</head>
<body>
    <div class="sheet">
        <div class="header-bar">
            <table>
                <tr>
                    <td style="width: 55%;">
                        <div class="company-name">{{ $tenant?->name ?? 'Empresa' }}</div>
                        <div class="company-meta">
                            @if($tenant?->tax_id) NIF: {{ $tenant->tax_id }} · @endif
                            {{ $tenant?->address ?? 'Angola' }}
                        </div>
                    </td>
                    <td style="width: 45%;">
                        <div class="doc-title">{{ $titleLabel }}</div>
                        <div class="doc-code">Ref.: {{ $documentCode }} · Pedido: {{ $requestedDate }}</div>
                    </td>
                </tr>
            </table>
        </div>

        <div class="section-title">1. Identificação do Trabalhador</div>
        <table class="info-grid">
            <tr>
                <td style="width: 46%;">
                    <span class="info-label">Nome Completo</span>
                    <span class="info-value">{{ $employee?->full_name ?? '—' }}</span>
                </td>
                <td style="width: 22%;">
                    <span class="info-label">Código</span>
                    <span class="info-value">{{ $employee?->employee_code ?? '—' }}</span>
                </td>
                <td style="width: 32%;">
                    <span class="info-label">BI / Identificação</span>
                    <span class="info-value">{{ $employee?->national_id ?? $employee?->tax_id ?? '—' }}</span>
                </td>
            </tr>
            <tr>
                <td>
                    <span class="info-label">Departamento</span>
                    <span class="info-value">{{ $employee?->department?->name ?? '—' }}</span>
                </td>
                <td>
                    <span class="info-label">Cargo / Função</span>
                    <span class="info-value">{{ $employee?->position?->title ?? '—' }}</span>
                </td>
                <td>
                    <span class="info-label">Estado Atual</span>
                    <span class="info-value">{{ $deduction->status_label }}</span>
                </td>
            </tr>
        </table>

        <div class="section-title">2. Detalhes da Operação</div>
        <table class="info-grid">
            <tr>
                <td style="width: 46%;">
                    <span class="info-label">Descrição / Finalidade</span>
                    <span class="info-value">{{ $deduction->name }}</span>
                </td>
                <td style="width: 27%;">
                    <span class="info-label">Tipo</span>
                    <span class="info-value">{{ $deduction->type_label }}</span>
                </td>
                <td style="width: 27%;">
                    <span class="info-label">Data de Registo / Pedido</span>
                    <span class="info-value">{{ $requestedDate }}</span>
                </td>
            </tr>
            @if($deduction->legal_basis || $deduction->notes)
            <tr>
                <td colspan="3">
                    <span class="info-label">Observações / Fundamento</span>
                    <span>{{ \Illuminate\Support\Str::limit(trim(($deduction->legal_basis ? $deduction->legal_basis.' · ' : '').($deduction->notes ?? '')), 180) }}</span>
                </td>
            </tr>
            @endif
        </table>

        <table class="summary-boxes">
            <tr>
                <td>
                    <span class="info-label">Valor Total</span>
                    <div class="summary-amount">
                        @if($deduction->amount_type === 'percentage' && ! $deduction->total_amount)
                            {{ number_format((float) $deduction->percentage, 2, ',', '.') }}%
                        @else
                            {{ number_format($totalAmount, 2, ',', '.') }} {{ $currency }}
                        @endif
                    </div>
                </td>
                <td>
                    <span class="info-label">Parcelas</span>
                    <div class="summary-amount">
                        {{ $installments->count() > 0 ? $installments->count().'x' : ($deduction->installment_count ? $deduction->installment_count.'x' : 'Única / Recorrente') }}
                    </div>
                </td>
                <td>
                    <span class="info-label">Já Descontado / Pago</span>
                    <div class="summary-amount">{{ number_format($paidAmount, 2, ',', '.') }} {{ $currency }}</div>
                </td>
                <td>
                    <span class="info-label">Saldo Por Descontar</span>
                    <div class="summary-amount">{{ number_format($remainingAmount, 2, ',', '.') }} {{ $currency }}</div>
                </td>
            </tr>
        </table>

        <div class="section-title">3. Plano de Amortização / Parcelas</div>
        @if($visibleInstallments->isNotEmpty())
            <table class="installments-table">
                <thead>
                    <tr>
                        <th style="width: 10%;" class="center">#</th>
                        <th style="width: 22%;">Mês de Desconto</th>
                        <th style="width: 18%;" class="num">Percentagem</th>
                        <th style="width: 26%;" class="num">Valor ({{ $currency }})</th>
                        <th style="width: 24%;" class="center">Estado</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($visibleInstallments as $item)
                        <tr>
                            <td class="center">{{ $item->installment_number }}</td>
                            <td>{{ $item->reference_month }}</td>
                            <td class="num">{{ number_format((float) $item->percentage, 2, ',', '.') }}%</td>
                            <td class="num">{{ number_format((float) $item->amount, 2, ',', '.') }}</td>
                            <td class="center">{{ \App\Models\DeductionInstallment::STATUSES[$item->status] ?? $item->status }}</td>
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
                        </td>
                    </tr>
                </tbody>
            </table>
        @endif

        <div class="declaration">
            <strong>Declaração e Autorização de Desconto:</strong>
            Eu, <strong>{{ $employee?->full_name ?? '____________________' }}</strong>, declaro ter recebido / tomado conhecimento do valor e das condições acima descritos e autorizo expressamente a entidade empregadora a proceder ao respetivo desconto em folha salarial, nos meses e percentagens discriminados no plano de amortização, nos termos da legislação laboral aplicável.
        </div>

        <table class="signatures">
            <tr>
                <td>
                    <div class="sig-space"></div>
                    <div class="sig-role">O Trabalhador</div>
                    <div class="sig-sub">{{ $employee?->full_name ?? '' }} · Data: ___/___/_____</div>
                </td>
                <td>
                    <div class="sig-space"></div>
                    <div class="sig-role">Recursos Humanos</div>
                    <div class="sig-sub">{{ $operatorName }} · Data: ___/___/_____</div>
                </td>
                <td>
                    <div class="sig-space"></div>
                    <div class="sig-role">Direção / Aprovação</div>
                    <div class="sig-sub">{{ $deduction->approver?->name ?? 'Responsável' }} · Data: ___/___/_____</div>
                </td>
            </tr>
        </table>

        <div class="footer-note">
            Emitido por {{ $operatorName }} em {{ now()->format('d/m/Y H:i') }} · {{ config('app.name', 'HumanCore') }} · Documento válido após assinatura e carregamento no sistema.
        </div>
    </div>
</body>
</html>
