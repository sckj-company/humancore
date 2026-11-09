# HRMS — Human Resources Management System

> Enterprise-grade HRMS. Multi-tenant, multi-language, configurable. Initially focused on the Angolan market, architected for global deployment.

## Status

**Phase 1 — Foundation (P0)** ✅ Complete

Implemented:
- Laravel 13 backend with Sanctum auth, multi-tenancy, RBAC (Spatie Permissions)
- React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui frontend
- Apache ECharts for analytics
- 14 core database tables (tenants, branches, departments, positions, employees, contracts, payroll, attendance, leave, etc.)
- Auth: login, logout, me, token issuance
- Multi-tenant isolation (tested with 4 scenarios)
- API endpoints: tenants, employees, departments, positions, branches, contracts
- Dashboard HR/Manager/Employee with KPIs and ECharts visualisations
- Employee CRUD (list, detail, create)
- Departments and positions listing
- Form validation (Zod on frontend, Form Requests on backend)
- 297 permissions × 5 roles seeded (super-admin, admin, hr-manager, manager, employee)
- Demo data (1 tenant, 5 employees, 7 users)
- 11 backend tests passing (auth, tenant isolation, dashboard)

## Stack

| Layer | Tech |
|-------|------|
| Backend | Laravel 13, PHP 8.4, Sanctum, Spatie Permission, Horizon, DomPDF, SimpleQRCode |
| Frontend | React 19, TypeScript 5, Tailwind 4, shadcn/ui, Apache ECharts |
| DB | MySQL 8 (port 3307 — custom instance for this project) |
| Cache/Queue | Redis 6, Laravel Horizon |
| Test | PHPUnit |

## Project Structure

```
/var/www/html/RH/
├── backend/          # Laravel API
├── frontend/         # React SPA
├── MASTER_DEVELOPMENT_PLAN.md  # Source of truth
└── README.md
```

## Quick Start

### Prerequisites
- PHP 8.4 with extensions: pdo_mysql, redis, mbstring, intl, gd, zip
- Composer 2.x
- Node.js 22+, npm 10+
- MySQL 8
- Redis 6
- A local MySQL instance on port 3307 (see Notes)

### Backend
```bash
cd backend
cp .env.example .env  # already configured
php artisan migrate --seed
php artisan db:seed --class=DemoSeeder  # optional
php artisan serve --host=127.0.0.1 --port=8000
```

### Leitura de BI no cadastro
Configure `GROQ_API_KEY` no `.env` do backend para ativar a leitura assistida de imagens e PDFs digitalizados do BI (upload máximo de 5 MB). A integração usa a API compatível com OpenAI da Groq e o modelo de visão `qwen/qwen3.8-27b` por padrão. Conforme a [documentação de visão da Groq](https://console.groq.com/docs/vision), o pedido tem no máximo 3 imagens, cada uma contabilizada como até 2.048 tokens de entrada, e o pedido com imagens não pode exceder 20 MB. Assim, três páginas consomem até cerca de 6.144 tokens de imagem, além do prompt atual de 51 palavras; a saída está limitada a 256 tokens. As imagens são redimensionadas para no máximo 1.800 px e o conjunto comprimido fica limitado a 12 MiB, mantendo o pedido codificado abaixo do limite documentado. PDFs são convertidos no servidor (Poppler), com no máximo 3 páginas por pedido. Os limites podem ser reduzidos por `GROQ_OCR_MAX_IMAGES`, `GROQ_OCR_MAX_PDF_PAGES`, `GROQ_OCR_MAX_PROMPT_WORDS`, `GROQ_OCR_MAX_COMPLETION_TOKENS` e `GROQ_OCR_MAX_IMAGE_BYTES`; os limites de imagem/página não ultrapassam o teto suportado pelo serviço. Limites de RPM/TPM da conta Groq são específicos da organização; se ocorrer HTTP 429, o endpoint devolve uma resposta temporária com `Retry-After`. O documento é enviado à Groq apenas após confirmação do operador; a chave nunca é exposta ao frontend e o endpoint não guarda o documento no HumaCore. Os dados devolvidos são sugestões e devem ser confirmados pelo operador.

### Frontend
```bash
cd frontend
npm install
npm run dev  # http://localhost:5173
```

## Deploy com Docker em VPS Ubuntu

O Compose executa a aplicação React, a API Laravel, MySQL, Redis e o worker de filas. O Caddy recebe o tráfego na porta `5173`, encaminha `/hrms/` para a aplicação e `/api/` para a API. MySQL e Redis ficam apenas na rede interna do Docker; uploads, dados do banco e filas persistem em volumes.

1. Instale Docker Engine e o plugin Docker Compose na VPS e libere a porta `5173` no firewall.
2. Na raiz do projeto, crie o arquivo de ambiente e configure senhas fortes para o banco:

   ```bash
   cp .env.docker.example .env
   nano .env
   ```

   Configure também `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` no `.env` da raiz para uploads no Cloudinary; `GROQ_API_KEY` é opcional e ativa a leitura assistida de BI. Para recuperação de palavra-passe por email, preencha `BREVO_API_KEY` e `BREVO_SENDER_EMAIL` (remetente validado na Brevo) e, opcionalmente, `BREVO_SENDER_NAME`. O Compose passa o `.env` da raiz ao backend e ao worker; `backend/.env` não é usado pelo Compose.

3. Gere a chave Laravel e copie o valor impresso para `APP_KEY` no `.env`:

   ```bash
   docker compose build
   docker compose run --rm --no-deps app php artisan key:generate --show
   ```

4. Inicie os serviços e aplique as migrations:

   ```bash
   docker compose up -d
   docker compose exec app php artisan migrate --force
   docker compose exec app php artisan db:seed --class=PermissionSeeder --force
   ```

   Crie o primeiro superadministrador com uma senha própria:

   ```bash
   docker compose exec -it app php artisan tinker
   ```

   No Tinker, substitua nome, e-mail e senha:

   ```php
   $user = \App\Models\User::create(['name' => 'Administrador', 'email' => 'admin@example.com', 'password' => 'SENHA_FORTE', 'locale' => 'pt', 'timezone' => 'Africa/Luanda', 'is_active' => true]);
   $user->forceFill(['email_verified_at' => now()])->save();
   $user->assignRole('super-admin');
   ```

5. Acesse `http://IP_DA_VPS:5173/hrms/`. A página inicial `/` redireciona para `/hrms/`.

Para acompanhar os serviços: `docker compose ps` e `docker compose logs -f app caddy`. Faça backup dos volumes `mysql_data` e `app_uploads` antes de atualizações ou manutenção. Não use `docker compose down -v` em produção, pois isso remove os volumes persistentes.

### Atualizações automáticas após `git pull` na VPS

Para que cada `git pull` bem-sucedido reconstrua o frontend e o backend, aplique as migrations pendentes e reinicie os serviços, instale o hook de deploy uma vez na VPS, a partir da raiz do repositório:

```bash
./scripts/install-vps-deploy-hook.sh
```

O instalador valida Docker Compose e `.env`, ativa os hooks apenas nesta cópia local do repositório e executa o primeiro deploy. Depois, cada `git pull` que atualize o checkout executa automaticamente `scripts/deploy-vps.sh`, incluindo pull com merge ou rebase. O deploy compila as imagens, mantém a aplicação em manutenção enquanto pára API/worker, executa `php artisan migrate --force` no container atualizado e só então inicia os serviços novos. Se uma migration falhar, o script termina com erro e não reabre a aplicação; consulte a mensagem no terminal e os logs antes de corrigir e executar novamente `./scripts/deploy-vps.sh`.

Antes de cada atualização em produção, faça backup dos dados e confirme que as alterações recebidas são de uma origem confiável: o hook executa o script versionado pelo repositório. Para desativar a automação nesta VPS, execute `git config --local --unset core.hooksPath`; será necessário então executar manualmente `./scripts/deploy-vps.sh` após cada pull.

Não execute `php artisan db:seed` sem `--class` numa instalação de produção: o seeder padrão cria uma conta de superadministrador com credenciais conhecidas. Também não use as contas de demonstração em produção.

O Caddy está configurado para HTTP direto na porta `5173`. Como esta aplicação processa dados pessoais e salariais, use HTTPS antes de disponibilizá-la publicamente: configure um domínio apontado para a VPS, adapte o endereço do site no `Caddyfile` e publique as portas `80` e `443` no firewall e no Compose.

### Test accounts
| Role | Email | Password |
|------|-------|----------|
| Super-admin | `superadmin@hrms.local` | `password` |
| Admin | `admin@empresa-demo.local` | `password` |
| HR Manager | `joao.silva@empresa-demo.local` | `password` |
| Manager | `carlos.mendes@empresa-demo.local` | `password` |
| Employee | `ana.costa@empresa-demo.local` | `password` |

## Notes

- The project's MySQL instance is running on **port 3307** (a custom mysqld managed under `/tmp/hrms-mysql/`) because the system MySQL root requires sudo-only access.
- The Vite dev server proxies `/api/*` to the Laravel backend.

## Architecture

See `MASTER_DEVELOPMENT_PLAN.md` for the full architecture, design system, multi-tenancy strategy, security model, payroll engine, and roadmap.

## Tests

```bash
cd backend && php artisan test --compact
```
