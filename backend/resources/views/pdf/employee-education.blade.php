<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>{{ isset($employee) && $employee ? 'Termo de Educação / 教育警示通知书' : 'Termo de Educação Geral / 全员教育警示通知书' }}</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $isGeneral = ! isset($employee) || $employee === null;
        $bi = static fn (string $pt, string $zh): string => $isBilingual
            ? e($pt).' <span class="zh-inline">/ '.e($zh).'</span>'
            : e($pt);
        $tenant = $tenant ?? ($employee?->tenant ?? $education->tenant);
        $documentCode = sprintf($isGeneral ? 'EDU-GER-%05d' : 'EDU-%05d', $education->id);
        $occurredDate = $education->occurred_on?->format('d/m/Y') ?? $education->created_at?->format('d/m/Y') ?? now()->format('d/m/Y');
        $issuedDate = now()->format('d/m/Y H:i');
    @endphp
    <style>
        @page { size: A4 portrait; margin: 12mm 14mm; }
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
            font-size: 9.5px;
            line-height: 1.38;
            color: #1e293b;
            margin: 0;
            padding: 0;
        }
        table { width: 100%; border-collapse: collapse; }
        .header-bar {
            border-bottom: 2px solid #b45309;
            padding-bottom: 7px;
            margin-bottom: 10px;
        }
        .company-name { font-size: 13px; font-weight: bold; color: #0f172a; }
        .company-meta { font-size: 8px; color: #475569; margin-top: 2px; }
        .doc-title { font-size: 12px; font-weight: bold; color: #b45309; text-align: right; }
        .doc-title-zh { font-size: 10px; font-weight: bold; color: #475569; text-align: right; margin-top: 1px; }
        .doc-code { font-size: 8.2px; color: #475569; text-align: right; margin-top: 2px; }
        .zh-inline { color: #64748b; font-size: 8.2px; font-weight: normal; }

        .section-title {
            font-size: 8.8px;
            font-weight: bold;
            text-transform: uppercase;
            color: #92400e;
            background: #fef3c7;
            border-left: 3px solid #d97706;
            padding: 4px 8px;
            margin: 9px 0 5px;
        }
        .info-grid td {
            padding: 4px 7px;
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

        .reason-box {
            border: 1px solid #cbd5e1;
            background: #ffffff;
            padding: 8px 10px;
            font-size: 9.5px;
            color: #0f172a;
            min-height: 75px;
            line-height: 1.45;
        }
        .warning-box {
            margin-top: 8px;
            padding: 8px 10px;
            background: #fffbeb;
            border: 1px solid #fcd34d;
            font-size: 8.8px;
            color: #451a03;
            line-height: 1.42;
        }
        .warning-zh {
            margin-top: 5px;
            padding-top: 5px;
            border-top: 1px dashed #fde68a;
            color: #78350f;
            font-size: 8.5px;
        }

        .free-signature-box {
            margin-top: 10px;
            border: 1.5px solid #334155;
            background: #ffffff;
            page-break-inside: avoid;
        }
        .free-signature-header {
            background: #f1f5f9;
            border-bottom: 1px solid #cbd5e1;
            padding: 4px 8px;
            font-size: 8px;
            color: #334155;
            font-weight: bold;
        }
        .free-signature-hint {
            font-weight: normal;
            color: #64748b;
            font-size: 7.5px;
            margin-top: 1px;
        }
        .free-signature-area {
            height: 205px;
            padding: 8px;
        }

        .footer-note {
            margin-top: 10px;
            border-top: 1px solid #e2e8f0;
            padding-top: 4px;
            font-size: 7.5px;
            color: #64748b;
        }
    </style>
</head>
<body>
    <div class="header-bar">
        <table>
            <tr>
                <td style="width: 52%;">
                    <div class="company-name">{{ $tenant?->name ?? 'Empresa' }}</div>
                    <div class="company-meta">
                        @if($tenant?->tax_id) NIF: {{ $tenant->tax_id }} · @endif
                        {{ $tenant?->address ?? 'Angola' }}
                    </div>
                </td>
                <td style="width: 48%;">
                    <div class="doc-title">{{ $isGeneral ? 'TERMO DE EDUCAÇÃO GERAL E AVISO' : 'TERMO DE EDUCAÇÃO E AVISO' }}</div>
                    @if($isBilingual)
                        <div class="doc-title-zh">{{ $isGeneral ? '全员通用教育与警示通知书' : '员工教育与警示通知书' }}</div>
                    @endif
                    <div class="doc-code">Ref.: {{ $documentCode }} · {!! $bi('Data da Ocorrência', '事发日期') !!}: {{ $occurredDate }}</div>
                </td>
            </tr>
        </table>
    </div>

    @if($isGeneral)
        <div class="section-title">{!! $bi('1. Âmbito da Educação / Destinatários', '1. 通知范围 / 适用对象') !!}</div>
        <table class="info-grid">
            <tr>
                <td style="width: 52%;">
                    <span class="info-label">{!! $bi('Destinatário', '适用对象') !!}</span>
                    <span class="info-value">{!! $bi('Educação Geral — Todos os Trabalhadores', '全员通用教育 — 全体员工') !!}</span>
                </td>
                <td style="width: 24%;">
                    <span class="info-label">{!! $bi('Data da Ocorrência', '事发日期') !!}</span>
                    <span class="info-value">{{ $occurredDate }}</span>
                </td>
                <td style="width: 24%;">
                    <span class="info-label">{!! $bi('Registado por', '记录人') !!}</span>
                    <span class="info-value">{{ $education->creator?->name ?? $operatorName }}</span>
                </td>
            </tr>
        </table>
    @else
        <div class="section-title">{!! $bi('1. Identificação do Trabalhador', '1. 员工信息') !!}</div>
        <table class="info-grid">
            <tr>
                <td style="width: 46%;">
                    <span class="info-label">{!! $bi('Nome Completo', '姓名') !!}</span>
                    <span class="info-value">{{ $employee->full_name }}</span>
                </td>
                <td style="width: 22%;">
                    <span class="info-label">{!! $bi('Código', '工号') !!}</span>
                    <span class="info-value">{{ $employee->employee_code ?? '—' }}</span>
                </td>
                <td style="width: 32%;">
                    <span class="info-label">{!! $bi('BI / Identificação', '身份证/证件号') !!}</span>
                    <span class="info-value">{{ $employee->id_document_number ?? $employee->tax_id ?? '—' }}</span>
                </td>
            </tr>
            <tr>
                <td>
                    <span class="info-label">{!! $bi('Departamento', '部门') !!}</span>
                    <span class="info-value">{{ $employee->department?->name ?? '—' }}</span>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Cargo / Função', '职位') !!}</span>
                    <span class="info-value">{{ $employee->position?->title ?? '—' }}</span>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Registado por', '记录人') !!}</span>
                    <span class="info-value">{{ $education->creator?->name ?? $operatorName }}</span>
                </td>
            </tr>
        </table>
    @endif

    <div class="section-title">{!! $bi('2. Motivos / Descrição da Situação Ocorrida', '2. 事由及情况说明') !!}</div>
    @if($education->title)
        <table class="info-grid" style="margin-bottom: 5px;">
            <tr>
                <td>
                    <span class="info-label">{!! $bi('Assunto', '主题') !!}</span>
                    <span class="info-value">{{ $education->title }}</span>
                </td>
            </tr>
        </table>
    @endif
    <div class="reason-box">
        {!! nl2br(e($education->reason)) !!}
    </div>

    <div class="section-title">{!! $bi('3. Aviso de Responsabilidade e Sanção em Caso de Reincidência', '3. 警示说明及再犯处理') !!}</div>
    <div class="warning-box">
        <div>
            <strong>{!! $bi('Aviso Formal:', '正式警示：') !!}</strong>
            @if($isGeneral)
                O presente termo constitui um registo oficial de educação geral e consciencialização dirigido a todos os colaboradores relativamente à situação acima descrita. Todos os signatários tomam ciência de que, caso esta situação volte a acontecer, quem a praticar ou executar ficará sujeito à aplicação das sanções disciplinares previstas no regulamento interno da empresa e na legislação laboral vigente.
            @else
                O presente termo constitui um registo oficial de educação e consciencialização relativamente à situação acima descrita. Caso esta situação volte a acontecer, o trabalhador ou quem a executar poderá ficar sujeito à aplicação das sanções disciplinares previstas no regulamento interno da empresa e na legislação laboral vigente.
            @endif
            @if($education->sanction_warning)
                <br><br><strong>{!! $bi('Observação de Sanção:', '处分说明：') !!}</strong> {!! nl2br(e($education->sanction_warning)) !!}
            @endif
        </div>
        @if($isBilingual)
            <div class="warning-zh">
                @if($isGeneral)
                    本通知书为针对上述情况的全体员工通用批评教育与警示记录。全体签字人员已明确知悉：若今后再次发生相同或类似情况，公司将依据内部规章制度及适用劳动法规对实际执行或责任人员予以相应纪律处分或处罚。
                @else
                    本通知书为针对上述情况的正式批评教育与警示记录。相关员工及执行人已明确知悉：若今后再次发生相同或类似情况，公司将依据内部规章制度及适用劳动法规对责任人予以相应纪律处分或处罚。
                @endif
            </div>
        @endif
    </div>

    <div class="section-title">{!! $bi('4. Assinaturas de Todos os Intervenientes', '4. 全体相关人员签名') !!}</div>
    <div class="free-signature-box">
        <div class="free-signature-header">
            {!! $bi('Área Livre para Assinaturas (Todos os Intervenientes)', '全体人员自由签名区（所有相关人员均可在此签字）') !!}
            <div class="free-signature-hint">
                {!! $bi('Indique nome completo, função, assinatura e data.', '请工整填写姓名、职务、签名及日期。') !!}
            </div>
        </div>
        <div class="free-signature-area"></div>
    </div>

    <div class="footer-note">
        {!! $bi('Emitido por', '签发人') !!}: {{ $operatorName }} · {{ $issuedDate }} · {{ config('app.name', 'HumanCore') }} · {!! $bi('Documento válido após assinatura de todos os intervenientes e carregamento no sistema.', '本文件经全体相关人员签字并上传系统后生效。') !!}
    </div>
</body>
</html>
