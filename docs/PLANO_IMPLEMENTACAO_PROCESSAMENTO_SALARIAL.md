# Plano de Implementação do Processamento Salarial — Humancore

**Versão:** 2.0  
**Data:** Novembro de 2026  
**Âmbito:** Evolução do processamento salarial para cálculo automático, auditável e parametrizado para Angola  
**Referências:** [Especificação funcional](especificacao_processamento_salarial_angola.md) · [Avaliação do estado actual](../brain/1dcc5fb8-c2c4-4d88-84d1-6a8f9ff1c352/avaliacao_plano_salarial.md)

> Este plano não constitui validação jurídica, fiscal ou contabilística. Nenhuma taxa, tabela, incidência ou fórmula deve ser activada para produção sem fonte oficial, período de vigência e validação profissional registados.

---

## 1. Contexto e ponto de partida

O sistema já tem uma base funcional. Esta secção documenta o que existe e o que ainda é necessário para não repetir trabalho nem destruir o que já funciona.

### 1.1. O que existe e está funcional

| Componente | Localização | Estado |
|---|---|---|
| Tabelas `payroll_periods` e `payroll_records` | `migrations/2026_09_03_100012/13` | ✅ Funcional — estados e campos básicos |
| Catálogo `salary_components` e atribuição `employee_salary_components` | `migrations/2026_09_03_100010/11` | ✅ Existe — faltam campos de natureza e incidências |
| **`salary_component_regulations`** com incidências versionadas (INSS trab/patron/IRT), vigência, validação, revogação e documento legal | `migrations/2026_11_03_153612` e seguintes | ✅ **Implementada recentemente** — bem estruturada |
| `PayrollEngineService` com pipeline de regras (`BaseSalary`, `Subsidy`, `Overtime`, `Absence`, `Lateness`, `INSS`, `IRT`) | `app/Services/Payroll/` | ✅ Arquitectura extensível — cálculos provisórios |
| `ProcessPayrollJob` assíncrono | `app/Jobs/` | ✅ Existe — sem idempotência explícita |
| API de períodos (create/list/show/process/approve/close/records) | `routes/api.php` | ✅ Existe — faltam simulate, submit, reopen, pay |
| API de regulações (CRUD/validate/activate/revoke/download) | `routes/api.php` | ✅ Completa |
| UI de períodos (lista, criar, process/approve/close) | `payroll-periods-page.tsx` | ✅ Funcional — estados limitados |
| UI de regulações (componentes + incidências + workflow de validação) | `salary-component-regulations-page.tsx` | ✅ Mais completa do módulo |
| UI de detalhe do período (tabela de records + download recibo) | `payroll-period-detail-page.tsx` | 🟡 Mínimo — sem KPIs, tabs, alertas |
| Testes de integração: ciclo, INSS, recibo, isolamento tenant | `PayrollTest.php`, `SalaryComponentRegulationTest.php` | ✅ Base existente |

### 1.2. Gaps críticos identificados

1. **Bug no algoritmo IRT**: `IRTRule::calculate()` não aplica a fórmula progressiva com parcela fixa correctamente. Resultados são incorrectos para qualquer trabalhador acima do primeiro escalão.
2. **Motor não usa `salary_component_regulations`**: as incidências configuradas não têm efeito no cálculo actual. `INSSRule` usa `base_salary` directamente; `IRTRule` usa escalões hardcoded.
3. **Taxas e escalões não existem como entidades**: a tabela de regulações guarda *se* um componente incide (booleano), não *quanto* (taxas, escalões IRT). Precisam de tabelas separadas.
4. **INSS patronal não calculado nem persistido**: `payroll_records` não tem campo para encargo patronal.
5. **Erros silenciosos**: `processPeriod()` captura excepções por trabalhador e fecha o período como `completed` mesmo com falhas.
6. **Contrato activo actual ≠ contrato vigente no período**: `activeContract()->first()` pode seleccionar o contrato errado em cenários de alteração salarial.
7. **Sem snapshot imutável**: `updateOrCreate` substitui o cálculo anterior sem preservar versões.
8. **Precisão**: motor usa `float` sem política de arredondamento definida.

### 1.3. Princípios de implementação

1. **Preservar o que funciona**: migrações aditivas, não destrutivas; folhas existentes não são reprocessadas.
2. **Configuração legal, nunca pressuposição**: valores legais são dados versionados e validados, não constantes.
3. **Separação contabilística**: bruto, descontos do trabalhador, INSS patronal, IRT e líquido são totais sempre distintos.
4. **Reprodutibilidade**: folha fechada conserva snapshot de contratos, componentes, regras e versão do motor.
5. **Validação antes de aprovação**: lacunas e erros impeditivos bloqueiam o fecho.
6. **Padrão de código existente**: Form Requests, Resources, Policies, TanStack Query, Tailwind — seguir o padrão da `EmployeeDetailPage` para design e fluxo de UI.
7. **Sem execução de código arbitrário**: fórmulas representadas como dados estruturados, não PHP/SQL dinâmico.

---

## 2. Arquitectura funcional

### 2.1. Máquina de estados do período

```
draft ──► in_simulation ──► pending_validation ──► pending_approval ──► approved ──► closed ──► paid
              │                     │
              ▼                     ▼
           failed               failed (erros impeditivos)
```

**Transições:**
- `draft → in_simulation`: ao iniciar simulação (job assíncrono)
- `in_simulation → pending_validation`: simulação concluída (com ou sem avisos)
- `in_simulation → failed`: erros que impedem continuar (sem contrato, sem regra activa)
- `pending_validation → pending_approval`: RH confirma que corrigiu avisos
- `pending_approval → approved`: aprovador executa aprovação
- `pending_approval → pending_validation`: aprovador rejeita (com motivo)
- `approved → closed`: fecho bloqueia alterações; snapshot imutável
- `closed → paid`: registo de pagamento
- `closed → draft` (reabertura): com permissão, motivo e preservação da versão anterior

### 2.2. Fluxo do motor de cálculo por trabalhador

```
1. Carregar contrato vigente no período (não o actual)
2. Validar pré-condições (contrato, regras activas, ocorrências)
3. Recolher componentes vigentes e as suas incidências validadas
4. Calcular cada componente (valor fixo / percentagem / horas)
5. Agregar base INSS trabalhador (componentes com employee_inss_applicable = true)
6. Agregar base INSS patronal (componentes com employer_inss_applicable = true)
7. Calcular INSS trabalhador e INSS patronal com taxa da regra versionada
8. Agregar base IRT (componentes com irt_applicable = true) − deduções
9. Calcular IRT com tabela de escalões versionada (parcela fixa + taxa × excesso)
10. Calcular outros descontos autorizados
11. Calcular líquido = bruto − INSS trab − IRT − outros descontos
12. Calcular custo patronal = bruto + INSS patronal
13. Validar invariantes (soma dos itens = totais; líquido ≥ 0 ou tratar conforme política)
14. Persistir items discriminados + snapshot + erros/avisos
```

---

## 3. Fases de implementação

As fases são sequenciais dentro de cada iteração backend→frontend→testes. Cada fase tem saídas verificáveis antes de passar à seguinte.

---

## FASE 0 — Correcções urgentes e estabilização (Pré-requisito)

> **Âmbito:** Corrigir bugs activos e preparar a base sem quebrar o que existe.  
> **Duração estimada:** 2–3 dias  
> **Bloqueante para:** todas as fases seguintes

### Backend

#### 0.1 Corrigir o bug de escalões IRT

Reescrever `IRTRule::calculate()` com a fórmula correcta:

```
IRT = parcela_fixa + (matéria_colectável − limite_inferior_do_escalão) × taxa
```

A estrutura de escalões deve suportar `lower_bound`, `upper_bound` (null = infinito), `rate` e `fixed_amount`.

#### 0.2 Substituir erros silenciosos por registo estruturado

Em `PayrollEngineService::processPeriod()`, substituir o `catch(\Throwable)` silencioso por:
- recolha de erros por trabalhador num array estruturado `['employee_id', 'code', 'message', 'is_blocking']`
- persistência no campo `validation_errors` do record (migration aditiva)
- período termina como `failed` se houver erros impeditivos; `pending_validation` se houver apenas avisos

#### 0.3 Adicionar campo `validation_errors` ao `payroll_records`

```php
// migration aditiva
$table->json('validation_errors')->nullable()->after('details');
$table->string('currency', 3)->default('AOA')->after('net_salary');
```

### Testes de aceitação (Fase 0)

- [x] `IRTRule`: trabalhador com 150 000 Kz produz IRT ≠ 0 e corresponde ao valor esperado do escalão aplicável
- [x] `IRTRule`: trabalhador com 600 000 Kz produz IRT no escalão correcto (verificado manualmente com tabela oficial)
- [x] `processPeriod()`: trabalhador sem contrato gera erro impeditivo em `validation_errors`; os restantes continuam
- [x] Período com erros impeditivos não fica `completed`; fica `failed` ou `pending_validation`

---

## FASE 1 — Modelo de regras legais versionadas (Infra-estrutura)

> **Âmbito:** Criar as entidades para taxas INSS e tabelas IRT versionadas. A `salary_component_regulations` já existe e cobre as incidências — esta fase acrescenta os valores das taxas e escalões.  
> **Duração estimada:** 4–5 dias  
> **Bloqueante para:** Fases 2 e seguintes

### Backend

#### 1.1 Migração: `payroll_inss_rules`

```
payroll_inss_rules
├── id
├── tenant_id (FK tenants)
├── country_code (char 2, default 'AO')
├── regime_code (string, default 'standard')
├── version (smallint)
├── employee_rate (decimal 6,4)        -- taxa do trabalhador (ex: 3.0000)
├── employer_rate (decimal 6,4)        -- taxa patronal (ex: 8.0000)
├── max_base (decimal 15,2, nullable)  -- limite máximo da base contributiva
├── effective_from (date)
├── effective_to (date, nullable)
├── legal_source (text, nullable)
├── legal_reference (string, nullable)
├── validated_at (timestamp, nullable)
├── validated_by (FK users, nullable)
├── status (enum: draft/validated/active/revoked)
├── revoked_at, revoked_by, revocation_reason
└── timestamps

UNIQUE (tenant_id, country_code, regime_code, version)
INDEX (tenant_id, status, effective_from, effective_to)
```

#### 1.2 Migração: `payroll_irt_tables`

```
payroll_irt_tables
├── id
├── tenant_id (FK tenants)
├── country_code (char 2, default 'AO')
├── regime_code (string, default 'standard')
├── version (smallint)
├── effective_from (date)
├── effective_to (date, nullable)
├── brackets (json)  -- array de {lower_bound, upper_bound|null, rate, fixed_amount}
├── legal_source (text, nullable)
├── legal_reference (string, nullable)
├── validated_at, validated_by, status (mesmo padrão do INSS)
├── revoked_at, revoked_by, revocation_reason
└── timestamps

UNIQUE (tenant_id, country_code, regime_code, version)
INDEX (tenant_id, status, effective_from)
```

**Formato de `brackets`:**
```json
[
  {"lower_bound": 0,       "upper_bound": 100000,  "rate": 0,  "fixed_amount": 0},
  {"lower_bound": 100000,  "upper_bound": 200000,  "rate": 7,  "fixed_amount": 0},
  {"lower_bound": 200000,  "upper_bound": 500000,  "rate": 11, "fixed_amount": 7000},
  {"lower_bound": 500000,  "upper_bound": 1000000, "rate": 15, "fixed_amount": 40000},
  {"lower_bound": 1000000, "upper_bound": null,    "rate": 19, "fixed_amount": 115000}
]
```
> Os valores acima são **ilustrativos**. Devem ser substituídos pela tabela oficial validada antes de qualquer activação.

#### 1.3 Modelos e scopes

Criar `PayrollInssRule` e `PayrollIrtTable` com:
- `HasTenant`, `HasFactory`, `Auditable`
- scope `effectiveFor(date, country, regime)` → retorna a versão `active` que cobre a data
- scope `noOverlap(country, regime, from, to)` → valida ausência de sobreposição antes de activar
- casts para decimais (`employee_rate`, `employer_rate`, `max_base`)
- casts de `brackets` como array JSON

#### 1.4 Controllers e Form Requests

Criar `PayrollInssRuleController` e `PayrollIrtTableController` com operações:
- `index`, `store` (cria como `draft`), `update` (só `draft`), `show`
- `validate` → `draft → validated` (exige campos obrigatórios preenchidos)
- `activate` → `validated → active` (verifica ausência de sobreposição de vigências)
- `revoke` → `active/validated → revoked` (exige motivo)

Usar o padrão `BaseController` com `success()` / `error()` / `paginated()` já estabelecido.

#### 1.5 Resources e Policies

- `PayrollInssRuleResource` e `PayrollIrtTableResource` seguindo o padrão dos recursos existentes
- `PayrollInssRulePolicy` e `PayrollIrtTablePolicy` com permissões `viewAny`, `create`, `update`, `validate`, `activate`, `revoke`

#### 1.6 Rotas

```php
// Regras INSS
Route::get('payroll/inss-rules', [PayrollInssRuleController::class, 'index']);
Route::post('payroll/inss-rules', [PayrollInssRuleController::class, 'store']);
Route::put('payroll/inss-rules/{rule}', [PayrollInssRuleController::class, 'update']);
Route::post('payroll/inss-rules/{rule}/validate', [PayrollInssRuleController::class, 'validateRule']);
Route::post('payroll/inss-rules/{rule}/activate', [PayrollInssRuleController::class, 'activate']);
Route::post('payroll/inss-rules/{rule}/revoke', [PayrollInssRuleController::class, 'revoke']);

// Tabelas IRT (mesma estrutura)
Route::get('payroll/irt-tables', [PayrollIrtTableController::class, 'index']);
// ... idem
```

### Frontend — Fase 1

Criar página de configuração de regras fiscais, acessível em **Configurações → Regras Fiscais e Contributivas**.

**Design:** seguir o mesmo padrão da `salary-component-regulations-page.tsx`:
- `PageHeader` com título, descrição e botão de acção principal
- Tabs: "Regras INSS" | "Tabelas IRT"
- Por tab: lista em tabela com colunas (regime, vigência, taxas/escalões, estado, acções)
- Badge de estado com cores: `draft`→cinza, `validated`→azul, `active`→verde, `revoked`→vermelho
- Drawer/Dialog para criar/editar regra com Form Requests espelhados
- Acções inline: Validar, Activar, Revogar (com confirmação e motivo obrigatório)
- Para IRT: editor visual de escalões (adicionar/remover linhas na tabela de brackets)

### Testes de aceitação (Fase 1)

- [x] Criar regra INSS `draft` → validar → activar → revogar com motivo
- [x] Tentativa de activar regra com sobreposição de vigência retorna erro 422
- [x] `effectiveFor('2026-11-01', 'AO', 'standard')` retorna a regra correcta entre várias versões
- [x] Rascunho pode ser editado; regra validada/activa não pode ser alterada
- [x] Tabela IRT com 5 escalões é guardada e recuperada correctamente em JSON
- [x] Isolamento por tenant: regra de outro tenant não é acessível

---

## FASE 2 — Motor determinístico com incidências e bases separadas

> **Âmbito:** Ligar o motor de cálculo às regulações e regras versionadas; calcular INSS patronal; persistir itens discriminados; introduzir snapshot e política decimal.  
> **Duração estimada:** 6–8 dias  
> **Pré-requisito:** Fase 0 e Fase 1 concluídas

### Backend

#### 2.1 Migração: `payroll_record_items`

```
payroll_record_items
├── id
├── tenant_id (FK tenants)
├── payroll_record_id (FK payroll_records)
├── category (enum: earning/deduction/tax/employer_contribution/employer_cost)
├── code (string)                -- ex: 'base_salary', 'meal_allowance', 'inss_employee'
├── name (string)                -- nome apresentado no recibo
├── salary_component_id (FK, nullable)
├── regulation_id (FK salary_component_regulations, nullable)
├── inss_rule_id (FK payroll_inss_rules, nullable)
├── irt_table_id (FK payroll_irt_tables, nullable)
├── base_amount (decimal 15,2, nullable)   -- base sobre a qual se calculou
├── quantity (decimal 10,4, nullable)      -- horas, dias, unidades
├── rate (decimal 10,6, nullable)          -- taxa ou factor aplicado
├── amount (decimal 15,2)                  -- valor final (negativo se desconto)
├── notes (text, nullable)
└── timestamps

INDEX (payroll_record_id)
INDEX (tenant_id, payroll_record_id, category)
```

#### 2.2 Migração aditiva a `payroll_records`

```php
$table->decimal('inss_base', 15, 2)->default(0)->after('total_taxes');
$table->decimal('employer_inss_base', 15, 2)->default(0)->after('inss_base');
$table->decimal('employer_inss', 15, 2)->default(0)->after('employer_inss_base');
$table->decimal('irt_taxable_base', 15, 2)->default(0)->after('employer_inss');
$table->decimal('employer_cost', 15, 2)->default(0)->after('irt_taxable_base');
$table->string('currency', 3)->default('AOA');
$table->json('snapshot')->nullable();   -- snapshot imutável no fecho
$table->string('engine_version', 20)->nullable();
```

#### 2.3 Migração aditiva a `payroll_periods`

```php
$table->enum('status', [
    'draft', 'in_simulation', 'pending_validation',
    'pending_approval', 'approved', 'closed', 'paid', 'failed', 'cancelled'
])->default('draft')->change();
$table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete()->after('processed_by');
$table->timestamp('approved_at')->nullable()->after('approved_by');
$table->text('rejection_reason')->nullable();
$table->json('totals_snapshot')->nullable();  -- snapshot dos totais no momento da aprovação
```

#### 2.4 Refactoring do `PayrollContext`

Tornar o contexto imutável após construção:
```php
class PayrollContext {
    public function __construct(
        public readonly Employee $employee,
        public readonly EmployeeContract $contract,  // contrato vigente no PERÍODO, não actual
        public readonly PayrollPeriod $period,
        public readonly Collection $salaryComponents,          // com regulation activa
        public readonly Collection $attendanceRecords,         // aprovados/válidos
        public readonly Collection $leaveRecords,              // aprovados no período
        public readonly ?PayrollInssRule $inssRule,            // regra activa no período
        public readonly ?PayrollIrtTable $irtTable,            // tabela activa no período
        public readonly float $workDays,
        public readonly float $absentDays,
        public readonly float $lateMinutes,
        public readonly float $overtimeHours,
    ) {}
}
```

#### 2.5 Selecção de contrato vigente no período

```php
// Em vez de: $employee->activeContract()->first()
$contract = EmployeeContract::query()
    ->where('employee_id', $employee->id)
    ->where('start_date', '<=', $period->period_start)
    ->where(fn($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', $period->period_end))
    ->where('is_active', true)
    ->orderByDesc('start_date')
    ->first();
```

#### 2.6 Reescrever as regras de cálculo

Cada regra deve:
1. Receber um `PayrollContext` imutável
2. Retornar `PayrollRuleResult` com `amount`, `base`, `quantity`, `rate`, `category`, `notes`
3. Não mutar o contexto nem aceder à base de dados directamente

**Regras a implementar/reescrever:**

| Regra | Comportamento correcto |
|---|---|
| `BaseSalaryRule` | `base_salary × (dias_trabalhados / dias_do_período)` quando há proporcionalidade |
| `SalaryComponentRule` | Iterar `salaryComponents` do contexto; calcular por `calculation_type` (fixed/percentage/hours); respeitar `is_proportional` |
| `OvertimeRule` | `base_salary / divisor_configurado × horas × factor_configurado`; divisor e factor da regra laboral validada |
| `AbsenceRule` | `base_salary / divisor_configurado × dias_falta`; só faltas aprovadas no contexto |
| `LatenessRule` | `base_salary / divisor_horas × (minutos / 60)`; só atrasos aprovados |
| `InssEmployeeRule` | `inss_base × context->inssRule->employee_rate / 100`; retorna negativo |
| `InssEmployerRule` | `employer_inss_base × context->inssRule->employer_rate / 100`; tipo `employer_contribution` |
| `IrtRule` | Fórmula correcta: `fixed_amount + (taxable_base − lower_bound) × rate / 100`; usar tabela do contexto |

#### 2.7 Orquestrador de cálculo

Extrair de `PayrollEngineService` um `PayrollCalculatorService` responsável pelo cálculo de um único trabalhador, seguindo as 14 etapas definidas na secção 2 da arquitectura.

```php
class PayrollCalculatorService {
    public function calculate(PayrollPeriod $period, Employee $employee): PayrollCalculationResult;
    // retorna: items[], totals[], errors[], warnings[], snapshot_hash
}
```

#### 2.8 Persistência de itens e snapshot

Após cálculo bem-sucedido:
1. Criar/substituir `payroll_record_items` do trabalhador (dentro de transacção)
2. Actualizar `payroll_records` com os novos totais e campos
3. Registar `snapshot` com: `{contract_id, inss_rule_id, irt_table_id, components: [...], engine_version}`

No **fecho** do período (`closed`), copiar o snapshot para `totals_snapshot` no período e tornar os records imutáveis (impedir `updateOrCreate` em períodos fechados).

#### 2.9 Política decimal

Usar `BCMath` ou a classe `Money` para todos os cálculos internos. Definir:
- Precisão interna: 4 casas decimais
- Arredondamento final por item: 2 casas decimais, `PHP_ROUND_HALF_UP`
- Os totais são a soma dos items arredondados (não arredondar o total final novamente)

### Frontend — Fase 2

#### 2.A Reformular `payroll-period-detail-page.tsx`

Seguindo o padrão da `EmployeeDetailPage`:

**Estrutura da página:**
```
[Breadcrumb: Folhas Salariais > Outubro/2026]
[Hero Card: nome do período, intervalo, estado em Badge, botões de acção contextuais]
[KPI Bar: 4 cards — Funcionários / Total Bruto / Total Líquido / Custo Patronal]
[Tabs: Resumo | Detalhe por Funcionário | Validações | Histórico]
```

**Tab Resumo:**
- Tabela com colunas: Funcionário, Bruto, INSS, IRT, Outros Descontos, Líquido, Estado, Acções
- Totais no rodapé da tabela
- Badge de estado por linha com cores semânticas
- Botão por linha: ver recibo / ver detalhes

**Tab Detalhe por Funcionário:**
- Selecção de funcionário (dropdown ou lista lateral)
- Cards com: Base, Componentes (abonos), Descontos INSS, IRT, Custo Patronal
- Tabela de itens discriminados com colunas: Descrição, Base, Qtd, Taxa, Valor, Categoria

**Tab Validações:**
- Lista de erros e avisos por trabalhador
- Badge: `Erro impeditivo` (vermelho) vs `Aviso` (âmbar)
- Acção rápida para ir ao perfil do trabalhador (link)

**Tab Histórico:**
- Eventos do período: Criado, Simulado, Validado, Aprovado, Fechado
- Actor, data e notas de cada evento

**Acções contextuais (Hero Card)** — aparecem conforme estado e permissão:
- `draft` + permissão `simulate_payroll` → botão **Simular**
- `pending_validation` + permissão `process_payroll` → botão **Submeter para Aprovação** (desactivado se houver erros impeditivos)
- `pending_approval` + permissão `approve_payroll` → botões **Aprovar** e **Rejeitar**
- `approved` + permissão `close_payroll` → botão **Fechar Período**
- `closed` + permissão `pay_payroll` → botão **Registar Pagamento**

### Testes de aceitação (Fase 2)

- [x] `BaseSalaryRule`: cálculo proporcional por dias úteis / contratuais
- [x] `SalaryComponentRule`: incidências validadas aplicadas a cada componente
- [x] `InssEmployeeRule`: base INSS agregada com incidências e taxa activa
- [x] `InssEmployerRule`: calculado separadamente (8%); adicionado ao custo patronal e não subtraído ao líquido
- [x] `IrtRule`: cálculo progressivo com taxa e parcela fixa de escalão oficial
- [x] `payroll_record_items` criados e discriminados por categoria com base, taxa e valor
- [x] `snapshot` JSON guardado no `payroll_records` com contract_id, inss_rule_id, irt_table_id e engine_version
- [x] Isolamento multi-tenant: itens de outro tenant não acessíveis
- [x] Frontend: tela de detalhe do período no padrão `EmployeeDetailPage` com Hero Card, 4 KPIs e Tabs (Resumo, Detalhe por Funcionário, Validações)

---

## FASE 3 — Validações, ocorrências aprovadas e fluxo de aprovação

> **Âmbito:** Ligar assiduidade aprovada ao motor; validações completas pré-aprovação; máquina de estados controlada; reabertura autorizada.  
> **Duração estimada:** 5–6 dias  
> **Pré-requisito:** Fase 2 concluída

### Backend

#### 3.1 Filtrar ocorrências aprovadas no contexto

Em `buildContext()`, substituir:
```php
// Antes: todos os registos de assiduidade sem filtragem
$attendance = AttendanceRecord::query()->where(...)->get();
```
Por:
```php
// Depois: só registos com status aprovado/justificado/válido
$attendance = AttendanceRecord::query()
    ->where('employee_id', $employee->id)
    ->whereBetween('date', [$period->period_start, $period->period_end])
    ->whereIn('status', ['present', 'late', 'absent', 'justified', 'vacation', 'holiday'])
    ->get();

// Licenças aprovadas no período
$leaves = LeaveRequest::query()
    ->where('employee_id', $employee->id)
    ->where('status', 'approved')
    ->where('start_date', '<=', $period->period_end)
    ->where('end_date', '>=', $period->period_start)
    ->get();
```

#### 3.2 Serviço de validação pré-aprovação

Criar `PayrollValidationService` com método `validate(PayrollPeriod $period): ValidationReport`:
- Verificar que todos os funcionários activos têm contrato vigente no período
- Verificar que existe regra INSS activa para o período
- Verificar que existe tabela IRT activa para o período
- Verificar que todos os componentes activos têm regulação validada (`salary_component_regulations`)
- Verificar que não existem ocorrências pendentes de aprovação que afectem o período
- Verificar identidade de totais: `gross − deductions − taxes = net` por record
- Verificar que não há `validation_errors` com `is_blocking = true`

Retornar `ValidationReport` com `errors` (impeditivos) e `warnings` (informativos) por trabalhador.

#### 3.3 Máquina de estados no modelo `PayrollPeriod`

```php
// Transições válidas
const TRANSITIONS = [
    'draft'              => ['in_simulation'],
    'in_simulation'      => ['pending_validation', 'failed'],
    'pending_validation' => ['pending_approval', 'in_simulation'],  // resimular após correcções
    'pending_approval'   => ['approved', 'pending_validation'],     // rejeitar → corrigir
    'approved'           => ['closed'],
    'closed'             => ['paid'],
    // reabertura: closed → draft (com permissão especial e preservação)
];

public function transitionTo(string $status, ?string $reason = null): void {
    if (!in_array($status, self::TRANSITIONS[$this->status] ?? [])) {
        throw new \InvalidArgumentException("Transição inválida: {$this->status} → {$status}");
    }
    // registar evento; actualizar estado
}
```

#### 3.4 Tabela de eventos do período

```
payroll_period_events
├── id
├── tenant_id
├── payroll_period_id (FK)
├── event_type (enum: simulated/validated/submitted/approved/rejected/closed/reopened/paid)
├── actor_id (FK users)
├── notes (text, nullable)
└── created_at

INDEX (payroll_period_id)
```

#### 3.5 Idempotência e concorrência do job

```php
class ProcessPayrollJob implements ShouldQueue {
    public function handle(): void {
        $period = PayrollPeriod::find($this->periodId);
        
        // Lock de concorrência
        Cache::lock("payroll:period:{$this->periodId}", 3600)->block(5, function() use ($period) {
            if (!in_array($period->status, ['draft', 'in_simulation'])) {
                return; // já processado; sair sem erro
            }
            // ... processar
        });
    }
}
```

#### 3.6 Endpoints novos/actualizados

```php
// Simular (substitui 'process' — mantém retrocompatibilidade com alias)
Route::post('payroll/periods/{period}/simulate', [PayrollController::class, 'simulate']);

// Submeter para aprovação (após validação RH)
Route::post('payroll/periods/{period}/submit', [PayrollController::class, 'submit']);

// Aprovar (com comparação de totais)
Route::post('payroll/periods/{period}/approve', [PayrollController::class, 'approve']);

// Rejeitar com motivo
Route::post('payroll/periods/{period}/reject', [PayrollController::class, 'reject']);

// Fechar
Route::post('payroll/periods/{period}/close', [PayrollController::class, 'close']);

// Reabrir (permissão especial + motivo)
Route::post('payroll/periods/{period}/reopen', [PayrollController::class, 'reopen']);

// Registar pagamento
Route::post('payroll/periods/{period}/pay', [PayrollController::class, 'pay']);

// Consultar validações
Route::get('payroll/periods/{period}/validations', [PayrollController::class, 'validations']);

// Progresso do job (polling)
Route::get('payroll/periods/{period}/progress', [PayrollController::class, 'progress']);

// Items discriminados de um record
Route::get('payroll/records/{record}/items', [PayrollRecordController::class, 'items']);
```

### Frontend — Fase 3

Actualizar a `payroll-period-detail-page.tsx` com:

**Fluxo de simulação:**
- Botão "Simular" → dialog de confirmação → job iniciado → polling de progresso (barra de progresso)
- Enquanto `in_simulation`: spinner + "A calcular X/Y funcionários..."
- Ao completar: invalidar queries; navegar para Tab Validações

**Tab Validações (implementar completamente):**
- Lista de erros impeditivos (vermelho) e avisos (âmbar) por trabalhador
- Se há erros impeditivos: botão "Submeter" desactivado com tooltip explicativo
- Se só avisos: checkbox "Confirmo que revi os avisos" → habilita "Submeter"

**Dialog de Aprovação:**
- Mostrar totais do período e comparação com período anterior (se existir)
- Botão "Aprovar" (verde) + "Rejeitar" (vermelho, com campo de motivo obrigatório)

**Dialog de Reabertura:**
- Campo de motivo obrigatório
- Aviso: "Esta acção cria uma nova versão do período. O resultado anterior é preservado."

### Testes de aceitação (Fase 3)

- [ ] `PayrollValidationService`: período com trabalhador sem contrato retorna erro impeditivo para esse trabalhador
- [ ] `PayrollValidationService`: período com componente sem regulação activa retorna aviso
- [ ] Submissão com erros impeditivos retorna 422 com lista de erros
- [ ] Aprovação de período com zero records retorna erro
- [ ] Rejeição guarda motivo e muda estado para `pending_validation`
- [ ] Reabertura de período `closed` preserva o `totals_snapshot` e cria evento
- [ ] Job com lock: dois jobs concorrentes para o mesmo período — apenas um processa
- [ ] Faltas por aprovar no período geram aviso na validação

---

## FASE 4 — Recibo discriminado, relatórios e exportações

> **Âmbito:** Recibo com memória de cálculo completa; relatórios internos (folha mensal, mapas INSS/IRT, custo por centro de custo); PDF de recibo.  
> **Duração estimada:** 5–6 dias  
> **Pré-requisito:** Fase 3 concluída

### Backend

#### 4.1 Actualizar `PayslipController`

O recibo deve retornar:
```json
{
  "period": { "name": "...", "start": "...", "end": "..." },
  "employee": { "name": "...", "code": "...", "nif": "...", "inss_number": "..." },
  "employer": { "name": "...", "nif": "..." },
  "earnings": [
    { "code": "base_salary", "name": "Salário Base", "amount": 500000 },
    { "code": "meal_allowance", "name": "Subsídio de Alimentação", "amount": 20000 }
  ],
  "deductions": [
    { "code": "inss_employee", "name": "INSS", "base": 500000, "rate": 3.0, "amount": -15000 },
    { "code": "irt", "name": "IRT", "taxable_base": 485000, "bracket": "11%", "fixed": 7000, "amount": -31350 }
  ],
  "employer_contributions": [
    { "code": "inss_employer", "name": "INSS Patronal", "base": 500000, "rate": 8.0, "amount": 40000 }
  ],
  "totals": {
    "gross": 520000,
    "inss_base": 500000,
    "inss_employee": 15000,
    "irt": 31350,
    "total_deductions": 46350,
    "net": 473650,
    "employer_inss": 40000,
    "employer_cost": 560000
  },
  "rules_applied": {
    "inss_rule_version": 1,
    "irt_table_version": 1,
    "legal_references": ["Lei n.º 12/23", "Tabela IRT 2026"]
  }
}
```

#### 4.2 Relatórios

Adicionar ao `ReportController`:

| Endpoint | Descrição |
|---|---|
| `GET reports/payroll/monthly?period_id=X` | Folha salarial mensal completa |
| `GET reports/payroll/inss?period_id=X` | Mapa INSS (trab + patronal por funcionário) |
| `GET reports/payroll/irt?period_id=X` | Mapa IRT (matéria colectável + imposto por funcionário) |
| `GET reports/payroll/cost?period_id=X&group_by=department` | Custo por centro de custo / departamento |
| `GET reports/payroll/comparison?period_id=X&compare_id=Y` | Variações entre dois períodos |

#### 4.3 PDF do recibo

Usar `barryvdh/laravel-dompdf` ou `spatie/browsershot` para gerar PDF a partir de uma view Blade que espelha a estrutura do recibo acima. O PDF deve conter:
- Cabeçalho com logos da empresa e dados do trabalhador
- Tabela de abonos, tabela de descontos, resultado
- Rodapé com referências às regras aplicadas e data de processamento

### Frontend — Fase 4

#### 4.A Página de recibo individual

Rota: `/payroll/records/:id/payslip`

**Design (seguindo EmployeeDetailPage):**
```
[Breadcrumb: Folhas > Outubro/2026 > Recibo João Silva]
[Hero Card: nome, código, período, estado, botão Download PDF]
[KPI Bar: Bruto / INSS / IRT / Líquido]
[Tabs: Recibo | Bases de Cálculo | Regras Aplicadas]
```

**Tab Recibo:** layout de recibo formal com secções Abonos / Descontos / Resultado  
**Tab Bases de Cálculo:** tabela de items com base, quantidade, taxa, valor  
**Tab Regras Aplicadas:** referências às regras INSS e IRT usadas, versão e fonte legal

#### 4.B Página de relatórios de folha

Adicionar à página de relatórios existente uma secção "Folha Salarial" com:
- Selector de período
- Cards de exportação: Folha Mensal, Mapa INSS, Mapa IRT, Custo por Departamento
- Tabela de comparação entre períodos (se seleccionados dois)

### Testes de aceitação (Fase 4)

- [ ] Recibo retorna `earnings`, `deductions`, `employer_contributions` e `totals` correctamente separados
- [ ] Download PDF retorna content-type `application/pdf` e nome de ficheiro correcto
- [ ] `total_deductions = inss_employee + irt + outros_descontos`
- [ ] `net = gross − total_deductions`
- [ ] `employer_cost = gross + employer_inss`
- [ ] Relatório INSS lista todos os funcionários do período com bases e valores correctos
- [ ] Relatório de comparação destaca variações acima de 10%
- [ ] Trabalhador só acede ao seu próprio recibo; HR acede a todos do seu tenant

---

## FASE 5 — Homologação, testes de regressão e activação em produção

> **Âmbito:** Validação com dados reais; processamento paralelo com cálculos manuais; aprovação formal; procedimento de manutenção legal.  
> **Duração estimada:** 2–4 semanas (inclui tempo de validação por especialistas)  
> **Pré-requisito:** Fases 0–4 concluídas; Fase 0 (validação legal) formalizada

### Checklist de homologação

#### Técnico
- [ ] Todos os testes automatizados passam (ver secção 4)
- [ ] Nenhuma constante legal hardcoded no código (grep por taxas e divisores)
- [ ] Todas as regras activas têm `validated_at`, `validated_by`, `legal_source`, `legal_reference`
- [ ] Todos os componentes activos têm regulação `active` para Angola/standard
- [ ] Reprocessamento do mesmo período com mesmas entradas produz resultados idênticos
- [ ] Snapshot de período fechado permite reconstruir o cálculo sem acesso às regras actuais

#### Funcional (RH e Contabilidade)
- [ ] Processar um período em paralelo com o cálculo manual actual; reconciliar divergências
- [ ] Recibo apresenta todas as parcelas de forma compreensível
- [ ] Mapa INSS corresponde às guias de pagamento
- [ ] Mapa IRT corresponde à declaração periódica

#### Procedimento de actualização legal
- [ ] Documento definido: quem é responsável por criar/validar/activar novas versões de regras
- [ ] SLA para actualização em caso de alteração legal (ex: nova tabela IRT publicada pela AGT)
- [ ] Testes de regressão correm automaticamente antes de activar nova versão de regra

### Activação em produção
1. Manter componentes e taxas de exemplo como `draft` ou `revoked`
2. Criar e activar regras com fonte oficial validada
3. Processar primeiro período real em modo de simulação
4. Comparar com cálculo manual / folha anterior
5. Obter aprovação formal de RH e contabilidade
6. Activar produção; manter o processamento manual em paralelo durante 1 mês

---

## 4. Mapa de dependências entre fases

```
Fase 0 (bug IRT + erros estruturados)
    └──► Fase 1 (tabelas INSS/IRT versionadas)
              └──► Fase 2 (motor determinístico + itens + snapshot)
                        └──► Fase 3 (ocorrências + validações + máquina de estados)
                                  └──► Fase 4 (recibo discriminado + relatórios)
                                            └──► Fase 5 (homologação + produção)

[Fase 0 validação legal] ─────────────────────────────────────────► [Fase 5 activação]
(pode correr em paralelo com Fases 0–4 técnicas)
```

---

## 5. Padrão de design e convenções de UI

**Referência de design:** `EmployeeDetailPage` — aplicar sempre:

| Elemento | Padrão |
|---|---|
| Breadcrumb | `ArrowLeft` → lista → `ChevronRight` → detalhe; botão "Voltar" alinhado à direita |
| Hero Card | `Card > CardContent p-6`; avatar/ícone grande à esquerda; badges de estado; botões de acção contextuais à direita |
| KPI Bar | `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`; cada card com ícone colorido + label `text-xs text-muted-foreground` + valor `text-sm font-semibold` |
| Tabs | `Tabs` com `TabsList` + `TabsTrigger` com ícone e texto; estado activo via `useSearchParams` |
| Tabelas | `table w-full`; `thead` com `border-b bg-muted/30 text-xs uppercase text-muted-foreground`; `tbody divide-y` |
| Badges de estado | Cores semânticas: verde=success, âmbar=warning, vermelho=destructive, cinza=muted |
| Formulários | `Dialog/Sheet` + `Label` + `Input`/`Select`; validação do lado cliente + mensagens do servidor via `toast.error(getApiErrorMessage(e))` |
| Estados vazios | `EmptyState` com ícone + título + descrição + botão de acção |
| Loading | `LoadingState` ou `Loader2 animate-spin` inline |
| Acções | `useMutation` + `toast.success`/`toast.error` + `queryClient.invalidateQueries` |
| Moeda | `Intl.NumberFormat('pt-AO', { style: 'currency', currency: 'AOA' })` |
| Datas | `Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })` |

---

## 6. Testes automatizados — cobertura mínima por fase

### Motor de cálculo (Fases 0 e 2)

| Cenário | Verificação |
|---|---|
| Salário fixo sem componentes variáveis | Bruto = salário-base; INSS e IRT correctos |
| Admissão a meio do período | Salário proporcional aos dias trabalhados |
| Cessação a meio do período | Idem + acerto de componentes |
| Vários subsídios com incidências diferentes | Base INSS ≠ Base IRT |
| Trabalhador em cada escalão IRT | IRT = parcela fixa + excesso × taxa |
| Alteração de taxa INSS entre períodos | Período fechado não é afectado pela nova taxa |
| Trabalhador com faltas aprovadas | Desconto correcto; faltas por aprovar ignoradas |
| Horas extraordinárias aprovadas | Valor correcto com divisor validado |
| Líquido negativo | Tratado conforme política (erro ou zero conforme configuração) |
| Precisão decimal | Soma dos items = totais sem erro de arredondamento |

### Fluxo de aprovação (Fase 3)

| Cenário | Verificação |
|---|---|
| Reprocessamento idempotente | Mesmo resultado para as mesmas entradas |
| Concorrência | Dois jobs para o mesmo período — apenas um processa |
| Falha parcial | Período não fecha como aprovado com erros impeditivos |
| Reabertura | Snapshot do período original preservado |
| Transição inválida | `approved → in_simulation` retorna erro |

### Segurança e isolamento (todas as fases)

| Cenário | Verificação |
|---|---|
| Tenant A não acede a records do Tenant B | 404 em todos os endpoints |
| Funcionário acede só ao próprio recibo | 403 para records de outros |
| Aprovação sem permissão `approve_payroll` | 403 |
| Fecho sem aprovação prévia | 422 |
| Edição de período fechado | 422 |

---

## 7. Decisões pendentes que bloqueiam o desenho final

As seguintes decisões devem ser confirmadas **antes de activar qualquer regra em produção**:

| # | Decisão | Impacto |
|---|---|---|
| 1 | Regimes e sectores suportados no primeiro lançamento (geral, petróleo, doméstico, outros) | Estrutura do `regime_code` e necessidade de múltiplas tabelas IRT |
| 2 | Política para admissão/cessação a meio do período (proporcional por dias naturais, úteis ou outros) | Fórmula de `BaseSalaryRule` e `is_proportional` dos componentes |
| 3 | Política de arredondamento (por item vs. no total; `HALF_UP` ou outro) | Implementação com `BCMath` |
| 4 | Divisor de horas (220 actual) e divisor de dias (30 actual) — são correctos para o regime geral? | Parâmetros das regras de faltas e horas extraordinárias |
| 5 | Deduções legalmente admitidas para IRT (ex: dependentes, seguros, outros) | Estrutura da base tributável e da tabela IRT |
| 6 | Descontos autorizados (adiantamentos, empréstimos) — existem no sistema? | Necessidade de nova entidade ou uso dos `Deductions` existentes |
| 7 | Segregação de funções: quem pode simular, submeter, aprovar e fechar (mesmo utilizador ou perfis distintos) | Políticas e permissões |
| 8 | Fonte oficial e responsável pela validação das regras INSS e IRT para o primeiro período | Fase 0 validação legal |

Enquanto estas decisões não forem aprovadas, todas as componentes e taxas no sistema devem ser tratadas como configuração provisória para desenvolvimento e testes, **nunca como parâmetro legal de produção**.
