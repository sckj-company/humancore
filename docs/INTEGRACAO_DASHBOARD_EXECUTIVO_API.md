# API do Dashboard Executivo (Super Admin) — Humancore HRMS

Esta documentação descreve os endpoints REST criados no **Humancore HRMS** para alimentar um **dashboard executivo geral** do Super Admin (dono da plataforma), consolidando numa única API os indicadores das **8 áreas de controlo** sobre **todas as empresas (tenants)** da plataforma.

> Todos os endpoints descritos abaixo são **somente leitura (`GET`)** e exigem privilégios de **Super Admin**.

---

## 1. Endpoints Disponíveis

| Método | Endpoint | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/v1/superadmin/executive-dashboard` | Visão geral consolidada de todas as empresas (ou de um subconjunto filtrado). |
| `GET` | `/api/v1/superadmin/executive-dashboard/companies/{tenant}` | Detalhe executivo (drill-down) focado numa empresa específica + `company_profile`. |

---

## 2. Autenticação & Segurança

Cabeçalhos obrigatórios em todas as chamadas:

```http
Accept: application/json
Authorization: Bearer <TOKEN_SANCTUM>
```

### Opção A — Token Dedicado Somente Leitura (Recomendado para Dashboard Externo)

Gere um token Sanctum exclusivo para o dashboard com a *ability* restrita `executive-dashboard:read`:

```bash
php artisan executive-dashboard:token
```

Opções disponíveis:
* `--email=chefe@humancore.ao` — seleciona um super-admin específico (por defeito escolhe o primeiro super-admin ativo).
* `--name=ExecutiveDashboard` — nome identificador do token.
* `--expires-days=90` — define expiração automática em dias (opcional).

> **Segurança:** tokens criados por este comando possuem apenas a *ability* `executive-dashboard:read`, garantindo que o token não possa ser usado para mutações noutras rotas da plataforma.

### Opção B — Via Login HTTP (`POST /api/v1/auth/login`)

Tokens obtidos via login padrão de um utilizador `super-admin` (ou `super-admin-limited` com `view_any_tenant`) também têm acesso autorizado.

---

## 3. Parâmetros de Query (Todos Opcionais)

| Parâmetro | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `periodicity` | `monthly` \| `quarterly` \| `semiannual` \| `annual` | `monthly` | Periodicidade do período analisado (ignorado se enviar `start_date`/`end_date`). |
| `year` | integer (`2000–2100`) | Ano atual | Ano de referência. |
| `month` | integer (`1–12`) | Mês atual | Mês (quando `periodicity=monthly`). |
| `quarter` | integer (`1–4`) | `1` | Trimestre (quando `periodicity=quarterly`). |
| `semester` | integer (`1–2`) | `1` | Semestre (quando `periodicity=semiannual`). |
| `start_date` | `YYYY-MM-DD` | `null` | Início de intervalo personalizado (sobrepõe `periodicity`). |
| `end_date` | `YYYY-MM-DD` | `null` | Fim de intervalo personalizado. |
| `tenant_ids` | `1,2,3` ou array `tenant_ids[]=1` | Todas | Filtra o dashboard para um conjunto específico de empresas. *(Apenas no endpoint geral).* |
| `status` | `active` \| `inactive` \| `suspended` \| `all` | `all` | Filtra empresas por estado. *(Apenas no endpoint geral).* |
| `include` | Lista separada por vírgula ou array | Todas | Seleciona os blocos a retornar: `alerts`, `workforce`, `payroll`, `attendance`, `leaves`, `compliance`, `talent`, `saas`, `audit`, `companies`. |
| `limit` | integer (`1–100`) | `15` | Número máximo de itens em listas e rankings (`items`, `by_department`, `recent`, etc.). |
| `audit_scope` | `critical` \| `all` | `critical` | Filtra o feed de auditoria entre ações críticas (folha, contratos, pagamentos, utilizadores, empresas) ou todas. |
| `audit_details` | boolean (`0`/`1`) | `0` | Se `1`, inclui `old_values` e `new_values` nos registos de auditoria. |
| `fresh` | boolean (`0`/`1`) | `0` | Se `1`, ignora a cache de 120 segundos e recalcula em tempo real. |

---

## 4. Estrutura da Resposta (`200 OK`)

A resposta devolve sempre `meta` e `summary`, além dos blocos selecionados em `include` (ou todos os 10 blocos por defeito):

* **`meta`**: timestamp de geração (`generated_at`), estado de cache (`cached`), intervalo aplicado (`date_range`) e escopo (`scope`).
* **`summary`**: KPIs executivos de topo (empresas totais/ativas/suspensas, colaboradores totais/ativos, presenças/atrasos/faltas/férias hoje, massa salarial base e do período, total de aprovações pendentes, riscos críticos e faturação em aberto).
* **`alerts`** *(Bloco 1)*: contadores de aprovações pendentes (`payroll_periods`, `leave_requests`, `employees`, `deductions`, `performance_evaluations`, `subscription_payments`), riscos operacionais (contratos a expirar/expirados ativos, funcionários sem turno, folhas desatualizadas, documentos por verificar/expirados, advertências por assinar, onboarding atrasado, ativos danificados/extraviados, faturas vencidas, empresas suspensas/carência, períodos sem comprovativo INSS) e feed priorizado `items`.
* **`workforce`** *(Bloco 2)*: headcount por estado, admissões e demissões no período, taxa de turnover, estagiários/período experimental, distribuição por empresa/departamento/filial, evolução mensal (12 meses), motivos de saída e aniversários nos próximos 30 dias.
* **`payroll`** *(Bloco 3)*: salário base mensal ativo vs. folha processada (bruto, líquido, INSS trabalhador/empresa, IRT, descontos, custo total da entidade patronal, horas extras pagas), conformidade do dossiê/INSS, estados das folhas, rankings por empresa/departamento, evolução mensal e resumo de benefícios e deduções/parcelas.
* **`attendance`** *(Bloco 4)*: fotografia em tempo real de **hoje** (`present`, `late`, `absent`, `half_day`, `justified`, `on_leave_or_vacation`, `not_clocked_in_yet`, `attendance_rate_today`), resumo do período (taxas de assiduidade e absentismo, horas trabalhadas, minutos de atraso, horas extras, eventos de atraso, funcionários sem turno) e ranking de departamentos com mais atrasos/faltas.
* **`leaves`** *(Bloco 5A)*: licenças/férias pendentes, aprovadas no período, rejeitadas, ausentes hoje, agendadas nos próximos 30 dias, dias por tipo de licença e listas operacionais.
* **`compliance`** *(Bloco 5B)*: contratos ativos/a expirar (30/60/90 dias)/expirados/rescindidos e indemnizações líquidas, verificação e validade de documentos, advertências disciplinares (assinadas vs. por assinar) e inventário/responsabilidade de ativos atribuídos.
* **`talent`** *(Bloco 6)*: vagas abertas e funil de candidatos, avaliações de desempenho e média de pontuação, formações e taxa de conclusão, e tarefas de onboarding (pendentes, em curso, concluídas e atrasadas).
* **`saas`** *(Bloco 7)*: empresas por estado e segmento (pequena/média/grande), tendência de novas empresas, utilizadores e super-admins, subscrições por estado e plano (receita recorrente estimada), faturação (faturado, pago no período e no mês, em aberto, vencido, comprovativos pendentes) e uso mensal (OCR, execuções de folha, relações de agência).
* **`audit`** *(Bloco 8)*: resumo de eventos e recursos alterados no período + feed das últimas ações auditadas.
* **`companies`**: scorecard consolidado linha a linha de todas as empresas filtradas (ideal para tabela comparativa multi-empresa no dashboard).
* **`company_profile`** *(apenas em `/companies/{tenant}`)*: ficha completa da empresa selecionada, subscrição ativa e relação de gestão.

---

## 5. Estratégia Recomendada de Consumo

1. **Carga inicial do dashboard:**
   ```bash
   curl -H "Accept: application/json" \
     -H "Authorization: Bearer <TOKEN>" \
     "https://<dominio>/api/v1/superadmin/executive-dashboard?periodicity=monthly&year=2026&month=11"
   ```
2. **Atualização rápida em tempo real (polling a cada 30–60s para alertas e ponto de hoje):**
   ```bash
   curl -H "Accept: application/json" \
     -H "Authorization: Bearer <TOKEN>" \
     "https://<dominio>/api/v1/superadmin/executive-dashboard?include=alerts,attendance&fresh=1"
   ```
3. **Drill-down ao clicar numa empresa específica:**
   ```bash
   curl -H "Accept: application/json" \
     -H "Authorization: Bearer <TOKEN>" \
     "https://<dominio>/api/v1/superadmin/executive-dashboard/companies/12?periodicity=monthly&year=2026&month=11"
   ```
