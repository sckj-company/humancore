# Guia Passo a Passo — Limpeza Segura de Dados de Teste em Produção

Este guia descreve o procedimento seguro para remover todos os dados de teste referentes a configurações fiscais (**IRT**, **INSS**, regulamentações), **descontos**, **benefícios**, **subsídios individuais**, **presenças**, **turnos/escalas**, **férias/ausências**, **folhas de salário**, **notificações**, **auditorias** e demais módulos operacionais de RH na base de dados de produção (**MySQL 8.4**), **preservando os dados principais** (empresas, filiais, departamentos, cargos, funcionários, contratos, documentos de funcionários, utilizadores, perfis/permissões, planos/subscrições e rubricas base).

> **Aviso de Segurança:**
> - **Nunca** execute esta limpeza sem primeiro concluir e validar um backup completo.
> - **Não** use `TRUNCATE` neste procedimento: no MySQL, `TRUNCATE` faz `COMMIT` implícito e impede `ROLLBACK`. Todo o script abaixo usa `DELETE FROM` dentro de uma transação (`START TRANSACTION`).
> - **Não** desligue `FOREIGN_KEY_CHECKS`: a ordem de eliminação respeita todas as chaves estrangeiras (`filho → pai`), usando o próprio MySQL como proteção contra eliminação acidental de registos principais.
> - **Não** execute `php artisan db:seed --class=SettingSeeder` em produção, pois ele sobrescreveria também definições dos grupos `company` (branding/logótipo), `hr`, `leave` e `communication`. O script abaixo repõe isoladamente apenas `settings` com `` `group` = 'payroll' ``.

---

## 1. Resumo do Escopo

| Estado | Tabelas afetadas |
| :--- | :--- |
| **MANTIDO intacto** | `tenants`, `branches`, `departments`, `positions`, `employees`, `employee_contracts`, `employee_documents`, `users`, `roles`, `permissions`, `model_has_roles`, `model_has_permissions`, `role_has_permissions`, `permission_groups`, `user_tenant_accesses`, `tenant_invitations`, `plans`, `tenant_subscriptions`, `subscription_invoices`, `subscription_payments`, `tenant_relationships`, `salary_components`, `leave_types`, `email_templates`, `settings` (grupos `company`, `hr`, `leave`, `communication`), `personal_access_tokens`, `sessions`, `migrations` |
| **REPOSTO / ZERADO** | `settings` (apenas `` `group` = 'payroll' `` reposto para os defaults limpos de `SettingSeeder`) e `tenant_monthly_usages.payroll_runs = 0` |
| **ELIMINADO** | **Folhas e relatórios:** `payroll_period_report_documents`, `payroll_period_reports`, `payroll_period_events`, `payroll_record_items`, `payroll_records`, `payroll_periods`<br>**Descontos, benefícios e subsídios:** `deduction_installments`, `deductions`, `benefits`, `employee_salary_components`<br>**Regras fiscais:** `salary_component_regulations`, `payroll_inss_rules`, `payroll_irt_tables`<br>**Presenças, turnos e ausências:** `attendance_records`, `attendance_qr_codes`, `employee_lateness_events`, `employee_schedules`, `shifts`, `holidays`, `leave_requests`<br>**Ocorrências e logs:** `employee_educations`, `notifications`, `audits`<br>**Módulos extra de RH:** `candidates`, `job_openings`, `performance_evaluations`, `onboarding_tasks`, `onboarding_templates`, `training_assignments`, `trainings` |

---

## 2. Passo 1 — Modo de Manutenção e Backup Obrigatório

Antes de executar qualquer alteração na base de dados, coloque a plataforma em modo de manutenção, pare o worker de filas (Horizon) e faça um backup consistente com validação de integridade.

### Opção A: Ambiente Docker Compose (`docker-compose.yml`)

```bash
# 1. Ativar modo de manutenção e parar processamento assíncrono (Horizon)
docker compose exec app php artisan down --retry=60
docker compose stop worker

# 2. Criar pasta de backups e gerar dump consistente em transação única
mkdir -p backups
BACKUP_FILE="backups/prod-pre-reset-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose exec -T db sh -c 'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers --events --databases "$MYSQL_DATABASE"' | gzip -9 > "$BACKUP_FILE"

# 3. Validar integridade e tamanho do ficheiro (OBRIGATÓRIO antes de avançar)
gunzip -t "$BACKUP_FILE" && ls -lh "$BACKUP_FILE"
```

### Opção B: MySQL nativo instalado diretamente no servidor

```bash
# 1. Ativar modo de manutenção
php artisan down --retry=60

# 2. Gerar e validar dump consistente
BACKUP_FILE="prod-pre-reset-$(date +%Y%m%d-%H%M%S).sql.gz"
mysqldump -u root -p --single-transaction --routines --triggers --events --databases humancore | gzip -9 > "$BACKUP_FILE"
gunzip -t "$BACKUP_FILE" && ls -lh "$BACKUP_FILE"
```

### Comando de Restauro de Emergência (se precisar reverter após o `COMMIT`)

```bash
# Com Docker Compose:
gunzip -c "$BACKUP_FILE" | docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD"'

# Sem Docker (MySQL nativo):
gunzip -c "$BACKUP_FILE" | mysql -u root -p
```

---

## 3. Passo 2 — Inspeção Prévia (Somente Leitura)

Execute este `SELECT` antes da limpeza para registar as contagens atuais de todas as tabelas principais (que devem permanecer com o mesmo número) e de teste (que serão zeradas):

```sql
SELECT '--- DADOS PRINCIPAIS (MANTER) ---' AS tabela, NULL AS registos
UNION ALL SELECT 'tenants', COUNT(*) FROM tenants
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'employees', COUNT(*) FROM employees
UNION ALL SELECT 'employee_contracts', COUNT(*) FROM employee_contracts
UNION ALL SELECT 'employee_documents', COUNT(*) FROM employee_documents
UNION ALL SELECT 'departments', COUNT(*) FROM departments
UNION ALL SELECT 'positions', COUNT(*) FROM positions
UNION ALL SELECT 'branches', COUNT(*) FROM branches
UNION ALL SELECT 'salary_components', COUNT(*) FROM salary_components
UNION ALL SELECT 'leave_types', COUNT(*) FROM leave_types
UNION ALL SELECT '--- DADOS DE TESTE (ELIMINAR) ---', NULL
UNION ALL SELECT 'payroll_period_report_documents', COUNT(*) FROM payroll_period_report_documents
UNION ALL SELECT 'payroll_period_reports', COUNT(*) FROM payroll_period_reports
UNION ALL SELECT 'payroll_period_events', COUNT(*) FROM payroll_period_events
UNION ALL SELECT 'payroll_record_items', COUNT(*) FROM payroll_record_items
UNION ALL SELECT 'deduction_installments', COUNT(*) FROM deduction_installments
UNION ALL SELECT 'payroll_records', COUNT(*) FROM payroll_records
UNION ALL SELECT 'payroll_periods', COUNT(*) FROM payroll_periods
UNION ALL SELECT 'deductions', COUNT(*) FROM deductions
UNION ALL SELECT 'benefits', COUNT(*) FROM benefits
UNION ALL SELECT 'employee_salary_components', COUNT(*) FROM employee_salary_components
UNION ALL SELECT 'salary_component_regulations', COUNT(*) FROM salary_component_regulations
UNION ALL SELECT 'payroll_inss_rules', COUNT(*) FROM payroll_inss_rules
UNION ALL SELECT 'payroll_irt_tables', COUNT(*) FROM payroll_irt_tables
UNION ALL SELECT 'attendance_records', COUNT(*) FROM attendance_records
UNION ALL SELECT 'attendance_qr_codes', COUNT(*) FROM attendance_qr_codes
UNION ALL SELECT 'employee_lateness_events', COUNT(*) FROM employee_lateness_events
UNION ALL SELECT 'employee_schedules', COUNT(*) FROM employee_schedules
UNION ALL SELECT 'shifts', COUNT(*) FROM shifts
UNION ALL SELECT 'holidays', COUNT(*) FROM holidays
UNION ALL SELECT 'leave_requests', COUNT(*) FROM leave_requests
UNION ALL SELECT 'employee_educations', COUNT(*) FROM employee_educations
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'audits', COUNT(*) FROM audits
UNION ALL SELECT 'candidates', COUNT(*) FROM candidates
UNION ALL SELECT 'job_openings', COUNT(*) FROM job_openings
UNION ALL SELECT 'performance_evaluations', COUNT(*) FROM performance_evaluations
UNION ALL SELECT 'onboarding_tasks', COUNT(*) FROM onboarding_tasks
UNION ALL SELECT 'onboarding_templates', COUNT(*) FROM onboarding_templates
UNION ALL SELECT 'training_assignments', COUNT(*) FROM training_assignments
UNION ALL SELECT 'trainings', COUNT(*) FROM trainings
UNION ALL SELECT 'settings (group=payroll)', COUNT(*) FROM settings WHERE `group` = 'payroll';
```

---

## 4. Passo 3 — Script SQL Transacional Seguro (`MySQL 8.4`)

### Procedimento obrigatório em duas etapas:
1. **Simulação (Dry-Run):** Salve o script abaixo como `reset_prod.sql` mantendo **`ROLLBACK;`** ativo no final e execute-o. Isso valida sintaxe, chaves estrangeiras e exibe o resumo final sem gravar alterações.
2. **Execução Definitiva:** Só depois de conferir que as contagens principais (`tenants_mantidos`, `users_mantidos`, `employees_mantidos`, `contracts_mantidos`, `rubricas_base_mantidas`) estão intactas e as restantes em `0`, troque **`ROLLBACK;`** por **`COMMIT;`** na última linha e execute novamente.

```sql
SET SESSION sql_safe_updates = 0;

START TRANSACTION;

-- ============================================================================
-- 1. FOLHAS DE SALÁRIO, RECIBOS, EVENTOS E RELATÓRIOS DE CONFORMIDADE
--    (ordem estrita filho -> pai, preservando integridade referencial)
-- ============================================================================
DELETE FROM payroll_period_report_documents;
DELETE FROM payroll_period_reports;
DELETE FROM payroll_period_events;
DELETE FROM payroll_record_items;
DELETE FROM deduction_installments;
DELETE FROM payroll_records;
DELETE FROM payroll_periods;

-- ============================================================================
-- 2. DESCONTOS, BENEFÍCIOS E SUBSÍDIOS INDIVIDUAIS
--    (employee_contracts e salary_components permanecem intactos)
-- ============================================================================
DELETE FROM deductions;
DELETE FROM benefits;
DELETE FROM employee_salary_components;

-- ============================================================================
-- 3. CONFIGURAÇÕES FISCAIS E REGULAMENTAÇÕES (INSS, IRT, INCIDÊNCIAS)
-- ============================================================================
DELETE FROM salary_component_regulations;
DELETE FROM payroll_inss_rules;
DELETE FROM payroll_irt_tables;

-- ============================================================================
-- 4. PRESENÇAS, ATRASOS, QR CODES, TURNOS, ESCALAS, FERIADOS E AUSÊNCIAS
--    (leave_types permanece intacto)
-- ============================================================================
DELETE FROM attendance_records;
DELETE FROM attendance_qr_codes;
DELETE FROM employee_lateness_events;
DELETE FROM employee_schedules;
DELETE FROM shifts;
DELETE FROM holidays;
DELETE FROM leave_requests;

-- ============================================================================
-- 5. ADVERTÊNCIAS / EDUCAÇÃO, NOTIFICAÇÕES E AUDITORIA
-- ============================================================================
DELETE FROM employee_educations;
DELETE FROM notifications;
DELETE FROM audits;

-- ============================================================================
-- 6. OUTROS MÓDULOS DE RH (RECRUTAMENTO, DESEMPENHO, ONBOARDING, FORMAÇÕES)
-- ============================================================================
DELETE FROM candidates;
DELETE FROM job_openings;
DELETE FROM performance_evaluations;
DELETE FROM onboarding_tasks;
DELETE FROM onboarding_templates;
DELETE FROM training_assignments;
DELETE FROM trainings;

-- ============================================================================
-- 7. ZERAR CONTADOR DE PROCESSAMENTOS SALARIAIS DE TESTE NAS QUOTAS MENSAIS
-- ============================================================================
UPDATE tenant_monthly_usages
SET payroll_runs = 0,
    updated_at = NOW();

-- ============================================================================
-- 8. REPOR APENAS settings DO GRUPO 'payroll' PARA DEFAULTS LIMPOS POR EMPRESA
--    (NÃO altera settings dos grupos company/branding, hr, leave, communication)
-- ============================================================================
DELETE FROM settings WHERE `group` = 'payroll';

INSERT INTO settings (tenant_id, `group`, `key`, `value`, `type`, created_at, updated_at)
SELECT t.id, 'payroll', d.setting_key, CAST(d.setting_val AS JSON), d.setting_type, NOW(), NOW()
FROM tenants t
CROSS JOIN (
    SELECT 'inss.employee_rate' AS setting_key, '3' AS setting_val, 'string' AS setting_type
    UNION ALL SELECT 'inss.employer_rate', '8', 'string'
    UNION ALL SELECT 'irt.enabled', 'true', 'boolean'
    UNION ALL SELECT 'irt.brackets', '[{"min":0,"max":100000,"rate":0},{"min":100000,"max":200000,"rate":7},{"min":200000,"max":500000,"rate":11},{"min":500000,"max":1000000,"rate":15},{"min":1000000,"rate":19}]', 'json'
    UNION ALL SELECT 'discounts.absence_daily_amount', '0', 'string'
    UNION ALL SELECT 'discounts.lateness_hourly_amount', '0', 'string'
    UNION ALL SELECT 'discounts.lateness_accumulation_amount', '0', 'string'
    UNION ALL SELECT 'discounts.lateness_free_occurrences_per_week', '0', 'string'
    UNION ALL SELECT 'discounts.lateness_weekly_accumulation_minutes', '0', 'string'
    UNION ALL SELECT 'discounts.dayoff_daily_amount', '0', 'string'
    UNION ALL SELECT 'discounts.default_amount', '0', 'string'
    UNION ALL SELECT 'subsidies.meal.daily', '0', 'string'
    UNION ALL SELECT 'subsidies.transport.monthly', '0', 'string'
    UNION ALL SELECT 'advance.monthly_limit', '0', 'string'
    UNION ALL SELECT 'payment_date', '5', 'string'
) d;

-- Verificação dentro da transação antes de confirmar:
SELECT
    (SELECT COUNT(*) FROM tenants) AS tenants_mantidos,
    (SELECT COUNT(*) FROM users) AS users_mantidos,
    (SELECT COUNT(*) FROM employees) AS employees_mantidos,
    (SELECT COUNT(*) FROM employee_contracts) AS contracts_mantidos,
    (SELECT COUNT(*) FROM salary_components) AS rubricas_base_mantidas,
    (SELECT COUNT(*) FROM payroll_periods) AS payroll_periods_restantes,
    (SELECT COUNT(*) FROM attendance_records) AS presencas_restantes,
    (SELECT COUNT(*) FROM payroll_inss_rules) AS regras_inss_restantes,
    (SELECT COUNT(*) FROM payroll_irt_tables) AS tabelas_irt_restantes,
    (SELECT COUNT(*) FROM deductions) AS descontos_restantes;

-- ============================================================================
-- PASSO DE SEGURANÇA:
-- 1º Execute com ROLLBACK; para simular sem gravar.
-- 2º Depois de confirmar os números acima, substitua ROLLBACK; por COMMIT;
-- ============================================================================
ROLLBACK;
-- COMMIT;
```

### Como executar o ficheiro `.sql` no servidor

```bash
# Com Docker Compose:
docker compose exec -T db sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < reset_prod.sql

# Sem Docker (MySQL nativo):
mysql -u root -p humancore < reset_prod.sql
```

---

## 5. Passo 4 — Limpar Cache, Retomar Serviços e Verificação Pós-Limpeza

1. **Verificar coluna `tenants.config` (se aplicável):** caso alguma empresa tenha configurações de folha de teste gravadas diretamente em `tenants.config`, inspecione antes de começar as novas configurações:
   ```sql
   SELECT id, name, config FROM tenants WHERE config IS NOT NULL;
   ```

2. **Limpar caches do Laravel/Redis, reiniciar o worker e tirar a aplicação de manutenção:**
   ```bash
   # Com Docker Compose:
   docker compose exec app php artisan cache:clear
   docker compose exec app php artisan config:clear
   docker compose start worker
   docker compose exec app php artisan up

   # Sem Docker:
   # php artisan cache:clear && php artisan config:clear && php artisan up
   ```

3. **Limpeza opcional de anexos antigos de relatórios salariais em disco:**
   Após confirmar que tudo está operacional, verifique apenas a pasta de relatórios salariais caso tenha subido PDFs/comprovativos de teste (sem tocar nos documentos ou fotografias de funcionários):
   - Localização típica no container/servidor: `storage/app/private/payroll-reports/` (ou `storage/app/payroll-reports/`).
   - Remova também o ficheiro temporário `reset_prod.sql` do servidor se contiver scripts operacionais desnecessários, mantendo o backup `.sql.gz` em local seguro.

4. **Checklist funcional pós-limpeza (antes de entregar aos utilizadores):**
   - [ ] Login funciona normalmente e as empresas (`tenants`) e respetivos funcionários/contratos aparecem intactos.
   - [ ] Ecrãs de **Regras de INSS**, **Tabelas de IRT**, **Regulamentação de Rubricas**, **Descontos/Benefícios**, **Turnos/Escalas**, **Presenças** e **Folhas de Salário** apresentam-se vazios/prontos para configuração inicial.
   - [ ] As equipas de RH/Contabilidade já podem configurar novas regras de INSS, tabela de IRT, regulamentação das rubricas base (`salary_components`), turnos e descontos a partir do zero.
