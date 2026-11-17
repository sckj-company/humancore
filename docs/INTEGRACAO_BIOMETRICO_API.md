# API de Integração Biométrica — Humancore HRMS

Esta documentação descreve os endpoints REST criados no **Humancore HRMS** para integração direta com o sistema biométrico instalado no computador da entrada (controlo de acessos / leitura de impressão digital).

Todos os cálculos internos de **atraso (`late_minutes`)**, **horas trabalhadas (`total_worked`)**, **horas extras (`overtime_minutes` e `overtime_amount`)**, **férias/feriados**, **faltas automáticas** e **impacto na folha salarial** são automatizados pelo Humancore a partir dos turnos e regras já configuradas na empresa — sem exigir lógica complexa do sistema biométrico.

---

## 1. Base URL, Cabeçalhos e Autenticação

* **Base URL:** `https://<seu-dominio-humancore>/api/v1` (em desenvolvimento local: `http://localhost:8000/api/v1`)
* **Cabeçalhos obrigatórios em todas as chamadas:**
  ```http
  Accept: application/json
  Content-Type: application/json
  Authorization: Bearer <TOKEN_SANCTUM>
  X-Tenant-ID: <ID_DA_EMPRESA>
  ```
  > Nota: `X-Tenant-ID` é obrigatório se o utilizador/token tiver acesso a múltiplas empresas; se pertencer a apenas uma empresa, o sistema resolve-a automaticamente.

### Como obter o `<TOKEN_SANCTUM>`

**Opção A — Via Login HTTP (`POST /api/v1/auth/login`):**
```bash
curl -X POST https://<dominio>/api/v1/auth/login \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "integracao.biometrico@empresa.ao",
    "password": "********"
  }'
```
A resposta retorna `data.token` (use esse valor no header `Authorization: Bearer ...`).

**Opção B — Token dedicado gerado no servidor (recomendado para serviço Windows/Linux na portaria):**
```bash
php artisan biometric:token <TENANT_ID> --name="BiometricEntrancePC"
```

---

## 2. Fluxo Recomendado de Integração

1. **Sincronização de Funcionários (inicial + incremental):**
   * O sistema biométrico consulta `GET /api/v1/integrations/biometric/employees` periodicamente (ex.: a cada 5–15 minutos ou ao adicionar funcionário) passando `?updated_since=<ISO8601>` para receber novos funcionários, atualizações e desativações.
   * Caso o sistema biométrico gere os seus próprios códigos de utilizador (`PIN` / `biometric_code`), envia `POST /api/v1/integrations/biometric/employees/sync` para gravar o `biometric_code` em cada funcionário do Humancore (ou até criar novos funcionários pendentes com `create_missing: true`).
2. **Envio de Marcações Diárias (Tempo Real ou Lote):**
   * Cada vez que um funcionário passa o dedo na entrada ou saída, o sistema da portaria envia `POST /api/v1/integrations/biometric/attendance` (pode enviar 1 evento em tempo real ou até 500 eventos em lote caso tenha estado offline).
   * **Modo automático (`punched_at`):**
     * **1ª leitura do dia** → regista `clock_in` (Entrada), calcula `late_minutes` consoante o turno do funcionário + tolerância, e define `status` (`present` ou `late`).
     * **Leituras repetidas em menos de 2 minutos** (ex.: dedo colocado duas vezes seguidas) → são automaticamente ignoradas (`action: "ignored_duplicate"`).
     * **Leitura posterior no mesmo dia** → regista/atualiza `clock_out` (Saída), calcula `total_worked`, `overtime_minutes` e `overtime_amount`.
3. **Fecho Automático de Ausências (`close-day`):**
   * Ao fim do expediente (ex.: 23:30 ou 23:50), o sistema biométrico pode chamar `POST /api/v1/integrations/biometric/attendance/close-day` para o dia (o Humancore também executa o comando agendado `attendance:mark-biometric-absences` diariamente às `23:50`).
   * Todo funcionário ativo e aprovado que esteja escalado para trabalhar nesse dia, **não** tenha marcação biométrica, **não** esteja de férias/licença aprovada e **não** seja feriado recebe automaticamente registo `status: "absent"`.

---

## 3. Endpoints Disponíveis

### 3.1. Listar / Sincronizar Funcionários (Humancore → Biométrico)

`GET /api/v1/integrations/biometric/employees`

**Parâmetros de Query (todos opcionais):**

| Parâmetro | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| `updated_since` | ISO 8601 / DateTime | `null` | Retorna apenas registos alterados ou eliminados desde esta data/hora (`withTrashed`). |
| `status` | `active` \| `inactive` \| `terminated` \| `on_leave` \| `all` | `active` | Filtra estado laboral. |
| `only_approved` | boolean (`0`/`1`) | `1` | Se `1`, retorna apenas funcionários aprovados pelo RH. |
| `search` | string | `null` | Pesquisa por nome, código ou documento. |
| `per_page` | integer (1–1000) | `200` | Tamanho da página. |
| `all` | boolean (`0`/`1`) | `0` | Se `1`, devolve todos sem paginação. |

**Exemplo de Request:**
```bash
curl -X GET "https://<dominio>/api/v1/integrations/biometric/employees?all=1" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "X-Tenant-ID: 1" \
  -H "Accept: application/json"
```

**Exemplo de Response (`200 OK`):**
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "synced_at": "2026-11-17T14:30:00+01:00",
    "total": 1,
    "employees": [
      {
        "id": 42,
        "employee_code": "EMP-0042",
        "biometric_code": "1042",
        "has_explicit_biometric_code": true,
        "first_name": "Carlos",
        "last_name": "Mendes",
        "full_name": "Carlos Mendes",
        "id_document_number": "004512389LA041",
        "email": "carlos.mendes@empresa.ao",
        "phone": "+244923000111",
        "department_id": 3,
        "department": "Operações",
        "position_id": 7,
        "position": "Técnico Sénior",
        "status": "active",
        "approval_status": "approved",
        "is_active": true,
        "shift": {
          "id": 1,
          "name": "Turno Geral",
          "code": "TG-01",
          "start_time": "08:00:00",
          "end_time": "17:00:00",
          "late_tolerance_minutes": 10,
          "working_days": [1, 2, 3, 4, 5],
          "is_night_shift": false
        },
        "updated_at": "2026-11-17T10:15:22+01:00",
        "deleted_at": null
      }
    ]
  }
}
```

---

### 3.2. Sincronizar / Vincular Códigos Biométricos (Biométrico → Humancore)

`POST /api/v1/integrations/biometric/employees/sync`

Associa o `biometric_code` do leitor da entrada aos funcionários existentes no Humancore (procurando por `employee_id`, `biometric_code`, `employee_code` ou `id_document_number`), sem alterar salários ou contratos. Opcionalmente cria funcionários novos com `create_missing: true` (ficam com `approval_status = "pending"` para revisão do RH).

**Payload JSON:**
```json
{
  "create_missing": false,
  "employees": [
    {
      "employee_code": "EMP-0042",
      "biometric_code": "1042"
    },
    {
      "id_document_number": "009988776LA042",
      "biometric_code": "1043"
    }
  ]
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Sincronização de funcionários concluída.",
  "data": {
    "processed": 2,
    "updated": 2,
    "created": 0,
    "not_found": 0,
    "errors": 0,
    "items": [
      {
        "index": 0,
        "status": "updated",
        "employee_id": 42,
        "employee_code": "EMP-0042",
        "biometric_code": "1042",
        "full_name": "Carlos Mendes"
      }
    ]
  }
}
```

---

### 3.3. Registar Presenças Biométricas (Tempo Real ou Lote)

`POST /api/v1/integrations/biometric/attendance`

Aceita **1 registo direto no corpo JSON** ou **lote até 500 registos** no array `punches` (ou `records`).

Para identificar o funcionário em cada item, envie **qualquer um** destes campos:
* `biometric_code` (ou alias `biometric_id`)
* `employee_code`
* `employee_id`
* `id_document_number`

#### Formato A — Leitura Bruta do Terminal (`punched_at`) **[Recomendado]**

Ideal quando o leitor envia cada leitura de digital diretamente:

```json
{
  "device_name": "Portaria Principal - Leitor 01",
  "debounce_seconds": 120,
  "punches": [
    {
      "biometric_code": "1042",
      "punched_at": "2026-11-17T08:25:00+01:00",
      "direction": "auto"
    },
    {
      "biometric_code": "1042",
      "punched_at": "2026-11-17T18:30:00+01:00",
      "direction": "auto"
    }
  ]
}
```

* `direction`: `"auto"` (padrão), `"in"` (forçar entrada) ou `"out"` (forçar saída).
* `force`: `true` para ignorar a proteção contra leitura duplicada (`debounce_seconds`, padrão `120`s).

**Exemplo envio unitário (1 leitura em tempo real):**
```json
{
  "biometric_code": "1042",
  "punched_at": "2026-11-17T08:25:00+01:00",
  "device_name": "Portaria Principal"
}
```

#### Formato B — Resumo Diário (`date` + `clock_in` / `clock_out` / `status`)

Ideal se o software do PC já consolida entrada e saída por dia antes de enviar:

```json
{
  "device_name": "Biometrico-PC-Entrada",
  "punches": [
    {
      "biometric_code": "1042",
      "date": "2026-11-17",
      "clock_in": "08:25",
      "clock_out": "18:30"
    },
    {
      "employee_code": "EMP-0045",
      "date": "2026-11-17",
      "status": "absent",
      "deduct_from_salary": true,
      "notes": "Falta reportada pelo terminal"
    }
  ]
}
```

**Response (`200 OK` / `201 Created` em envio único):**
```json
{
  "success": true,
  "message": "Marcações biométricas processadas com sucesso.",
  "data": {
    "processed": 2,
    "created": 1,
    "updated": 1,
    "ignored_duplicates": 0,
    "failed": 0,
    "results": [
      {
        "index": 0,
        "action": "created",
        "attendance_record_id": 501,
        "employee_id": 42,
        "employee_code": "EMP-0042",
        "biometric_code": "1042",
        "date": "2026-11-17",
        "clock_in": "08:25:00",
        "clock_out": null,
        "total_worked": 0,
        "late_minutes": 15,
        "overtime_minutes": 0,
        "overtime_amount": null,
        "status": "late"
      },
      {
        "index": 1,
        "action": "updated",
        "attendance_record_id": 501,
        "employee_id": 42,
        "employee_code": "EMP-0042",
        "biometric_code": "1042",
        "date": "2026-11-17",
        "clock_in": "08:25:00",
        "clock_out": "18:30:00",
        "total_worked": 605,
        "late_minutes": 15,
        "overtime_minutes": 90,
        "overtime_amount": 3750,
        "status": "late"
      }
    ]
  }
}
```

> Em lote, se um item falhar (ex.: código biométrico desconhecido ou funcionário não aprovado), apenas aquele item aparece com `"action": "error"` em `results` e os restantes itens válidos do lote continuam a ser gravados normalmente.

---

### 3.4. Fecho Diário / Registo Automático de Ausências

`POST /api/v1/integrations/biometric/attendance/close-day`

Percorre todos os funcionários ativos e aprovados do tenant na data indicada e cria automaticamente `status = "absent"` para quem **não registou ponto** nesse dia, **respeitando**:
* **Feriados** da empresa (`holidays`);
* **Férias e licenças aprovadas** (`leave_requests`);
* **Dias de folga da escala/turno** (`employee_schedules` / `shifts`, ou Sáb/Dom por padrão).

**Payload JSON (todos os campos opcionais):**
```json
{
  "date": "2026-11-17",
  "deduct_from_salary": false
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Fecho diário de presenças concluído.",
  "data": {
    "date": "2026-11-17",
    "is_holiday": false,
    "holiday_name": null,
    "marked_absent_count": 3,
    "skipped_existing_count": 45,
    "skipped_leave_count": 2,
    "skipped_offday_count": 1,
    "absent_employee_ids": [18, 24, 31]
  }
}
```

---

## 4. Regras de Cálculo Automático Aplicadas pelo Humancore

1. **Atrasos (`late_minutes`):** diferença em minutos entre `clock_in` e `shift.start_time + shift.late_tolerance_minutes` (ou configurações `hr.work_start_time` + `hr.late_grace_minutes`). Se `late_minutes > 0`, o estado torna-se `late`.
2. **Horas Trabalhadas (`total_worked`):** minutos decorridos entre `clock_in` e `clock_out` (incluindo suporte a turnos noturnos que atravessam a meia-noite). Se trabalhar menos de metade da carga diária (`hr.daily_hours * 30` min), o estado passa a `half_day`.
3. **Horas Extras (`overtime_minutes` e `overtime_amount`):** minutos após `shift.end_time` (ou `hr.work_end_time`), multiplicados automaticamente pelo valor/hora extra do funcionário (`overtime_hourly_rate`) quando configurado.
4. **Folha Salarial:** toda criação ou atualização de presença dispara automaticamente a sinalização na folha salarial aberta correspondente (`PayrollSyncService::markOutdatedForAttendance`).
5. **Segurança & Auditoria:** todas as operações exigem token válido (`auth:sanctum`), isolamento por empresa (`SetTenantContext`) e permissões de RH/Presenças, ficando registadas no log de auditoria com IP e `device_info`.
