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
Configure `OCR_SPACE_API_KEY` no `.env` do backend para ativar a leitura assistida de imagens e PDFs digitalizados do BI (máximo de 5 MB). O documento é enviado ao [OCR.space](https://ocr.space/ocrapi) apenas após confirmação do operador e a chave nunca é exposta ao frontend. O endpoint de leitura não guarda o documento no HumaCore; o formulário recebe sugestões para revisão. O plano gratuito do fornecedor documenta um limite de 500 pedidos por dia e por IP.

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
