<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <title>Comprovativo de Ausência / Férias</title>
    @php
        $isBilingual = $isBilingual ?? (($lang ?? 'bilingual') !== 'pt');
        $bi = static fn (string $pt, string $zh): string => $isBilingual
            ? e($pt).' <span class="zh-inline">/ '.e($zh).'</span>'
            : e($pt);
        $biBlock = static fn (string $pt, string $zh): string => $isBilingual
            ? '<span class="pt">'.e($pt).'</span><span class="zh-sub">'.e($zh).'</span>'
            : '<span class="pt">'.e($pt).'</span>';
        $tenant = $tenant ?? ($leave->tenant ?? $employee?->tenant);
        $employee = $employee ?? $leave->employee;
        $leaveType = $leaveType ?? $leave->leaveType;
        $occurrence = (string) ($leave->occurrence_type ?? 'absence');
        $isVacation = $occurrence === 'vacation' || ($leaveType?->code === 'vacation');
        [$titlePt, $titleZh] = match ($occurrence) {
            'vacation' => ['COMPROVATIVO DE FÉRIAS', '休假审批凭证'],
            'day_off' => ['COMPROVATIVO DE FOLGA', '调休 / 休假凭证'],
            'medical' => ['COMPROVATIVO DE AUSÊNCIA MÉDICA', '病假 / 就医缺勤凭证'],
            'maternity', 'paternity' => ['COMPROVATIVO DE LICENÇA PARENTAL', '产假 / 陪产假凭证'],
            default => $isVacation
                ? ['COMPROVATIVO DE FÉRIAS', '休假审批凭证']
                : ['COMPROVATIVO DE AUSÊNCIA / FALTA', '缺勤 / 请假凭证'],
        };
        [$occPt, $occZh] = match ($occurrence) {
            'vacation' => ['Férias', '年假 / 休假'],
            'day_off' => ['Folga', '调休'],
            'medical' => ['Consulta / Tratamento Médico', '就医 / 病假'],
            'family' => ['Assistência Familiar', '家庭事务'],
            'maternity' => ['Licença de Maternidade', '产假'],
            'paternity' => ['Licença de Paternidade', '陪产假'],
            'bereavement' => ['Luto', '丧假'],
            'unpaid' => ['Licença sem Vencimento', '无薪假'],
            'personal' => ['Assunto Pessoal', '私事假'],
            'training' => ['Formação', '培训'],
            'public_duty' => ['Dever Público', '公务'],
            'other' => ['Outro', '其他'],
            default => ['Ausência / Falta', '缺勤 / 请假'],
        };
        [$noticePt, $noticeZh] = match ($leave->notice_type) {
            'unanticipated' => ['Não antecipado', '未提前通知'],
            'anticipated' => ['Antecipado', '提前通知'],
            default => ['Não especificado', '未指定'],
        };
        [$statusPt, $statusZh] = match ($leave->status) {
            'approved' => ['Aprovado', '已批准'],
            'rejected' => ['Rejeitado', '已拒绝'],
            'cancelled' => ['Cancelado', '已取消'],
            default => ['Pendente / Em Registo', '待审批 / 登记中'],
        };
        $startFmt = $leave->start_date ? \Carbon\Carbon::parse($leave->start_date)->format('d/m/Y') : '—';
        $endFmt = $leave->end_date ? \Carbon\Carbon::parse($leave->end_date)->format('d/m/Y') : '—';
        $totalDays = (int) ($leave->total_days ?? 1);
        $documentCode = $leave->id ? sprintf('AUS-%05d', $leave->id) : 'AUS-PREV';
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
            font-family: 'DejaVu Sans', 'Droid Sans Fallback', sans-serif;
            font-size: 9.2px;
            line-height: 1.32;
            color: #1e293b;
            margin: 0;
            padding: 0;
        }
        .sheet { page-break-inside: avoid; }
        table { width: 100%; border-collapse: collapse; }
        .header-bar {
            border-bottom: 2px solid #0f766e;
            padding-bottom: 7px;
            margin-bottom: 9px;
        }
        .company-name { font-size: 13px; font-weight: bold; color: #0f172a; }
        .company-meta { font-size: 8px; color: #475569; margin-top: 2px; }
        .doc-title { font-size: 11.5px; font-weight: bold; color: #0f766e; text-align: right; }
        .doc-title-zh { font-size: 9.5px; color: #475569; text-align: right; margin-top: 1px; }
        .doc-code { font-size: 8px; color: #475569; text-align: right; margin-top: 2px; }
        .zh-inline { color: #64748b; font-size: 8px; font-weight: normal; }
        .pt { display: block; }
        .zh-sub { display: block; color: #64748b; font-size: 7.2px; font-weight: normal; margin-top: 1px; }

        .section-title {
            font-size: 8.5px;
            font-weight: bold;
            text-transform: uppercase;
            color: #115e59;
            background: #f0fdfa;
            border-left: 3px solid #0d9488;
            padding: 3.5px 7px;
            margin: 8px 0 5px;
        }
        .info-grid td {
            padding: 4px 6px;
            border: 1px solid #e2e8f0;
            font-size: 9px;
            vertical-align: top;
        }
        .info-label {
            display: block;
            font-size: 7.4px;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 1px;
        }
        .info-value {
            font-weight: bold;
            color: #0f172a;
        }
        .summary-boxes { margin: 8px 0; }
        .summary-boxes td {
            border: 1px solid #cbd5e1;
            background: #f8fafc;
            padding: 5px 7px;
            width: 25%;
        }
        .summary-val {
            font-size: 10px;
            font-weight: bold;
            color: #0f172a;
        }
        .reason-box {
            border: 1px solid #cbd5e1;
            background: #ffffff;
            padding: 7px 9px;
            min-height: 48px;
            font-size: 9px;
            color: #0f172a;
        }
        .declaration {
            margin-top: 9px;
            padding: 7px 9px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            font-size: 8.5px;
            color: #334155;
            line-height: 1.38;
        }
        .declaration-zh {
            margin-top: 4px;
            padding-top: 4px;
            border-top: 1px dashed #cbd5e1;
            color: #475569;
            font-size: 8px;
        }
        .signatures {
            margin-top: 22px;
            page-break-inside: avoid;
        }
        .signatures td {
            width: 33.33%;
            padding: 0 8px;
            text-align: center;
            vertical-align: bottom;
        }
        .sig-space {
            height: 32px;
            border-bottom: 1px solid #334155;
            margin-bottom: 4px;
        }
        .sig-role {
            font-size: 8.5px;
            font-weight: bold;
            color: #0f172a;
        }
        .sig-sub {
            font-size: 7.3px;
            color: #64748b;
        }
        .footer-note {
            margin-top: 12px;
            border-top: 1px solid #e2e8f0;
            padding-top: 4px;
            font-size: 7.3px;
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
                        <div class="doc-code">Ref.: {{ $documentCode }} · {!! $bi('Emissão', '签发日期') !!}: {{ now()->format('d/m/Y H:i') }}</div>
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
                    <span class="info-value">{{ $employee?->id_document_number ?? $employee?->tax_id ?? '—' }}</span>
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
                    <span class="info-label">{!! $bi('Estado do Registo', '记录状态') !!}</span>
                    <span class="info-value">{!! $bi($statusPt, $statusZh) !!}</span>
                </td>
            </tr>
        </table>

        <div class="section-title">{!! $bi('2. Detalhes da Ocorrência / Período', '2. 请假 / 缺勤详情') !!}</div>
        <table class="info-grid">
            <tr>
                <td style="width: 36%;">
                    <span class="info-label">{!! $bi('Tipo de Ausência / Licença', '假期 / 缺勤类型') !!}</span>
                    <span class="info-value">{{ $leaveType?->name ?? '—' }}</span>
                </td>
                <td style="width: 34%;">
                    <span class="info-label">{!! $bi('Natureza', '性质') !!}</span>
                    <span class="info-value">{!! $bi($occPt, $occZh) !!}</span>
                </td>
                <td style="width: 30%;">
                    <span class="info-label">{!! $bi('Aviso Prévio', '通知方式') !!}</span>
                    <span class="info-value">{!! $bi($noticePt, $noticeZh) !!}</span>
                </td>
            </tr>
        </table>

        <table class="summary-boxes">
            <tr>
                <td>
                    <span class="info-label">{!! $bi('Data de Início', '开始日期') !!}</span>
                    <div class="summary-val">{{ $startFmt }}</div>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Data de Fim', '结束日期') !!}</span>
                    <div class="summary-val">{{ $endFmt }}</div>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Duração Total', '总天数') !!}</span>
                    <div class="summary-val">{{ $totalDays }} {!! $bi('dia(s)', '天') !!}</div>
                </td>
                <td>
                    <span class="info-label">{!! $bi('Enquadramento', '处理方式') !!}</span>
                    <div class="summary-val" style="font-size: 8.5px;">
                        @if($leave->is_justified)
                            {!! $bi('Justificada', '已说明理由') !!}
                        @else
                            {!! $bi('Não justificada', '无理由') !!}
                        @endif
                        ·
                        @if($leave->deduct_from_salary)
                            {!! $bi('Com desconto', '扣薪') !!}
                        @else
                            {!! $bi('Sem desconto', '不扣薪') !!}
                        @endif
                    </div>
                </td>
            </tr>
        </table>

        <div class="section-title">{!! $bi('3. Motivo / Observações', '3. 事由及备注') !!}</div>
        <div class="reason-box">
            @if(filled($leave->reason))
                {!! nl2br(e($leave->reason)) !!}
            @else
                <span style="color: #64748b;">{!! $bi('Sem observações adicionais registadas.', '暂无其他备注说明。') !!}</span>
            @endif
        </div>

        <div class="declaration">
            <strong>{!! $bi('Declaração de Conhecimento e Aceitação:', '知悉与确认声明：') !!}</strong>
            @if($isVacation)
                Eu, <strong>{{ $employee?->full_name ?? '____________________' }}</strong>, declaro ter solicitado e tomado conhecimento do período de férias acima discriminado, comprometendo-me a retomar as minhas funções na data prevista após o término do gozo de férias.
            @else
                Eu, <strong>{{ $employee?->full_name ?? '____________________' }}</strong>, declaro ter tomado conhecimento do registo de ausência / falta acima descrito e das respetivas condições laborais e salariais aplicáveis nos termos da legislação vigente.
            @endif
            @if($isBilingual)
                <div class="declaration-zh">
                    @if($isVacation)
                        本人 <strong>{{ $employee?->full_name ?? '____________________' }}</strong> 确认已申请并知悉上述休假期间安排，并承诺在假期结束后按期返回工作岗位。
                    @else
                        本人 <strong>{{ $employee?->full_name ?? '____________________' }}</strong> 确认已知悉上述缺勤 / 请假记录及其依据现行劳动法规与公司制度适用的相关薪资处理方式。
                    @endif
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
                    <div class="sig-role">{!! $biBlock('Chefia / Direção', '主管 / 管理层') !!}</div>
                    <div class="sig-sub">{{ $leave->approvedBy?->name ?? 'Responsável' }} · {!! $bi('Data', '日期') !!}: ___/___/_____</div>
                </td>
            </tr>
        </table>

        <div class="footer-note">
            {!! $bi('Emitido por', '签发人') !!}: {{ $operatorName }} · {{ now()->format('d/m/Y H:i') }} · {{ config('app.name', 'HumanCore') }} · {!! $bi('Documento válido após assinatura e carregamento no sistema.', '本文件经签字并上传系统后生效。') !!}
        </div>
    </div>
</body>
</html>
