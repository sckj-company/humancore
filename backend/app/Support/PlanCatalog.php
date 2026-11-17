<?php

namespace App\Support;

/**
 * Catálogo canónico de funcionalidades, limites e capacidades de gestão multi-empresa
 * suportados pelo motor de planos customizáveis do HumanCore.
 */
class PlanCatalog
{
    public const BILLING_CYCLES = [
        'monthly' => ['label' => 'Mensal', 'months' => 1, 'days' => 30],
        'quarterly' => ['label' => 'Trimestral', 'months' => 3, 'days' => 90],
        'semiannual' => ['label' => 'Semestral', 'months' => 6, 'days' => 180],
        'annual' => ['label' => 'Anual', 'months' => 12, 'days' => 365],
        'lifetime' => ['label' => 'Vitalício', 'months' => null, 'days' => null],
        'custom_days' => ['label' => 'Personalizado (dias)', 'months' => null, 'days' => null],
    ];

    public const PRICING_MODELS = [
        'flat' => 'Valor fixo por ciclo',
        'per_employee' => 'Base + por funcionário adicional',
        'per_managed_tenant' => 'Base + por empresa gerida adicional',
        'hybrid' => 'Híbrido (Base + funcionários + empresas geridas)',
    ];

    /**
     * @return array<string, array{label: string, group: string, description: string, default: bool}>
     */
    public static function features(): array
    {
        return [
            'employees' => [
                'label' => 'Gestão de Funcionários',
                'group' => 'core',
                'description' => 'Cadastro, fichas, histórico e timeline dos colaboradores.',
                'default' => true,
            ],
            'employee_approvals' => [
                'label' => 'Aprovação de Funcionários',
                'group' => 'core',
                'description' => 'Fluxo de aprovação pendente antes da ativação do colaborador.',
                'default' => true,
            ],
            'employee_educations' => [
                'label' => 'Advertências e Processos Disciplinares',
                'group' => 'core',
                'description' => 'Registo de advertências, recibos PDF e anexos assinados.',
                'default' => true,
            ],
            'branches' => [
                'label' => 'Filiais / Sucursais',
                'group' => 'organization',
                'description' => 'Gestão de múltiplas filiais dentro da mesma empresa.',
                'default' => true,
            ],
            'departments_positions' => [
                'label' => 'Departamentos e Cargos',
                'group' => 'organization',
                'description' => 'Estrutura orgânica de departamentos e cargos.',
                'default' => true,
            ],
            'excel_import' => [
                'label' => 'Importação via Excel',
                'group' => 'core',
                'description' => 'Pré-visualização e importação em massa de funcionários.',
                'default' => true,
            ],
            'ocr_identity' => [
                'label' => 'OCR de Bilhete de Identidade',
                'group' => 'core',
                'description' => 'Leitura automática de documentos de identificação.',
                'default' => false,
            ],
            'attendance_manual' => [
                'label' => 'Presenças Manuais e Justificações',
                'group' => 'time',
                'description' => 'Marcação de ponto manual, relatórios e justificações.',
                'default' => true,
            ],
            'attendance_qr' => [
                'label' => 'Presenças por QR Code',
                'group' => 'time',
                'description' => 'Emissão e leitura de QR Code dinâmico para ponto.',
                'default' => false,
            ],
            'biometric_integration' => [
                'label' => 'Integração Biométrica',
                'group' => 'time',
                'description' => 'Sincronização com terminais biométricos externos.',
                'default' => false,
            ],
            'schedules_shifts' => [
                'label' => 'Turnos e Escalas de Horário',
                'group' => 'time',
                'description' => 'Gestão de turnos e atribuição de horários.',
                'default' => true,
            ],
            'holidays' => [
                'label' => 'Calendário de Feriados',
                'group' => 'time',
                'description' => 'Configuração de feriados nacionais e internos.',
                'default' => true,
            ],
            'leave_management' => [
                'label' => 'Férias e Ausências',
                'group' => 'time',
                'description' => 'Pedidos, saldos, aprovações e comprovativos de ausência.',
                'default' => true,
            ],
            'payroll' => [
                'label' => 'Processamento Salarial (Payroll)',
                'group' => 'payroll',
                'description' => 'Períodos salariais, processamento, aprovação e fecho.',
                'default' => true,
            ],
            'payroll_inss_irt_custom' => [
                'label' => 'Regras INSS & IRT Versionadas',
                'group' => 'payroll',
                'description' => 'Configuração de tabelas IRT e regras INSS com vigência.',
                'default' => true,
            ],
            'salary_regulations' => [
                'label' => 'Regulamentos de Componentes Salariais',
                'group' => 'payroll',
                'description' => 'Subsídios, fórmulas e regulamentação salarial.',
                'default' => true,
            ],
            'benefits' => [
                'label' => 'Benefícios',
                'group' => 'payroll',
                'description' => 'Gestão de benefícios atribuídos aos colaboradores.',
                'default' => true,
            ],
            'deductions_installments' => [
                'label' => 'Descontos e Adiantamentos Parcelados',
                'group' => 'payroll',
                'description' => 'Vales, empréstimos e plano mensal de parcelas.',
                'default' => true,
            ],
            'payslips_pdf' => [
                'label' => 'Recibos de Vencimento PDF',
                'group' => 'payroll',
                'description' => 'Geração e download de recibos individuais e por período.',
                'default' => true,
            ],
            'recruitment' => [
                'label' => 'Recrutamento e Candidatos',
                'group' => 'talent',
                'description' => 'Vagas, pipeline de candidatos e contratação.',
                'default' => false,
            ],
            'onboarding' => [
                'label' => 'Onboarding',
                'group' => 'talent',
                'description' => 'Templates e tarefas de integração de novos colaboradores.',
                'default' => false,
            ],
            'performance' => [
                'label' => 'Avaliação de Desempenho',
                'group' => 'talent',
                'description' => 'Ciclos de avaliação, metas e aprovações.',
                'default' => false,
            ],
            'trainings' => [
                'label' => 'Formações',
                'group' => 'talent',
                'description' => 'Catálogo de formações, inscrições e conclusões.',
                'default' => false,
            ],
            'documents_storage' => [
                'label' => 'Gestão Documental',
                'group' => 'governance',
                'description' => 'Upload, verificação e arquivo de documentos digitais.',
                'default' => true,
            ],
            'reports_basic' => [
                'label' => 'Relatórios Operacionais',
                'group' => 'governance',
                'description' => 'Headcount, turnover, presenças e resumo de folha.',
                'default' => true,
            ],
            'reports_advanced_export' => [
                'label' => 'Exportação Avançada de Relatórios',
                'group' => 'governance',
                'description' => 'Exportação de relatórios analíticos e custos.',
                'default' => false,
            ],
            'audits' => [
                'label' => 'Trilha de Auditoria',
                'group' => 'governance',
                'description' => 'Registo detalhado de alterações e ações por utilizador.',
                'default' => true,
            ],
            'email_templates' => [
                'label' => 'Templates de Email',
                'group' => 'governance',
                'description' => 'Personalização de notificações enviadas por email.',
                'default' => false,
            ],
            'custom_permission_groups' => [
                'label' => 'Grupos de Permissões Customizados',
                'group' => 'platform',
                'description' => 'Criação de grupos de acesso próprios na empresa.',
                'default' => true,
            ],
            'field_level_permissions' => [
                'label' => 'Permissões por Campo Sensível',
                'group' => 'platform',
                'description' => 'Controlo granular de visualização/edição de salários e NIF.',
                'default' => true,
            ],
            'api_tokens' => [
                'label' => 'Chaves de API por Empresa',
                'group' => 'platform',
                'description' => 'Acesso programático via tokens dedicados da empresa.',
                'default' => false,
            ],
            'white_label' => [
                'label' => 'White-Label (Marca Própria)',
                'group' => 'platform',
                'description' => 'Personalização visual da marca na interface e documentos.',
                'default' => false,
            ],
            'two_factor_auth' => [
                'label' => 'Autenticação 2FA',
                'group' => 'platform',
                'description' => 'Suporte e exigência de segundo fator de autenticação.',
                'default' => false,
            ],
        ];
    }

    /**
     * @return array<string, array{label: string, unit: string, description: string, default: int|string|null}>
     */
    public static function limits(): array
    {
        return [
            'max_employees' => [
                'label' => 'Máximo de Funcionários',
                'unit' => 'funcionários',
                'description' => 'Deixe vazio para ilimitado.',
                'default' => 50,
            ],
            'max_users' => [
                'label' => 'Máximo de Utilizadores com Login',
                'unit' => 'utilizadores',
                'description' => 'Contas ativas com acesso ao sistema.',
                'default' => 15,
            ],
            'max_branches' => [
                'label' => 'Máximo de Filiais',
                'unit' => 'filiais',
                'description' => 'Filiais físicas dentro da empresa.',
                'default' => 3,
            ],
            'max_departments' => [
                'label' => 'Máximo de Departamentos',
                'unit' => 'departamentos',
                'description' => 'Departamentos ativos.',
                'default' => 10,
            ],
            'max_storage_mb' => [
                'label' => 'Armazenamento Documental',
                'unit' => 'MB',
                'description' => 'Espaço total para documentos enviados.',
                'default' => 2048,
            ],
            'max_ocr_requests_per_month' => [
                'label' => 'Leituras OCR por Mês',
                'unit' => 'pedidos/mês',
                'description' => 'Extração automática de BI/documentos por mês.',
                'default' => 50,
            ],
            'max_payroll_runs_per_month' => [
                'label' => 'Processamentos de Folha por Mês',
                'unit' => 'execuções/mês',
                'description' => 'Deixe vazio para ilimitado.',
                'default' => null,
            ],
            'max_api_keys' => [
                'label' => 'Chaves de API',
                'unit' => 'chaves',
                'description' => 'Tokens de integração externos.',
                'default' => 2,
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaultFeatures(): array
    {
        $defaults = [];
        foreach (self::features() as $key => $meta) {
            $defaults[$key] = $meta['default'];
        }

        return $defaults;
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaultLimits(): array
    {
        $defaults = [];
        foreach (self::limits() as $key => $meta) {
            $defaults[$key] = $meta['default'];
        }
        $defaults['hard_limit_behavior'] = 'block';

        return $defaults;
    }

    /**
     * @return array<string, mixed>
     */
    public static function defaultAgencyConfig(): array
    {
        return [
            'can_manage_other_tenants' => false,
            'can_create_managed_tenants' => false,
            'can_link_existing_tenants' => false,
            'max_managed_tenants' => 0,
            'max_hierarchy_depth' => 0,
            'quota_scope' => 'pooled_under_manager',
            'can_manage_child_users' => true,
            'can_customize_child_permissions' => true,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function catalogPayload(): array
    {
        return [
            'features' => self::features(),
            'limits' => self::limits(),
            'billing_cycles' => self::BILLING_CYCLES,
            'pricing_models' => self::PRICING_MODELS,
            'defaults' => [
                'features' => self::defaultFeatures(),
                'limits' => self::defaultLimits(),
                'agency_config' => self::defaultAgencyConfig(),
            ],
        ];
    }
}
