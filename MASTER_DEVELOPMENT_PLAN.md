# MASTER DEVELOPMENT PLAN — HRMS EMPRESARIAL

> **Versão:** 1.0
> **Data:** 2026-09-03
> **Estado:** Aprovado para implementação
> **Fonte de verdade do projeto** — Qualquer alteração estrutural requer atualização deste documento, justificativa e avaliação de impacto.

---

## Índice

1. [Resumo Executivo](#1-resumo-executivo)
2. [Estado Atual](#2-estado-atual)
3. [Problemas Encontrados](#3-problemas-encontrados)
4. [Riscos](#4-riscos)
5. [Arquitetura Atual](#5-arquitetura-atual)
6. [Arquitetura Proposta](#6-arquitetura-proposta)
7. [Stack Final](#7-stack-final)
8. [Estrutura de Diretórios](#8-estrutura-de-diretórios)
9. [Modelo de Banco de Dados](#9-modelo-de-banco-de-dados)
10. [Multi-tenancy](#10-multi-tenancy)
11. [Segurança](#11-segurança)
12. [RBAC](#12-rbac)
13. [Módulos](#13-módulos)
14. [Workflows](#14-workflows)
15. [Payroll Engine](#15-payroll-engine)
16. [Design System](#16-design-system)
17. [UI/UX](#17-uiux)
18. [Dashboards](#18-dashboards)
19. [APIs](#19-apis)
20. [Integrações](#20-integrações)
21. [Internacionalização](#21-internacionalização)
22. [Performance](#22-performance)
23. [Cache](#23-cache)
24. [Filas](#24-filas)
25. [Storage](#25-storage)
26. [Logs](#26-logs)
27. [Auditoria](#27-auditoria)
28. [Testes](#28-testes)
29. [Roadmap](#29-roadmap)
30. [Critérios de Aceitação](#30-critérios-de-aceitação)
31. [Dependências](#31-dependências)
32. [Riscos](#32-riscos)
33. [Estratégia de Migração](#33-estratégia-de-migração)

---

## 1. Resumo Executivo

### Produto
HRMS — Human Resources Management System empresarial, multiempresa, multitenant, multilingue, modular e configurável.

### Mercado-alvo inicial
Angola, com arquitetura preparada para expansão global (configuração por país/região de moeda, timezone, idioma, regras trabalhistas e modelos de remuneração).

### Stack
Laravel + React + TypeScript + Tailwind CSS + shadcn/ui + Filament + MySQL + Redis.

### Estado do projeto
**Greenfield** — sem código existente. Ambiente de desenvolvimento preparado (PHP 8.4, Node 22, MySQL 8, Redis 6, Apache 2.4, Composer 2.10).

### Abordagem
Desenvolvimento modular com prioridades P0 → P1 → P2 → P3, seguindo o plano como fonte de verdade. Cada módulo só é considerado concluído quando backend, frontend, permissões, testes, segurança e UI/UX estão completos.

---

## 2. Estado Atual

### Auditoria do diretório

| Item | Estado |
|------|--------|
| Diretório do projeto | `/var/www/html/RH` — vazio |
| Código existente | Nenhum |
| Configurações existentes | Nenhuma |
| Banco de dados | Nenhum banco criado |
| Dependências instaladas | Nenhuma |
| Repositório git | Não iniciado |

### Ambiente disponível

| Componente | Versão | Status |
|------------|--------|--------|
| PHP | 8.4.24 | Pronto |
| Composer | 2.10.2 | Pronto |
| Node.js | 22.23.2 | Pronto |
| npm | 10.9.8 | Pronto |
| MySQL | 8.0.46 | Pronto |
| Redis | 6.0.16 | Pronto |
| Apache | 2.4.52 | Pronto |
| Git | 2.34.1 | Pronto |
| Extensões PHP | bcmath, curl, gd, intl, mbstring, mysqli, pdo_mysql, redis, xml, zip, pcntl, sodium, fileinfo, openssl, session, tokenizer, ctype, posix, sockets | Completas |

### Conclusão da auditoria

Projeto em estado inicial. Nenhum código, migration, configuração ou dependência existe. O ambiente está preparado para iniciar o desenvolvimento do zero conforme o plano.

---

## 3. Problemas Encontrados

### Inexistentes (greenfield)

Não há código legado, dívida técnica ou bugs existentes. Os problemas identificados são **riscos potenciais** a serem mitigados durante o desenvolvimento:

1. **Ausência de estrutura base** — todo o ecossistema precisa ser criado do zero
2. **Falta de definição de dados reais** — sem dados de produção para validar o modelo
3. **Ambiente único** — sem separação dev/staging/production configurada
4. **Sem CI/CD** — ausência de pipeline de integração contínua

---

## 4. Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Complexidade do Payroll Engine | Média | Alto | Desenvolvimento iterativo, testes unitários extensivos, validação com contadores reais |
| Isolamento multi-tenant | Baixa | Crítico | Middleware dedicado, Global Scopes, testes de isolamento obrigatórios |
| Escalabilidade com grandes volumes | Média | Alto | Índices, cache, paginação, processamento assíncrono, monitorização |
| Internacionalização incompleta | Média | Médio | Sistema de tradução desde o dia 1, suporte gradual a idiomas |
| Dependência de serviços externos | Baixa | Médio | Abstração de integrações, fallbacks, contratos de interface |
| Segurança em dados sensíveis | Baixa | Crítico | Encriptação, auditoria, RBAC, validação backend obrigatória |
| Scope creep (expansão não planeada) | Alta | Alto | Roadmap definido, priorização P0-P3, controlo de alterações |

---

## 5. Arquitetura Atual

**Inexistente.** Projeto greenfield.

---

## 6. Arquitetura Proposta

### Princípios arquiteturais

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENTE (React SPA)                       │
│  Dashboard RH · Dashboard Manager · Portal do Funcionário   │
│  shadcn/ui · Tailwind CSS · ECharts · i18n                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (JSON)
                           │ Sanctum Token Auth
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  LARAVEL API (Backend)                       │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Routes  │ │Controllers│ │  Services│ │  Payroll Engine│  │
│  │  API    │ │  REST     │ │ Regras   │ │  Motor Salarial│  │
│  └─────────┘ └──────────┘ └──────────┘ └────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ Models  │ │ Policies │ │  Requests│ │  Events/Jobs   │  │
│  │ Eloquent│ │  RBAC    │ │ Validação│ │  Async Process │  │
│  └─────────┘ └──────────┘ └──────────┘ └────────────────┘  │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │Scopes   │ │Middleware│ │  Filters │ │  Notifications │  │
│  │Tenant   │ │  Auth    │ │  Search  │ │  Mail/SMS      │  │
│  └─────────┘ └──────────┘ └──────────┘ └────────────────┘  │
└──────────┬────────────────────────────────┬─────────────────┘
           │                                │
           ▼                                ▼
┌──────────────────┐          ┌──────────────────────────┐
│     MySQL        │          │     Redis                │
│  Multi-tenant    │          │  Cache · Session · Queue │
│  Isolado         │          │  Horizon                 │
└──────────────────┘          └──────────────────────────┘
```

### Backoffice (Filament)

```
┌─────────────────────────────────────────────────────────────┐
│                 FILAMENT (Backoffice Admin)                  │
│  Super Admin · Tenants · Configurações Técnicas            │
│  Utilizadores Admin · Permissões · Monitorização           │
│  Manutenção · Logs · Saúde do Sistema                      │
└─────────────────────────────────────────────────────────────┘
```

### Separação de responsabilidades

| Camada | Responsabilidade |
|--------|------------------|
| **Laravel (API)** | Regras de negócio, persistência, segurança, autenticação, autorização, payroll, workflows, notificações, auditoria, integrações |
| **React (SPA)** | Experiência principal: RH, Manager, Employee, dashboards, relatórios, formulários, visualização de dados |
| **Filament** | Super Admin, administração técnica, gestão de tenants, configurações internas, manutenção, monitorização |

### Decisões arquiteturais

1. **API First** — toda a lógica de negócio é exposta via REST API; o React consome a API; o Filament acede diretamente ao backend Laravel
2. **Service Layer** — regras de negócio em Services, não em Controllers
3. **Repository Pattern** — abstração de acesso a dados quando justificável (complexidade de queries)
4. **Event-Driven** — eventos para ações transversais (notificações, auditoria, atualizações)
5. **Queue-First** — processamento pesado (payroll, relatórios, envio de emails) sempre em filas
6. **Tenant Isolation** — Global Scopes + middleware para isolar dados por empresa
7. **RBAC Centralizado** — Policies + Gates para toda a autorização

---

## 7. Stack Final

### Backend

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| PHP | 8.4+ | Linguagem principal |
| Laravel | 12.x | Framework |
| Laravel Sanctum | ^4.x | Autenticação API |
| Laravel Horizon | ^5.x | Gestão de filas |
| Laravel Notifications | Nativo | Notificações |
| Laravel Localization | Nativo | i18n backend |
| MySQL | 8.0+ | Banco de dados |
| Redis | 6+ | Cache, sessões, filas |

### Frontend

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| React | 19.x | Framework UI |
| TypeScript | 5.x | Tipagem |
| Tailwind CSS | 4.x | Estilos utilitários |
| shadcn/ui | Última | Componentes base |
| Apache ECharts | 5.x | Gráficos |
| React Router | 7.x | Roteamento |
| TanStack Query | 5.x | Data fetching |
| Zustand | 5.x | Estado global |
| React Hook Form | 7.x | Formulários |
| Zod | 3.x | Validação frontend |
| i18next | 24.x | Internacionalização |
| Axios | 1.x | HTTP client |
| date-fns | 4.x | Datas |
| QR Code (react-qr) | Última | QR Code |
| React PDF | 4.x | Visualização de PDF |
| Lucide React | Última | Ícones |

### Backoffice (Filament)

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| Filament | 3.x | Painel administrativo |
| Filament Shield | ^3.x | Gestão de permissões |
| Filament Tenant | Plugin | Multi-tenancy |

### Ferramentas de desenvolvimento

| Ferramenta | Uso |
|------------|-----|
| Vite | Bundler frontend |
| Laravel Pint | PHP Code Style |
| Pest | PHP Testing |
| PHPStan | PHP Static Analysis |
| ESLint | JS/TS Linting |
| Prettier | Code Formatter |
| Playwright | E2E Testing |

---

## 8. Estrutura de Diretórios

```
/var/www/html/RH/
├── .env
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml
├── docker-compose.yml            # Opcional para dev
├── Makefile                      # Comandos úteis
├── README.md
├── MASTER_DEVELOPMENT_PLAN.md    # ← Este documento
│
├── backend/                      # Laravel API
│   ├── app/
│   │   ├── Console/
│   │   │   └── Commands/         # Artisan commands
│   │   ├── Enums/                # Enums tipados
│   │   ├── Events/
│   │   ├── Exceptions/
│   │   ├── Http/
│   │   │   ├── Controllers/      # API Controllers
│   │   │   │   └── Api/
│   │   │   │       └── V1/
│   │   │   ├── Middleware/
│   │   │   ├── Requests/         # Form Requests
│   │   │   └── Resources/        # API Resources
│   │   ├── Jobs/
│   │   ├── Listeners/
│   │   ├── Livewire/             # Filament Livewire
│   │   ├── Mail/
│   │   ├── Models/
│   │   ├── Notifications/
│   │   ├── Observers/
│   │   ├── Policies/
│   │   ├── Providers/
│   │   ├── Rules/                # Regras de validação custom
│   │   ├── Scopes/               # Global Scopes (tenant)
│   │   ├── Services/
│   │   │   ├── Payroll/          # Payroll Engine
│   │   │   │   ├── Contracts/
│   │   │   │   ├── Calculators/
│   │   │   │   ├── Rules/
│   │   │   │   └── Processors/
│   │   │   ├── Tenant/           # Tenant management
│   │   │   ├── Reports/          # Report engine
│   │   │   └── ...
│   │   ├── Traits/
│   │   │   ├── HasTenant.php
│   │   │   ├── Auditable.php
│   │   │   └── ...
│   │   └── Filament/
│   │       ├── Resources/        # Filament Resources
│   │       ├── Pages/
│   │       ├── Widgets/
│   │       └── Clusters/
│   ├── config/
│   │   ├── filament.php
│   │   ├── sanctum.php
│   │   ├── horizon.php
│   │   └── ...
│   ├── database/
│   │   ├── migrations/
│   │   ├── factories/
│   │   └── seeders/
│   ├── routes/
│   │   ├── api.php
│   │   ├── web.php               # Filament routes
│   │   └── filament.php
│   ├── lang/
│   │   ├── pt/
│   │   ├── en/
│   │   ├── fr/
│   │   └── zh/
│   ├── tests/
│   │   ├── Unit/
│   │   ├── Feature/
│   │   ├── Integration/
│   │   └── Payroll/              # Payroll-specific tests
│   ├── storage/
│   ├── composer.json
│   ├── phpunit.xml
│   └── ...
│
├── frontend/                     # React SPA
│   ├── src/
│   │   ├── app/                  # App config, routes, providers
│   │   ├── assets/               # Images, icons, fonts
│   │   ├── components/           # Shared components
│   │   │   ├── ui/               # shadcn/ui components
│   │   │   ├── charts/           # ECharts wrappers
│   │   │   ├── data/             # DataTable, filters, etc.
│   │   │   ├── layout/           # Sidebar, header, etc.
│   │   │   └── shared/           # Reusable business components
│   │   ├── features/             # Feature modules
│   │   │   ├── dashboard/
│   │   │   ├── employees/
│   │   │   ├── attendance/
│   │   │   ├── leave/
│   │   │   ├── payroll/
│   │   │   ├── documents/
│   │   │   ├── contracts/
│   │   │   ├── recruitment/
│   │   │   ├── performance/
│   │   │   ├── training/
│   │   │   └── settings/
│   │   ├── hooks/                # Custom hooks
│   │   ├── lib/                  # Utilities, API client
│   │   ├── locales/              # i18n translation files
│   │   ├── stores/               # Zustand stores
│   │   ├── types/                # TypeScript types/interfaces
│   │   └── pages/                # Route pages
│   ├── public/
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   └── ...
│
└── docs/                         # Documentação adicional
    ├── api/
    ├── arquitetura/
    └── guias/
```

---

## 9. Modelo de Banco de Dados

### Diagrama Conceptual

```
tenants (companies)
├── branches
├── departments
├── teams
├── positions
├── employees
│   ├── contracts
│   ├── documents
│   ├── bank_accounts
│   ├── dependents
│   ├── attendance_records
│   ├── leave_requests
│   ├── payroll_records
│   ├── payslips
│   ├── benefits
│   ├── deductions
│   ├── advances
│   ├── loans
│   ├── performance_evaluations
│   ├── trainings
│   └── notifications
├── schedules
├── shifts
├── holidays
├── leave_types
├── leave_policies
├── salary_rules
├── salary_components
├── payroll_periods
├── payroll_runs
├── recruitment_campaigns
├── job_openings
├── candidates
├── onboarding_templates
├── document_templates
├── email_templates
├── notification_templates
├── report_templates
├── roles
├── permissions
├── users
├── audits
└── settings
```

### Tabelas Principais e Colunas

#### tenancy / empresas

```sql
CREATE TABLE tenants (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) UNIQUE NOT NULL,
    email           VARCHAR(255),
    phone           VARCHAR(50),
    tax_id          VARCHAR(100),            -- NIF / NUIT
    logo_path       VARCHAR(500),
    address         TEXT,
    city            VARCHAR(150),
    country         VARCHAR(100),
    currency        CHAR(3) DEFAULT 'AOA',   -- Código ISO
    locale          VARCHAR(10) DEFAULT 'pt',
    timezone        VARCHAR(100) DEFAULT 'Africa/Luanda',
    date_format     VARCHAR(50) DEFAULT 'd/m/Y',
    fiscal_year_start DATE,                  -- Início do ano fiscal
    status          ENUM('active','inactive','suspended') DEFAULT 'active',
    config          JSON,                    -- Configurações flexíveis
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP NULL
);
```

#### branches (filiais)

```sql
CREATE TABLE branches (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(50),
    address         TEXT,
    city            VARCHAR(150),
    phone           VARCHAR(50),
    email           VARCHAR(255),
    manager_id      BIGINT UNSIGNED NULL,     -- FK employees
    is_headquarter  BOOLEAN DEFAULT FALSE,
    status          ENUM('active','inactive') DEFAULT 'active',
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

#### departments

```sql
CREATE TABLE departments (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    branch_id       BIGINT UNSIGNED NULL,
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(50),
    parent_id       BIGINT UNSIGNED NULL,     -- Auto-relacionamento
    manager_id      BIGINT UNSIGNED NULL,     -- FK employees
    cost_center     VARCHAR(50),
    description     TEXT,
    status          ENUM('active','inactive') DEFAULT 'active',
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_id) REFERENCES departments(id) ON DELETE SET NULL
);
```

#### positions (cargos)

```sql
CREATE TABLE positions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    department_id   BIGINT UNSIGNED NULL,
    title           VARCHAR(255) NOT NULL,
    code            VARCHAR(50),
    description     TEXT,
    requirements    TEXT,
    salary_min      DECIMAL(15,2),
    salary_max      DECIMAL(15,2),
    is_management   BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);
```

#### employees

```sql
CREATE TABLE employees (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    user_id         BIGINT UNSIGNED NULL,       -- FK users (sistema)
    employee_code   VARCHAR(50) UNIQUE NOT NULL,
    first_name      VARCHAR(150) NOT NULL,
    last_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(255) UNIQUE,
    phone           VARCHAR(50),
    alternative_phone VARCHAR(50),
    birth_date      DATE,
    gender          ENUM('male','female','other') NULL,
    marital_status  ENUM('single','married','divorced','widowed') NULL,
    nationality     VARCHAR(100),
    address         TEXT,
    city            VARCHAR(150),
    state           VARCHAR(100),
    country         VARCHAR(100),
    postal_code     VARCHAR(20),
    id_document_type   VARCHAR(50),              -- BI, Passport, etc.
    id_document_number VARCHAR(100),
    id_document_expiry DATE,
    tax_id          VARCHAR(100),                -- NIF
    social_security_id VARCHAR(100),
    photo_path      VARCHAR(500),
    status          ENUM('active','inactive','suspended','terminated') DEFAULT 'active',
    hired_at        DATE,
    probation_end   DATE,
    termination_at  DATE NULL,
    termination_reason TEXT,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

#### employee_contracts

```sql
CREATE TABLE employee_contracts (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id         BIGINT UNSIGNED NOT NULL,
    tenant_id           BIGINT UNSIGNED NOT NULL,
    contract_type       ENUM('permanent','fixed_term','temporary','probation','internship','outsourced') NOT NULL,
    position_id         BIGINT UNSIGNED NULL,
    department_id       BIGINT UNSIGNED NULL,
    manager_id          BIGINT UNSIGNED NULL,     -- FK employees
    base_salary         DECIMAL(15,2) NOT NULL,
    salary_frequency    ENUM('monthly','biweekly','weekly','hourly') DEFAULT 'monthly',
    work_hours_per_week DECIMAL(5,2),
    start_date          DATE NOT NULL,
    end_date            DATE NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    signed_at           DATE,
    document_path       VARCHAR(500),
    notes               TEXT,
    created_at          TIMESTAMP,
    updated_at          TIMESTAMP,
    deleted_at          TIMESTAMP NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);
```

#### salary_components (tabela de configuração)

```sql
CREATE TABLE salary_components (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,
    code            VARCHAR(50) UNIQUE NOT NULL,
    type            ENUM('earning','deduction','benefit','tax','contribution') NOT NULL,
    calculation_type ENUM('fixed','percentage','formula','hours') NOT NULL,
    default_value   DECIMAL(15,4) DEFAULT 0,
    percentage_of   VARCHAR(100) NULL,            -- base component code
    formula         TEXT NULL,                    -- expressão quando formula
    is_taxable      BOOLEAN DEFAULT FALSE,
    is_mandatory    BOOLEAN DEFAULT FALSE,
    priority        INT DEFAULT 0,
    applies_to      JSON,                        -- {departments: [...], positions: [...]}
    effective_from  DATE,
    effective_to    DATE NULL,
    description     TEXT,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

#### employee_salary_components

```sql
CREATE TABLE employee_salary_components (
    id                  BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id         BIGINT UNSIGNED NOT NULL,
    contract_id         BIGINT UNSIGNED NOT NULL,
    salary_component_id BIGINT UNSIGNED NOT NULL,
    custom_value        DECIMAL(15,2) NULL,       -- Override do valor default
    custom_percentage   DECIMAL(5,2) NULL,
    start_date          DATE,
    end_date            DATE NULL,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP,
    updated_at          TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id) REFERENCES employee_contracts(id) ON DELETE CASCADE,
    FOREIGN KEY (salary_component_id) REFERENCES salary_components(id) ON DELETE CASCADE
);
```

#### payroll_periods

```sql
CREATE TABLE payroll_periods (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    name            VARCHAR(255) NOT NULL,       -- "Setembro 2026"
    period_type     ENUM('monthly','biweekly','weekly') DEFAULT 'monthly',
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    payment_date    DATE,
    status          ENUM('open','processing','completed','closed','cancelled') DEFAULT 'open',
    processed_by    BIGINT UNSIGNED NULL,
    processed_at    TIMESTAMP NULL,
    closed_at       TIMESTAMP NULL,
    notes           TEXT,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

#### payroll_records

```sql
CREATE TABLE payroll_records (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    payroll_period_id BIGINT UNSIGNED NOT NULL,
    employee_id     BIGINT UNSIGNED NOT NULL,
    contract_id     BIGINT UNSIGNED NOT NULL,
    base_salary     DECIMAL(15,2) NOT NULL,
    gross_salary    DECIMAL(15,2) NOT NULL,
    total_earnings  DECIMAL(15,2) DEFAULT 0,
    total_deductions DECIMAL(15,2) DEFAULT 0,
    total_taxes     DECIMAL(15,2) DEFAULT 0,
    net_salary      DECIMAL(15,2) NOT NULL,
    work_days       INT,
    absent_days     INT,
    overtime_hours  DECIMAL(8,2),
    overtime_amount DECIMAL(15,2),
    status          ENUM('draft','calculated','approved','paid','cancelled') DEFAULT 'draft',
    approved_by     BIGINT UNSIGNED NULL,
    approved_at     TIMESTAMP NULL,
    paid_at         TIMESTAMP NULL,
    details         JSON,                        -- Breakdown de todos os componentes
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (contract_id) REFERENCES employee_contracts(id) ON DELETE CASCADE
);
```

#### attendance_records

```sql
CREATE TABLE attendance_records (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id     BIGINT UNSIGNED NOT NULL,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    date            DATE NOT NULL,
    clock_in        DATETIME,
    clock_out       DATETIME,
    break_start     DATETIME NULL,
    break_end       DATETIME NULL,
    total_worked    INT NULL,                    -- minutos
    status          ENUM('present','absent','late','half_day','holiday','vacation','sick','justified') DEFAULT 'present',
    late_minutes    INT DEFAULT 0,
    overtime_minutes INT DEFAULT 0,
    qr_code_hash    VARCHAR(255) NULL,
    ip_address      VARCHAR(45) NULL,
    device_info     VARCHAR(255) NULL,
    notes           TEXT,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    UNIQUE KEY unique_attendance (employee_id, date),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
```

#### leave_requests

```sql
CREATE TABLE leave_requests (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    employee_id     BIGINT UNSIGNED NOT NULL,
    tenant_id       BIGINT UNSIGNED NOT NULL,
    leave_type_id   BIGINT UNSIGNED NOT NULL,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    total_days      INT NOT NULL,
    reason          TEXT,
    status          ENUM('draft','pending','approved','rejected','cancelled') DEFAULT 'pending',
    approved_by     BIGINT UNSIGNED NULL,
    approved_at     TIMESTAMP NULL,
    rejected_reason TEXT,
    document_path   VARCHAR(500) NULL,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);
```

#### users (sistema)

```sql
CREATE TABLE users (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NULL,         -- NULL = super admin
    employee_id     BIGINT UNSIGNED NULL,
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password        VARCHAR(255) NOT NULL,
    locale          VARCHAR(10) DEFAULT 'pt',
    timezone        VARCHAR(100) DEFAULT 'Africa/Luanda',
    email_verified_at TIMESTAMP NULL,
    two_factor_secret     TEXT NULL,
    two_factor_recovery_codes TEXT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login_at   TIMESTAMP NULL,
    last_login_ip   VARCHAR(45) NULL,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);
```

#### roles / permissions

```sql
CREATE TABLE roles (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NULL,         -- NULL = global
    name            VARCHAR(255) NOT NULL,
    guard_name      VARCHAR(255) DEFAULT 'web',
    description     TEXT,
    is_system       BOOLEAN DEFAULT FALSE,        -- Não pode ser apagada
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);

CREATE TABLE permissions (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    guard_name      VARCHAR(255) DEFAULT 'web',
    group_name      VARCHAR(100),                 -- employee, payroll, etc.
    description     TEXT,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP
);

-- Pivot tables (Spatie Laravel Permission)
-- model_has_roles, model_has_permissions, role_has_permissions
```

#### audits

```sql
CREATE TABLE audits (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         BIGINT UNSIGNED NULL,
    tenant_id       BIGINT UNSIGNED NULL,
    event           VARCHAR(50) NOT NULL,         -- created, updated, deleted, login, etc.
    auditable_type  VARCHAR(255) NOT NULL,
    auditable_id    BIGINT UNSIGNED NOT NULL,
    old_values      JSON NULL,
    new_values      JSON NULL,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMP,
    INDEX audits_auditable (auditable_type, auditable_id),
    INDEX audits_tenant (tenant_id),
    INDEX audits_user (user_id)
);
```

#### settings (configurações)

```sql
CREATE TABLE settings (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id       BIGINT UNSIGNED NULL,         -- NULL = global
    group           VARCHAR(100) NOT NULL,        -- company, hr, payroll, communication, security, system
    key             VARCHAR(255) NOT NULL,
    value           JSON NOT NULL,
    type            VARCHAR(50) DEFAULT 'string', -- string, number, boolean, json, file
    description     TEXT,
    created_at      TIMESTAMP,
    updated_at      TIMESTAMP,
    UNIQUE KEY unique_setting (tenant_id, group, key)
);
```

### Índices recomendados

- `employees(tenant_id, status, department_id)`
- `employees(employee_code)`
- `attendance_records(employee_id, date)`
- `payroll_records(tenant_id, payroll_period_id, status)`
- `leave_requests(employee_id, status, start_date)`
- `audits(created_at, tenant_id)`
- `audits(auditable_type, auditable_id)`
- `settings(tenant_id, group)`

---

## 10. Multi-tenancy

### Abordagem: Single Database — Isolamento por `tenant_id`

Optar por **Single Database com tenant_id** em vez de bancos separados (mais simples de gerir, backup único, custo reduzido). O isolamento é garantido via:

### Mecanismos de isolamento

| Camada | Mecanismo |
|--------|-----------|
| **Model (Eloquent)** | Global Scope que aplica `where tenant_id = ?` automaticamente |
| **Middleware** | `TenantMiddleware` — identifica tenant a partir do token/domínio e injeta no request |
| **Controller** | `$request->tenant()` para obter o tenant ativo |
| **Policy** | Verificação adicional de `tenant_id` nas Policies |
| **Query** | Todas as queries devem respeitar o tenant: `$query->where('tenant_id', $tenantId)` |
| **Filament** | Plugin Tenant do Filament, escopo automático por tenant |
| **Storage** | Diretório separado por tenant: `tenants/{tenant_id}/...` |
| **Cache** | Chaves prefixadas: `tenant:{id}:{key}` |
| **Filas** | Jobs com `tenant_id` para restaurar contexto |

### Implementação

```php
// App\Scopes\TenantScope
class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if ($tenantId = request()->tenant()?->id) {
            $builder->where($model->getTable().'.tenant_id', $tenantId);
        }
    }
}

// App\Traits\HasTenant
trait HasTenant
{
    protected static function bootHasTenant(): void
    {
        static::addGlobalScope(new TenantScope);
        
        static::creating(function ($model) {
            if (empty($model->tenant_id)) {
                $model->tenant_id = request()->tenant()?->id;
            }
        });
    }
}
```

### Modelos que NÃO possuem tenant_id

- `User` (super admins podem ser globais)
- `Tenant` (a própria entidade)
- `Permission` (globais)
- `Role` (pode ser global ou por tenant)
- `Audit` (contém tenant_id, mas não é escopada)

---

## 11. Segurança

### Classificação de vulnerabilidades (potenciais)

| Categoria | Risco | Mitigação |
|-----------|-------|-----------|
| Autenticação | ALTA | Sanctum tokens, rate limiting, MFA opcional, bloqueio após tentativas |
| Autorização (RBAC) | CRÍTICA | Policies + Gates em cada ação, testes de permissão obrigatórios |
| Isolamento de dados | CRÍTICA | Global Scopes, verificação manual em operações críticas |
| CSRF | MÉDIA | Sanctum SPA já protege; CSRF tokens para Filament |
| XSS | MÉDIA | Blade escapado, React JSX seguro, Content-Security-Policy |
| SQL Injection | BAIXA | Eloquent ORM, prepared statements, validação de input |
| Mass Assignment | MÉDIA | `$fillable` / `$guarded` definidos, Form Requests |
| Upload de ficheiros | ALTA | Validação de tipo/tamanho, scan antivírus, armazenamento fora do webroot |
| Exposição de dados sensíveis | ALTA | Encriptação de dados sensíveis (NIF, BI, salários), logs sem dados pessoais |
| Rate Limiting | MÉDIA | `throttle:api` middleware, limites por rota |
| Sessões | MÉDIA | Redis, timeout configurável, invalidação após troca de password |
| QR Code | MÉDIA | Hash único + tempo de expiração, não reutilizável |
| Tokens de API | ALTA | Sanctum com abilities, expiração, revogação |

### Políticas de segurança

1. Toda validação é feita no backend — frontend apenas melhora UX
2. Toda ação sensível requer Policy explícita
3. Dados salariais e documentos pessoais são encriptados em repouso
4. Logs de auditoria não contêm passwords, tokens ou dados pessoais
5. Uploads são validados por tipo MIME real (não extensão)
6. Rate limiting: 60 req/min para API autenticada, 10 req/min para login
7. Password policy: mínimo 8 caracteres, complexidade configurável
8. MFA disponível via 2FA (totp)

---

## 12. RBAC

### Roles do sistema

| Role | Nível | Descrição |
|------|-------|-----------|
| **Super Admin** | Global | Acesso total a todos os tenants, configurações globais, sistema |
| **Admin** | Tenant | Acesso total a um tenant específico |
| **HR Manager** | Tenant | Gestão de RH, payroll, funcionários, contratações |
| **Manager** | Tenant | Gestão da equipa, aprovações, relatórios |
| **Employee** | Tenant | Auto-serviço: perfil, férias, recibos, presenças |

### Matriz de permissões

| Recurso | Super Admin | Admin | HR Manager | Manager | Employee |
|---------|:-----------:|:-----:|:----------:|:-------:|:--------:|
| **Tenants** | CRUD | - | - | - | - |
| **Users** | CRUD | CRUD | - | - | - |
| **Employees** | R | CRUD | CRUD | R (team) | R (self) |
| **Contracts** | R | CRUD | CRUD | R (team) | R (self) |
| **Departments** | R | CRUD | CRUD | R | - |
| **Positions** | R | CRUD | CRUD | R | - |
| **Attendance** | R | CRUD | CRUD | R (team) | R (self) |
| **Leave Requests** | R | CRUD | CRUD | Approve | Create |
| **Payroll Periods** | R | Process | Process | - | - |
| **Payroll Records** | R | CRUD | R | R (team) | R (self) |
| **Payslips** | R | R | R | R (team) | R (self) |
| **Salary Components** | R | CRUD | CRUD | - | - |
| **Benefits** | R | CRUD | CRUD | - | R (self) |
| **Deductions** | R | CRUD | CRUD | - | R (self) |
| **Recruitment** | R | CRUD | CRUD | R | - |
| **Documents** | R | CRUD | CRUD | R (team) | R (self) |
| **Performance** | R | CRUD | CRUD | Evaluate | R (self) |
| **Training** | R | CRUD | CRUD | R (team) | Apply |
| **Reports** | R | CRUD | CRUD | R (team) | - |
| **Settings** | R | CRUD | CRUD (HR) | - | - |
| **Audit Logs** | CRUD | R | R | - | - |

### Ações por recurso

- `view` — visualizar
- `view_any` — visualizar qualquer
- `create` — criar
- `update` — atualizar
- `delete` — eliminar (soft)
- `force_delete` — eliminar permanentemente
- `restore` — restaurar
- `approve` — aprovar
- `reject` — rejeitar
- `process` — processar (payroll)
- `close` — fechar período
- `export` — exportar
- `print` — imprimir
- `configure` — configurar

### Implementação

- Utilizar `spatie/laravel-permission` para gestão de roles/permissions
- Criar seeder com roles e permissões base
- Filament Shield para gestão visual no backoffice
- Policies específicas para cada Model

---

## 13. Módulos

### Legenda

| P0 | Crítico — sem o qual o sistema não funciona |
| P1 | Essencial — MVP |
| P2 | Importante — versão 1.0 completa |
| P3 | Evolução futura |

### Lista de módulos

| # | Módulo | Prioridade | Estado | Depende de |
|---|--------|:----------:|:------:|:----------:|
| 1 | Tenant (Empresas) | P0 | Plan | - |
| 2 | Autenticação + RBAC | P0 | Plan | 1 |
| 3 | Estrutura Organizacional | P0 | Plan | 1, 2 |
| 4 | Funcionários | P0 | Plan | 1, 2, 3 |
| 5 | Contratos | P0 | Plan | 1, 2, 4 |
| 6 | Dashboard RH | P0 | Plan | 1, 2, 4 |
| 7 | Payroll Engine | P0 | Plan | 1, 2, 4, 5 |
| 8 | Recibos de Vencimento | P0 | Plan | 7 |
| 9 | Presenças | P1 | Plan | 1, 2, 4 |
| 10 | Férias e Ausências | P1 | Plan | 1, 2, 4 |
| 11 | Horários e Turnos | P1 | Plan | 1, 2 |
| 12 | Design System + Layout | P1 | Plan | - |
| 13 | Internacionalização | P1 | Plan | - |
| 14 | Notificações | P1 | Plan | 1, 2 |
| 15 | Dashboard Manager | P1 | Plan | 4, 9, 10 |
| 16 | Portal do Funcionário | P1 | Plan | 4, 7, 8, 9, 10 |
| 17 | Documentos | P1 | Plan | 1, 2, 4 |
| 18 | Configurações do Sistema | P1 | Plan | 1, 2 |
| 19 | QR Code | P2 | Plan | 9 |
| 20 | Recrutamento | P2 | Plan | 1, 2, 4 |
| 21 | Onboarding | P2 | Plan | 4, 20 |
| 22 | Avaliação de Desempenho | P2 | Plan | 1, 2, 4 |
| 23 | Formação | P2 | Plan | 1, 2, 4 |
| 24 | Benefícios e Descontos | P2 | Plan | 4, 5, 7 |
| 25 | Relatórios | P2 | Plan | 4, 7, 9, 10 |
| 26 | Pesquisa Global | P2 | Plan | 4, 7, 10 |
| 27 | Auditoria | P2 | Plan | 1, 2 |
| 28 | Dashboard Super Admin | P2 | Plan | 1, 2 |
| 29 | Email Templates | P2 | Plan | 14 |
| 30 | MFA (2FA) | P3 | Plan | 2 |
| 31 | API Pública | P3 | Plan | 2 |
| 32 | Importação/Exportação | P3 | Plan | 4, 25 |
| 33 | Marketplace de Regras | P3 | Plan | 7 |
| 34 | Integração Bancária | P3 | Plan | 7 |
| 35 | Portal do Candidato | P3 | Plan | 20 |

---

## 14. Workflows

### 14.1 Admissão de Funcionário

```
Recrutamento (se aplicável)
    ↓
Oferta → Aceitação → Documentos → Contrato → Onboarding
    ↓
Criação de utilizador → Atribuição de permissões → Atribuição de equipamento
    ↓
Integração na equipa → Atribuição de gestor → Definição de objetivos
```

### 14.2 Processamento Salarial (Payroll)

```
1. Abrir período (início do mês)
    ↓
2. Recolher dados: presenças, faltas, horas extras, benefícios, descontos
    ↓
3. Calcular salário bruto (base + subsídios + horas extras + bónus)
    ↓
4. Aplicar descontos (faltas, atrasos, empréstimos, adiantamentos)
    ↓
5. Aplicar impostos e contribuições
    ↓
6. Apresentar simulação → validar
    ↓
7. Submeter para aprovação
    ↓
8. Aprovar (HR Manager / Admin)
    ↓
9. Processar (gerar registos finais)
    ↓
10. Fechar período (não permite alterações)
    ↓
11. Gerar recibos → disponibilizar aos funcionários
    ↓
12. Enviar notificações
```

### 14.3 Férias

```
Funcionário solicita → Sistema verifica saldo
    ↓
Se saldo suficiente → Submete para aprovação
    ↓
Gestor aprova/rejeita
    ↓
Se aprovado → Atualiza saldo → Regista no calendário
    ↓
Notifica funcionário → Atualiza presenças no período
```

### 14.4 Presença (QR Code)

```
Funcionário abre app → Gera QR Code dinâmico (expira em 30s)
    ↓
Escaneia no terminal → Sistema valida hash + timestamp
    ↓
Regista entrada → Se após horário, marca atraso
    ↓
No fim do dia → Regista saída → Calcula horas trabalhadas
```

### 14.5 Recrutamento

```
Vaga aberta → Divulgação → Candidatos candidatam-se
    ↓
Triagem curricular → Entrevista inicial → Testes/avaliações
    ↓
Entrevista final → Decisão → Oferta
    ↓
Aceitação → Contratação → Onboarding
```

---

## 15. Payroll Engine

### Arquitetura do motor salarial

```
                         ┌──────────────────────────┐
                         │   PayrollEngineService   │
                         │  (Orquestrador Central)  │
                         └──────────┬───────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
    ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
    │  DataCollector  │   │  RuleEngine     │   │  Calculator     │
    │  - presenças    │   │  - carrega      │   │  - aplica       │
    │  - faltas       │   │    regras       │   │    regras       │
    │  - contratos    │   │  - prioriza     │   │  - soma         │
    │  - componentes  │   │  - resolve      │   │  - subtrai      │
    │  - benefícios   │   │    fórmulas     │   │  - calcula      │
    └────────┬────────┘   └────────┬────────┘   └────────┬────────┘
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   ▼
                    ┌──────────────────────────┐
                    │   PayrollResult          │
                    │  - breakdown detalhado   │
                    │  - totais                │
                    │  - histórico             │
                    └──────────────────────────┘
```

### Componentes do Payroll

#### Earning (rendimentos)

| Componente | Tipo Cálculo | Observação |
|------------|:------------:|------------|
| Salário Base | `fixed` | Definido no contrato |
| Subsídio de Alimentação | `fixed` ou `daily` | Configurável |
| Subsídio de Transporte | `fixed` | Configurável |
| Horas Extras (50%) | `formula` | horas * (base/220) * 1.5 |
| Horas Extras (100%) | `formula` | horas * (base/220) * 2 |
| Prémio de Produtividade | `percentage` | % do salário base |
| Bónus Anual | `fixed` | Rateado por período |
| Comissões | `formula` | % sobre vendas |
| Subsídio de Turno | `percentage` | % do salário base |

#### Deduction (descontos)

| Componente | Tipo Cálculo | Observação |
|------------|:------------:|------------|
| INSS (Segurança Social) | `percentage` | % do salário bruto (configurável por país) |
| IRT (Imposto de Renda) | `formula` | Tabela progressiva (configurável) |
| Faltas | `formula` | (base/30) * dias_falta |
| Atrasos | `formula` | (base/220) * horas_atraso |
| Adiantamento Salarial | `fixed` | Valor definido, descontado no período |
| Empréstimo | `fixed` | Prestação mensal |
| Seguro de Saúde | `fixed` | Valor fixo mensal |
| Pensão Alimentícia | `percentage` | % do salário |

### Mecanismo de Regras

```php
// Interface para regras configuráveis
interface SalaryRuleInterface
{
    public function getName(): string;
    public function getType(): string; // 'earning' | 'deduction'
    public function calculate(Employee $employee, PayrollPeriod $period, array $data): float;
    public function getPriority(): int;
    public function getConditions(): array; // {departments, positions, salary_range, etc}
}

// Exemplo de regra: INSS
class INSSRule implements SalaryRuleInterface
{
    public function calculate(Employee $employee, PayrollPeriod $period, array $data): float
    {
        $percentage = $employee->tenant->getSetting('payroll.inss.rate', 7.5);
        return $data['gross_salary'] * ($percentage / 100);
    }
}
```

### Fluxo de Cálculo

1. Coletar dados do período (presenças, faltas, horas extras, componentes)
2. Carregar regras ativas (de `salary_components` + regras de sistema por país)
3. Ordenar regras por prioridade
4. Para cada regra, verificar se aplica (condições: departamento, cargo, salário, etc.)
5. Calcular e acumular em `earnings` ou `deductions`
6. Calcular impostos (base tributável = earnings - deduções permitidas)
7. Calcular líquido: `gross = base + earnings`, `net = gross - deductions - taxes`
8. Gerar `PayrollRecord` com breakdown completo em JSON
9. Executar validações (integridade, limites, inconsistências)

---

## 16. Design System

### Tokens de Design

```typescript
// Design Tokens (Tailwind CSS config)
const designSystem = {
  colors: {
    primary: {
      DEFAULT: '#2563eb',  // blue-600
      foreground: '#ffffff',
      hover: '#1d4ed8',
      light: '#dbeafe',
      dark: '#1e3a5f',
    },
    secondary: {
      DEFAULT: '#64748b',  // slate-500
      foreground: '#ffffff',
    },
    success: {
      DEFAULT: '#16a34a',  // green-600
      foreground: '#ffffff',
    },
    warning: {
      DEFAULT: '#d97706',  // amber-600
      foreground: '#ffffff',
    },
    danger: {
      DEFAULT: '#dc2626',  // red-600
      foreground: '#ffffff',
    },
    info: {
      DEFAULT: '#0284c7',  // sky-600
      foreground: '#ffffff',
    },
    background: '#f8fafc',  // slate-50
    foreground: '#0f172a',  // slate-900
    muted: '#f1f5f9',       // slate-100
    mutedForeground: '#64748b',
    card: '#ffffff',
    border: '#e2e8f0',
    sidebar: {
      background: '#0f172a',
      foreground: '#ffffff',
      muted: '#1e293b',
      active: '#2563eb',
    }
  },
  spacing: {
    page: 'p-6 lg:p-8',
    card: 'p-6',
    section: 'space-y-6',
    gap: 'gap-4 lg:gap-6',
  },
  borderRadius: {
    sm: '0.375rem',
    DEFAULT: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  },
};
```

### Componentes base (shadcn/ui)

Todos os componentes do shadcn/ui serão utilizados e configurados com os tokens acima:

- `Button` — variantes: default, secondary, outline, ghost, danger, link
- `Input` — text, email, password, number, search
- `Select` — dropdown nativo estilizado
- `Combobox` — autocomplete com pesquisa
- `DatePicker` — calendário interativo
- `TimePicker` — seleção de hora
- `Modal` / `Dialog` — overlays com foco
- `Drawer` — painel lateral
- `Tabs` — navegação por abas
- `Card` — containers com header, content, footer
- `Table` — tabelas responsivas com ordenação
- `DataTable` — tabela avançada com filtros, paginação, seleção
- `Badge` — status, categorias
- `Avatar` — fotos com fallback de iniciais
- `Tooltip` — dicas contextuais
- `DropdownMenu` — menus de ação
- `Toast` / `Sonner` — notificações temporárias
- `Alert` — mensagens de informação, erro, sucesso
- `Breadcrumb` — navegação hierárquica
- `Pagination` — navegação entre páginas
- `Command` — paleta de comandos/pesquisa
- `Skeleton` — loading states
- `Progress` — barras de progresso
- `Separator` — divisores visuais
- `Switch` — toggle
- `Checkbox` — seleção múltipla
- `RadioGroup` — seleção única
- `Textarea` — área de texto
- `Form` — formulários com validação
- `Sheet` — painéis deslizantes
- `Popover` — conteúdo flutuante
- `Collapsible` — seções colapsáveis
- `Resizable` — painéis redimensionáveis
- `Tabs` — abas de navegação
- `Command` — comando/kbar

### Componentes customizados

- `KpiCard` — cartão de indicador com valor, label, variação, ícone, sparkline
- `ChartContainer` — wrapper para ECharts com loading, empty, error states
- `PageHeader` — cabeçalho de página com título, subtítulo, ações
- `DataTable` — tabela com search, filtros, ordenação, paginação, exportação
- `StatusBadge` — badge com cor baseada em status (pendente, aprovado, etc.)
- `EmptyState` — estado vazio com ilustração, mensagem, ação
- `ErrorState` — estado de erro com mensagem e retry
- `LoadingState` — skeleton ou spinner
- `ConfirmDialog` — diálogo de confirmação
- `FiltersBar` — barra de filtros com múltiplos critérios
- `SearchInput` — campo de pesquisa com debounce
- `Timeline` — linha do tempo para histórico
- `StatCard` — cartão de estatística
- `SectionCard` — seção de formulário com título
- `AvatarUpload` — upload de foto com preview e crop
- `FileUpload` — upload de documentos com progresso
- `ActivityFeed` — feed de atividades
- `NotificationBell` — sino de notificações com contador e dropdown

---

## 17. UI/UX

### Princípios de design

1. **Clareza** — cada ecrã tem um propósito claro, sem poluição visual
2. **Eficiência** — ações comuns realizadas em 1-2 cliques
3. **Consistência** — mesmo padrão visual em todo o sistema
4. **Feedback** — toda ação do utilizador gera resposta imediata
5. **Prevenção de erros** — confirmar ações destrutivas, validar formulários em tempo real
6. **Recuperação** — permitir desfazer/recuperar quando possível
7. **Hierarquia visual** — informação mais importante em destaque
8. **Acessibilidade** — contraste adequado, navegação por teclado, labels, focus states

### Layout padrão

```
┌──────────────────────────────────────────────────────────────┐
│  Sidebar (colapsável)   │          Header                    │
│  ┌──────────────────┐   │  ┌───────┬──────┬──────┬────────┐ │
│  │ Logo              │   │  │Search │  Bell│  ?   │ Avatar │ │
│  │                   │   │  └───────┴──────┴──────┴────────┘ │
│  │ Navigation        │   ├────────────────────────────────────┤
│  │ ── Dashboard      │   │                                    │
│  │ ── Employees      │   │          Page Content              │
│  │ ── Attendance     │   │                                    │
│  │ ── Leave          │   │   ┌────────────────────────────┐  │
│  │ ── Payroll        │   │   │  Page Header               │  │
│  │ ── Reports        │   │   │  Title + Actions           │  │
│  │ ── Settings       │   │   └────────────────────────────┘  │
│  │                   │   │                                    │
│  │                   │   │   ┌────────────────────────────┐  │
│  │                   │   │   │  Content Area              │  │
│  │                   │   │   │  Cards / Tables / Charts   │  │
│  │                   │   │   └────────────────────────────┘  │
│  │                   │   │                                    │
│  │  User info        │   │                                    │
│  │  Logout           │   │                                    │
│  └──────────────────┘   └────────────────────────────────────┘
```

### Navegação

- **Sidebar** — navegação principal com ícones + labels, grupos colapsáveis, indicador de ativo
- **Breadcrumb** — contexto de localização
- **Pesquisa global** — Command+K para pesquisar funcionários, contratos, recibos, etc.
- **Notificações** — sino com contador, dropdown com lista, ações rápidas
- **Avatar** — menu do utilizador com perfil, configurações, logout

### Estados de interface

Toda página deve implementar:

| Estado | Comportamento |
|--------|---------------|
| **Loading** | Skeleton cards/tables ou spinner durante carregamento |
| **Empty** | Ilustração + mensagem "Nenhum registo encontrado" + ação (criar primeiro) |
| **Error** | Mensagem de erro + botão "Tentar novamente" |
| **Success** | Toast de confirmação após ação |
| **Disabled** | Botão desativado com tooltip explicativo |

### Responsividade

- **Desktop** (≥1024px): layout completo com sidebar expandida
- **Tablet** (768-1023px): sidebar colapsada, navegação por ícones
- **Mobile** (<768px): sidebar como drawer, navegação inferior simplificada, tabelas adaptáveis

---

## 18. Dashboards

### 18.1 Dashboard RH

**Layout:** 4 colunas (desktop), 2 colunas (tablet), 1 coluna (mobile)

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  Total Func. │  Admissões   │  Desligamentos│  Turnover    │
│   1,234      │   12 este mês│   3 este mês  │   2.4%       │
│  ▲ 5.2%      │  ▲ 8%        │  ▼ 2%         │  ▼ 0.3%      │
├──────────────┴──────────────┴──────────────┴──────────────┤
│  Gráfico: Evolução de Headcount (linha, 12 meses)         │
├──────────────────────────────┬──────────────────────────────┤
│  Gráfico: Presenças (donut)  │  Gráfico: Ausências (barra) │
│  Presente: 85%               │  Faltas por departamento    │
│  Ausente: 10%                │                              │
│  Férias: 5%                  │                              │
├──────────────────────────────┼──────────────────────────────┤
│  Próximos Aniversários       │  Contratos a Expirar        │
│  ┌─ João Silva - 15/09      │  ┌─ Maria Santos - 30 dias  │
│  └─ Ana Costa - 20/09       │  └─ Pedro Lima - 45 dias    │
├──────────────────────────────┴──────────────────────────────┤
│  Tabela: Últimas Admissões (5)                              │
└─────────────────────────────────────────────────────────────┘
```

### 18.2 Dashboard Manager

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  Equipa      │  Presenças   │  Férias       │  Solicitações│
│  15 membros  │  95% hoje    │  2 em curso   │  3 pendentes │
├──────────────────────────────┬──────────────────────────────┤
│  Gráfico: Presença Semanal   │  Gráfico: Horas Trabalhadas  │
│  (barra, 5 dias)             │  (linha, 4 semanas)          │
├──────────────────────────────┴──────────────────────────────┤
│  Tabela: Solicitações Pendentes                             │
│  ┌─ Nome  │ Tipo    │ Data    │ Ações: [Aprovar] [Rejeitar]│
│  └─ ...   │ ...     │ ...     │                              │
└─────────────────────────────────────────────────────────────┘
```

### 18.3 Dashboard Employee

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  Salário     │  Próximo     │  Férias       │  Presença    │
│  350.000 AOA │  Recibo      │  12 dias disp.│  Hoje: OK    │
│              │  05/09       │              │  08:00-17:30 │
├──────────────┴──────────────┴──────────────┴──────────────┤
│  Últimos Recibos                        │  Próximas Férias│
│  ┌─ Agosto 2026 - 350.000 AOA          │  Sem férias     │
│  └─ Julho 2026 - 350.000 AOA           │  agendadas      │
├─────────────────────────────────────────┴──────────────────┤
│  Notificações                                              │
│  ┌─ [Payroll] Recibo de Agosto disponível                  │
│  └─ [RH] Documento: BI actualizado                         │
└─────────────────────────────────────────────────────────────┘
```

### 18.4 Dashboard Super Admin

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│  Tenants     │  Utilizadores│  Armazenamento│  API Calls   │
│  12 activos  │  1.450       │  45.2 GB      │  12.3K/dia   │
├──────────────┴──────────────┴──────────────┴──────────────┤
│  Gráfico: Crescimento de Tenants                          │
│  Gráfico: Consumo de Armazenamento por Tenant             │
├───────────────────────────────────────────────────────────┤
│  Tabela: Tenants e Status                                 │
│  ┌─ Empresa     │ Utiliz. │ Func. │ Armazenamento │ Status│
│  └─ ...         │ ...     │ ...   │ ...           │ OK    │
└───────────────────────────────────────────────────────────┘
```

---

## 19. APIs

### Versionamento

`/api/v1/{resource}`

### Autenticação

- Sanctum tokens (Bearer token)
- SPA authentication para React (cookie-based)
- Token com abilities (ex: `employee:read`, `payroll:write`)

### Endpoints Principais

#### Auth
```
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
PUT    /api/v1/auth/password
```

#### Tenants
```
GET    /api/v1/tenants
POST   /api/v1/tenants
GET    /api/v1/tenants/{id}
PUT    /api/v1/tenants/{id}
DELETE /api/v1/tenants/{id}
```

#### Employees
```
GET    /api/v1/employees                   # Lista com filtros
POST   /api/v1/employees                   # Criar
GET    /api/v1/employees/{id}              # Detalhes
PUT    /api/v1/employees/{id}              # Actualizar
DELETE /api/v1/employees/{id}              # Soft delete
GET    /api/v1/employees/{id}/timeline     # Histórico
GET    /api/v1/employees/{id}/contracts
GET    /api/v1/employees/{id}/documents
```

#### Departments
```
GET    /api/v1/departments                 # Tree structure
POST   /api/v1/departments
GET    /api/v1/departments/{id}
PUT    /api/v1/departments/{id}
DELETE /api/v1/departments/{id}
```

#### Attendance
```
GET    /api/v1/attendance                  # Lista com filtros (data, employee)
POST   /api/v1/attendance/clock-in         # QR Code ou manual
POST   /api/v1/attendance/clock-out
POST   /api/v1/attendance/{id}/justify
GET    /api/v1/attendance/today            # Presenças do dia
```

#### Leave
```
GET    /api/v1/leaves                      # Lista
POST   /api/v1/leaves                      # Solicitar
GET    /api/v1/leaves/{id}
PUT    /api/v1/leaves/{id}/approve
PUT    /api/v1/leaves/{id}/reject
GET    /api/v1/leaves/balance              # Saldo do funcionário
```

#### Payroll
```
GET    /api/v1/payroll/periods
POST   /api/v1/payroll/periods             # Abrir período
GET    /api/v1/payroll/periods/{id}
POST   /api/v1/payroll/periods/{id}/process    # Processar
POST   /api/v1/payroll/periods/{id}/approve    # Aprovar
POST   /api/v1/payroll/periods/{id}/close      # Fechar
GET    /api/v1/payroll/records             # Registos do período
GET    /api/v1/payroll/records/{id}
GET    /api/v1/payroll/records/{id}/payslip    # Recibo PDF
```

#### Documents
```
GET    /api/v1/documents
POST   /api/v1/documents                   # Upload
GET    /api/v1/documents/{id}
DELETE /api/v1/documents/{id}
GET    /api/v1/documents/{id}/download
```

#### Reports
```
POST   /api/v1/reports/generate            # Gerar relatório
GET    /api/v1/reports/{id}                # Download
```

### Padrão de Resposta

```json
{
  "success": true,
  "data": { ... },
  "message": "Operação realizada com sucesso",
  "meta": {
    "current_page": 1,
    "last_page": 10,
    "per_page": 15,
    "total": 145
  },
  "errors": null
}
```

### Padrão de Erro

```json
{
  "success": false,
  "data": null,
  "message": "Erro de validação",
  "errors": {
    "email": ["O email é obrigatório"],
    "password": ["A password deve ter pelo menos 8 caracteres"]
  }
}
```

---

## 20. Integrações

### Atuais (nenhuma — greenfield)

### Planeadas

| Integração | Tipo | Prioridade | Descrição |
|------------|:----:|:----------:|-----------|
| SMTP | Sistema | P0 | Envio de emails transacionais |
| S3 Storage | Sistema | P0 | Armazenamento de documentos e fotos |
| Dispositivos de Presença | API | P3 | Leitor biométrico, terminais RFID |
| Gateway de Pagamento | API | P3 | Processamento de pagamentos salariais |
| Banco API | API | P3 | Transferências bancárias automáticas |
| Google Calendar | API | P3 | Sincronização de férias/eventos |
| Slack/Teams | Webhook | P3 | Notificações de aprovação |
| SMS Gateway | API | P3 | Notificações SMS |
| Gov (Tributação) | API | P3 | Submissão de declarações fiscais |

### Contrato de Integração

Todas as integrações externas devem usar:
- Interface/Contrato abstrato
- Implementação concreta injetada via Service Provider
- Fallback quando o serviço externo estiver indisponível
- Logs de todas as chamadas externas

---

## 21. Internacionalização

### Idiomas iniciais

| Código | Idioma | Prioridade |
|--------|--------|:----------:|
| `pt` | Português | P0 |
| `en` | Inglês | P1 |
| `fr` | Francês | P2 |
| `zh` | Chinês | P3 |

### Backend (Laravel)

- Utilizar o sistema nativo de localização (`lang/` directory)
- Strings em arquivos JSON: `lang/pt.json`, `lang/en.json`
- Datas formatadas com `Carbon::setLocale()`
- Mensagens de validação traduzidas
- Números formatados com `NumberFormatter`

### Frontend (React)

- `i18next` + `react-i18next`
- Arquivos de tradução em `frontend/src/locales/{lang}.json`
- `LngDetector` para detetar idioma do browser
- `Trans` component para traduções com placeholders
- `date-fns` com locale para formatação de datas
- Moeda formatada com `Intl.NumberFormat`

### Configurações por utilizador/tenant

- `locale` na tabela `users` (sobrepõe o idioma do sistema)
- `locale` na tabela `tenants` (idioma padrão da empresa)
- Timezone configurável por tenant
- Formato de data configurável (d/m/Y, m/d/Y, Y-m-d)
- Moeda (AOA, USD, EUR, etc.) configurável por tenant

---

## 22. Performance

### Princípios

1. **N+1 queries** — zero tolerância, usar eager loading (`with()`) sempre
2. **Paginação** — obrigatória em todas as listagens (15-25 por página)
3. **Índices** — criar índices para colunas usadas em WHERE, ORDER BY, JOIN
4. **Cache** — dados de leitura frequente em cache Redis
5. **Processamento assíncrono** — payroll, relatórios, emails em filas
6. **Lazy loading** — carregar componentes React apenas quando necessário
7. **Code splitting** — React lazy routes
8. **Otimização de assets** — Vite para build, árvore de módulos

### Métricas-alvo

| Operação | Tempo máximo |
|----------|:------------:|
| Carregamento de página (vazia) | < 1.5s |
| Listagem com paginação | < 500ms |
| Detalhes de um recurso | < 300ms |
| Cálculo de payroll (100 funcionários) | < 30s (fila) |
| Geração de relatório | < 10s (fila) |
| Upload de documento | < 5s (10MB) |
| Pesquisa global | < 1s |

### Estratégia de cache

| Dado | Cache | TTL |
|------|-------|:---:|
| Configurações do tenant | Redis | 1 hora |
| Permissões do utilizador | Redis | 30 min |
| Saldo de férias | Redis | 5 min |
| Contagem de dashboard | Redis | 15 min |
| Lista de departamentos | Redis | 1 hora |
| Sessões | Redis | Configurável |
| Traduções | Redis | 24 horas |

---

## 23. Cache

### Stack

- **Redis 6+** como driver de cache principal
- **Laravel Cache** facade para operações de cache
- **Cache tags** para invalidação em grupo (ex: `tenant:1:employees`)

### Configuração

```env
CACHE_DRIVER=redis
REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379
```

### Estratégia

```php
// Cache com tags para invalidação por contexto
Cache::tags(['tenant:'.$tenantId, 'employees'])->remember('employees.count', 3600, function () {
    return Employee::where('tenant_id', $tenantId)->count();
});

// Invalidar quando um employee é criado/alterado
Cache::tags(['tenant:'.$tenantId, 'employees'])->flush();
```

---

## 24. Filas

### Stack

- **Redis** como driver de filas
- **Laravel Horizon** para monitorização e configuração

### Configuração Horizon

```env
QUEUE_CONNECTION=redis
```

### Filas e prioridades

| Fila | Prioridade | Processos | Uso |
|------|:----------:|:---------:|-----|
| `high` | 1 | 3 | Payroll, notificações críticas |
| `default` | 2 | 2 | Emails, geração de recibos |
| `low` | 3 | 1 | Relatórios, exportações, limpeza |
| `reports` | 3 | 2 | Geração de relatórios pesados |

### Jobs principais

- `ProcessPayrollJob` — processamento salarial de um período
- `GeneratePayslipJob` — geração de recibo individual
- `SendEmailNotificationJob` — envio de email
- `GenerateReportJob` — geração de relatório
- `ProcessLeaveJob` — atualiza saldo após aprovação
- `SyncAttendanceJob` — sincroniza dispositivos externos
- `CleanupAuditLogsJob` — limpeza de logs antigos (agendado)
- `SendPayrollSummaryJob` — resumo para gestores

---

## 25. Storage

### Stack

- **S3** ou **MinIO** (compatível com S3) para armazenamento de ficheiros
- **Laravel Filesystem** com disco S3 configurado

### Estrutura de diretórios

```
tenants/{tenant_id}/
├── employees/
│   ├── {employee_id}/
│   │   ├── photos/
│   │   ├── documents/
│   │   │   ├── contracts/
│   │   │   ├── id_documents/
│   │   │   ├── certificates/
│   │   │   └── payslips/
│   │   └── submissions/
│   └── ...
├── company/
│   ├── logo.png
│   └── documents/
├── templates/
│   ├── email/
│   ├── contracts/
│   └── reports/
└── temporary/
```

### Configuração

```env
FILESYSTEM_DISK=s3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=
AWS_BUCKET=
AWS_URL=
```

### Políticas

- Uploads validados por tipo MIME real (não extensão)
- Tamanho máximo: 10MB por ficheiro (documentos), 2MB (fotos)
- Documentos sensíveis encriptados em repouso
- URLs temporários (pre-signed) para download, com expiração
- Acesso controlado por Policy (apenas owner e superiores)

---

## 26. Logs

### Stack

- **Laravel Log** (Monolog)
- Driver: `daily` (rotação diária, 30 dias de retenção)
- Canal separado para erros: `stack`

### Configuração

```env
LOG_CHANNEL=stack
LOG_LEVEL=debug  # production: warning
```

### Canais

| Canal | Nível | Conteúdo |
|-------|:-----:|----------|
| `stack` | debug | Tudo (dev) |
| `daily` | warning | Erros de produção |
| `payroll` | info | Operações de payroll |
| `audit` | info | Auditoria (separado) |
| `api` | info | Chamadas API |
| `security` | warning | Tentativas de acesso não autorizado |

### Regras

- Nunca logar passwords, tokens, ou dados pessoais (CPF, NIF, BI)
- Logs de auditoria num canal separado, com retenção de 1 ano
- Logs de segurança com retenção de 1 ano
- Logs de produção retidos por 30 dias

---

## 27. Auditoria

### Stack

- **Tabela `audits` no MySQL** (tabela relacional, não driver)
- **OwenIt/laravel-auditing** ou implementação custom com Traits

### Eventos auditados

| Evento | Descrição |
|--------|-----------|
| `login` | Login do utilizador |
| `logout` | Logout do utilizador |
| `created` | Criação de registo |
| `updated` | Atualização de registo |
| `deleted` | Soft delete de registo |
| `restored` | Restauro de registo |
| `force_deleted` | Hard delete |
| `approved` | Aprovação de solicitação |
| `rejected` | Rejeição de solicitação |
| `processed` | Processamento de payroll |
| `closed` | Fechamento de período |
| `exported` | Exportação de dados |
| `downloaded` | Download de documento |
| `configured` | Alteração de configuração |
| `permission_changed` | Alteração de permissões |

### Implementação

```php
// App\Traits\Auditable
trait Auditable
{
    protected static function bootAuditable(): void
    {
        static::created(function ($model) {
            Audit::log('created', $model);
        });
        // ... outros eventos
    }
}

// Modelos auditable
class Employee extends Model
{
    use Auditable, HasTenant;
    // ...
}
```

### Visualização

- **Filament**: Resource de Audit com filtros por tipo, recurso, utilizador, data
- **React**: Activity feed no perfil do funcionário, timeline de alterações

---

## 28. Testes

### Stack

- **PHPUnit** (Laravel) / **Pest** para testes PHP
- **Playwright** para testes E2E (futuro)
- **Laravel Dusk** para testes de browser (opcional)

### Cobertura-alvo

| Tipo | Cobertura | Prioridade |
|------|:---------:|:----------:|
| Unit (Models, Services) | 90%+ | P0 |
| Feature (API endpoints) | 85%+ | P0 |
| Integration (Payroll, workflows) | 80%+ | P1 |
| Authorization (Policies) | 100% | P0 |
| Tenant isolation | 100% | P0 |
| E2E (Playwright) | 60%+ | P3 |

### O que testar

#### Payroll Engine (crítico)
- Cálculo de salário base
- Cálculo de horas extras (50% e 100%)
- Cálculo de faltas e atrasos
- Cálculo de INSS/IRT
- Cálculo de subsídios
- Cálculo de empréstimos e adiantamentos
- Cenários: salário mínimo, salário máximo, zero horas, ausência total
- Isolamento: payroll de um tenant não afeta outro

#### Autorização
- Cada ação de cada role
- Acesso a dados de outro tenant
- Tentativas de acesso não autorizado

#### API
- CRUD completo de cada recurso
- Validação de inputs
- Paginação e filtros
- Rate limiting

#### Workflows
- Ciclo completo de férias (solicitar → aprovar → rejeitar)
- Ciclo completo de payroll (abrir → processar → aprovar → fechar)
- Upload e download de documentos

### Exemplo de teste

```php
// tests/Feature/Payroll/PayrollCalculationTest.php
test('calculo de salario liquido com subsidio e desconto', function () {
    $employee = Employee::factory()->create(['base_salary' => 350000]);
    $period = PayrollPeriod::factory()->create();
    
    // Configurar componente de salário + subsídio + INSS
    SalaryComponent::factory()->create([
        'code' => 'base_salary',
        'type' => 'earning',
        'calculation_type' => 'fixed',
    ]);
    // ...
    
    $engine = app(PayrollEngineService::class);
    $result = $engine->calculate($employee, $period);
    
    expect($result->net_salary)->toBe(315275.00); // valor esperado
});

test('isolamento de payroll entre tenants', function () {
    $tenant1 = Tenant::factory()->create();
    $tenant2 = Tenant::factory()->create();
    
    $employee1 = Employee::factory()->for($tenant1)->create();
    $employee2 = Employee::factory()->for($tenant2)->create();
    
    // Payroll do tenant1 não deve incluir employee2
    $records = PayrollRecord::where('tenant_id', $tenant1->id)->get();
    expect($records)->not->toContain($employee2->id);
});
```

---

## 29. Roadmap

### Fase 1 — Fundação (P0) — Semanas 1-4

| Semana | Atividades |
|:------:|------------|
| **1** | Setup Laravel + React, configuração inicial, autenticação, RBAC, multi-tenancy |
| **2** | Modelos: Tenant, Branch, Department, Position, Employee, Contract. Migrations + Seeders |
| **3** | API Employees, API Departments, API Contracts. Design System (shadcn/ui) + Layout |
| **4** | Dashboard RH (KPI cards + gráficos ECharts). CRUD Employees completo no React |

### Fase 2 — Payroll (P0) — Semanas 5-8

| Semana | Atividades |
|:------:|------------|
| **5** | Payroll Engine: Salary Components, regras configuráveis |
| **6** | Payroll Engine: cálculos, IRS, INSS, horas extras, faltas |
| **7** | Payroll Periods, Processamento, Aprovação, Fechamento |
| **8** | Recibos de Vencimento (PDF), upload/download, disponibilização |

### Fase 3 — Presenças e Férias (P1) — Semanas 9-12

| Semana | Atividades |
|:------:|------------|
| **9** | Presenças: clock-in/out, registo manual, histórico |
| **10** | Férias: tipos, saldo, solicitação, aprovação, calendário |
| **11** | Horários e Turnos: configuração, atribuição |
| **12** | Dashboard Manager, Portal do Funcionário |

### Fase 4 — Documentos, Configurações, Notificações (P1) — Semanas 13-14

| Semana | Atividades |
|:------:|------------|
| **13** | Gestão documental, upload, S3 storage, templates |
| **14** | Configurações, Notificações, Email, Traduções (pt + en) |

### Fase 5 — Funcionalidades Avançadas (P2) — Semanas 15-20

| Semana | Atividades |
|:------:|------------|
| **15** | QR Code para presenças, Recrutamento básico |
| **16** | Onboarding, Avaliação de Desempenho |
| **17** | Formação, Benefícios e Descontos |
| **18** | Relatórios (headcount, payroll, turnover, presenças) |
| **19** | Pesquisa Global, Auditoria, Dashboard Super Admin |
| **20** | Refinamento, testes, correções, documentação |

### Fase 6 — Internacionalização e Finalização (P2) — Semanas 21-22

| Semana | Atividades |
|:------:|------------|
| **21** | Traduções: Francês, Chinês. Ajustes de timezone/moeda/data |
| **22** | Testes de carga, segurança, performance. Preparação para produção |

### Fase 7 — Evolução (P3) — Futuro

- MFA
- API pública
- Integração bancária
- Marketplace de regras
- Portal do candidato
- Dispositivos de presença

---

## 30. Critérios de Aceitação

### Critérios gerais para cada módulo

| # | Critério | Obrigatório |
|---|----------|:-----------:|
| 1 | Backend funcional (API endpoints operacionais) | Sim |
| 2 | Banco de dados com migrations corretas | Sim |
| 3 | Modelos com fillable, casts, relações, scopes | Sim |
| 4 | Form Requests com validação | Sim |
| 5 | Policies implementadas para todas as ações | Sim |
| 6 | Permissões no seeder | Sim |
| 7 | API Resources com dados corretos | Sim |
| 8 | Frontend React integrado com API real | Sim |
| 9 | UI/UX completa (loading, empty, error states) | Sim |
| 10 | Responsividade funcional | Sim |
| 11 | Traduções (pt + en) | Sim |
| 12 | Testes unitários/feature | Sim |
| 13 | Testes de autorização | Sim |
| 14 | Testes de isolamento (tenant) | Sim |
| 15 | Auditoria implementada | Sim |
| 16 | Sem erros de linting/typecheck | Sim |
| 17 | Sem vulnerabilidades de segurança conhecidas | Sim |

### Critérios específicos por módulo

#### Payroll
- [ ] Cálculo correto de salário base
- [ ] Cálculo correto de horas extras (50% e 100%)
- [ ] Cálculo correto de faltas e atrasos
- [ ] Cálculo correto de INSS/IRT
- [ ] Cálculo correto de subsídios
- [ ] Cálculo correto de empréstimos/adiantamentos
- [ ] Breakdown detalhado no JSON `details`
- [ ] Recibo PDF com todos os campos obrigatórios
- [ ] Workflow de aprovação funcional
- [ ] Período fechado não permite alterações
- [ ] Isolamento entre tenants validado

#### Presenças
- [ ] Registo de entrada e saída funcional
- [ ] Cálculo de horas trabalhadas correto
- [ ] Marcação de atrasos automática
- [ ] Justificação de faltas funcional
- [ ] QR Code funcional e seguro (não reutilizável)

#### Férias
- [ ] Saldo calculado corretamente
- [ ] Solicitação com verificação de saldo
- [ ] Fluxo de aprovação/rejeição funcional
- [ ] Atualização automática do saldo após aprovação
- [ ] Calendário com férias marcadas

---

## 31. Dependências

### Dependências entre módulos

```
Tenant ──────┬── Auth ─── RBAC ─── Employees ──┬── Contracts ──┬── Payroll
             │                                  │               │
             │                                  │               ├── Payslips
             │                                  │               │
             │                                  ├── Attendance  │
             │                                  │               │
             │                                  ├── Leave       │
             │                                  │               │
             │                                  ├── Documents   │
             │                                  │               │
             │                                  ├── Benefits    │
             │                                  │               │
             │                                  └── Performance │
             │                                                  │
             ├── Departments ── Positions                       │
             │                                                  │
             ├── Settings ── Notifications                      │
             │                                                  │
             └── Audit ── Logs                                  │
```

### Dependências de pacotes

#### Laravel
```json
{
    "require": {
        "php": "^8.4",
        "laravel/framework": "^12.0",
        "laravel/sanctum": "^4.0",
        "laravel/horizon": "^5.0",
        "spatie/laravel-permission": "^6.0",
        "spatie/laravel-activitylog": "^4.0",
        "spatie/laravel-translatable": "^6.0",
        "barryvdh/laravel-dompdf": "^3.0",
        "simplesoftwareio/simple-qrcode": "^4.0",
        "mcamara/laravel-localization": "^2.0",
        "filament/filament": "^3.0",
        "filament/spatie-laravel-permission": "^3.0",
        "predis/predis": "^2.0",
        "guzzlehttp/guzzle": "^7.0",
        "league/flysystem-aws-s3-v3": "^3.0"
    },
    "require-dev": {
        "pestphp/pest": "^3.0",
        "pestphp/pest-plugin-laravel": "^3.0",
        "laravel/pint": "^1.0",
        "phpstan/phpstan": "^2.0",
        "nunomaduro/collision": "^8.0"
    }
}
```

#### React
```json
{
    "dependencies": {
        "react": "^19.0",
        "react-dom": "^19.0",
        "react-router-dom": "^7.0",
        "react-hook-form": "^7.0",
        "@hookform/resolvers": "^4.0",
        "zod": "^3.0",
        "zustand": "^5.0",
        "@tanstack/react-query": "^5.0",
        "axios": "^1.0",
        "i18next": "^24.0",
        "react-i18next": "^15.0",
        "echarts": "^5.0",
        "echarts-for-react": "^3.0",
        "date-fns": "^4.0",
        "date-fns-tz": "^3.0",
        "lucide-react": "^0.400",
        "react-dropzone": "^14.0",
        "@react-pdf/renderer": "^4.0",
        "qrcode.react": "^4.0",
        "tailwindcss": "^4.0",
        "tailwindcss-animate": "^1.0",
        "class-variance-authority": "^0.7",
        "clsx": "^2.0",
        "tailwind-merge": "^3.0",
        "@radix-ui/react-*": "^1.0"
    },
    "devDependencies": {
        "typescript": "^5.0",
        "vite": "^6.0",
        "@vitejs/plugin-react": "^4.0",
        "eslint": "^9.0",
        "prettier": "^3.0",
        "prettier-plugin-tailwindcss": "^0.6",
        "@types/react": "^19.0",
        "@types/react-dom": "^19.0"
    }
}
```

---

## 32. Riscos

### Risco Técnico

| Risco | Probabilidade | Impacto | Mitigação |
|-------|:-------------:|:-------:|-----------|
| Complexidade do Payroll Engine para múltiplos países | Média | Alto | Motor de regras configurável, testes unitários exaustivos, validação com especialistas |
| Performance com 100k+ funcionários | Baixa | Alto | Índices, cache, paginação, processamento assíncrono, monitorização |
| Isolamento de dados quebrado | Baixa | Crítico | Testes de isolamento obrigatórios em CI, code review, Global Scopes |
| Conflitos entre React e Filament na mesma rota | Média | Médio | Separação clara de rotas: React para SPA, Filament para /admin |
| Dependências com falhas de segurança | Baixa | Médio | `composer audit` e `npm audit` em CI, atualizações regulares |

### Risco de Produto

| Risco | Probabilidade | Impacto | Mitigação |
|-------|:-------------:|:-------:|-----------|
| Requisitos de payroll angolano incompletos | Média | Alto | Pesquisa de legislação, validação com contadores, motor flexível |
| Bitola de escopo | Alta | Alto | Roadmap P0-P3, controlo de alterações, reuniões de priorização |
| Falta de adoção por UX pobre | Média | Alto | UI/UX profissional, testes com utilizadores reais, iteração constante |
| Dificuldade em configurar para outro país | Média | Médio | Arquitetura configurável, documentação, seeds de configuração por país |

### Risco de Projeto

| Risco | Probabilidade | Impacto | Mitigação |
|-------|:-------------:|:-------:|-----------|
| Estimativas irrealistas | Alta | Alto | Desenvolvimento iterativo, priorização clara, revisão semanal |
| Perda de contexto/documentação | Média | Médio | MASTER_DEVELOPMENT_PLAN como fonte de verdade, documentação inline |
| Single point of failure | Média | Alto | CI/CD, backups, git, ambientes dev/staging/production |

---

## 33. Estratégia de Migração

### Situação atual

**Greenfield** — sem dados existentes para migrar.

### Estratégia

1. **Setup inicial** — criar repositório git, estrutura de diretórios, configurações base
2. **Instalação Laravel** — `composer create-project laravel/laravel`
3. **Instalação React** — Vite + React + TypeScript dentro do mesmo repositório
4. **Configuração de ambiente** — `.env` com MySQL, Redis, S3
5. **Migrations** — criar todas as migrations da fase P0, rodar `php artisan migrate`
6. **Seeders** — criar seeders para roles, permissions, super admin, configurações globais
7. **Instalação Filament** — `composer require filament/filament`, configurar painel
8. **Desenvolvimento** — por módulo, conforme roadmap

### Futura migração de dados (quando houver clientes)

- Script Artisan `php artisan migrate:import {tenant_id} {file}`
- Suporte a CSV, Excel, JSON
- Validação de dados antes da importação
- Relatório de erros com linhas rejeitadas
- Rollback em caso de falha crítica

---

## Apêndice A — Configurações Iniciais

### `.env` base

```env
APP_NAME=HRMS
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=hrms
DB_USERNAME=root
DB_PASSWORD=

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

CACHE_DRIVER=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis

FILESYSTEM_DISK=local
# FILESYSTEM_DISK=s3
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_DEFAULT_REGION=
# AWS_BUCKET=

MAIL_MAILER=smtp
MAIL_HOST=mailpit
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS="hello@example.com"
MAIL_FROM_NAME="${APP_NAME}"

SANCTUM_STATEFUL_DOMAINS=localhost,localhost:5173
SESSION_DOMAIN=localhost
```

### Git init

```bash
cd /var/www/html/RH
git init
echo "/vendor/\n/node_modules/\n.env\n/storage/\n" > .gitignore
```

---

## Apêndice B — Comandos Makefile

```makefile
.PHONY: install dev migrate seed test lint

install:
	cd backend && composer install && cp .env.example .env
	cd frontend && npm install

dev:
	cd backend && php artisan serve &
	cd frontend && npm run dev &

migrate:
	cd backend && php artisan migrate:fresh --seed

seed:
	cd backend && php artisan db:seed

test:
	cd backend && php artisan test

lint:
	cd backend && ./vendor/bin/pint
	cd frontend && npm run lint

stan:
	cd backend && ./vendor/bin/phpstan analyse

horizon:
	cd backend && php artisan horizon

queue:
	cd backend && php artisan queue:work
```

---

## Apêndice C — Decisões Arquiteturais Registadas

| # | Decisão | Justificação | Data |
|---|---------|-------------|:----:|
| 1 | Single Database + tenant_id vs bancos separados | Menor complexidade operacional, backup único, custo reduzido. Isolamento via Global Scopes + testes | 2026-09-03 |
| 2 | React SPA vs Inertia/Livewire | Experiência de utilizador premium, ecossistema rico de componentes, facilidade de contratação | 2026-09-03 |
| 3 | Filament apenas para backoffice admin | Não substituir a experiência React, usar onde faz sentido (admin técnico, CRUDs internos) | 2026-09-03 |
| 4 | Sanctum (token) vs Passport | Simplicidade, suficiente para as necessidades, SPA authentication | 2026-09-03 |
| 5 | ECharts vs Recharts/Chart.js | Maior variedade de gráficos, heatmaps, radar, mapas, melhor performance com grandes datasets | 2026-09-03 |
| 6 | Payroll Engine com regras configuráveis vs hardcoded | Suporte a múltiplos países/empresas sem reescrever o motor | 2026-09-03 |
| 7 | Soft deletes em entidades principais | Rastreabilidade, recuperação de dados, compliance | 2026-09-03 |
| 8 | Cache com Redis tags | Invalidação granular por contexto (tenant, módulo) | 2026-09-03 |
| 9 | Queue-first para operações pesadas | Performance da API, experiência do utilizador não bloqueante | 2026-09-03 |
| 10 | Zod + React Hook Form para validação | Tipagem forte, validação síncrona com schemas partilháveis | 2026-09-03 |

---

**Fim do MASTER DEVELOPMENT PLAN**

> Este documento é a fonte de verdade do projeto. Qualquer alteração arquitetural, de escopo ou de prioridade deve ser registada no Apêndice C e justificada. Nenhuma implementação deve começar antes da validação deste plano.