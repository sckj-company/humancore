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

### Frontend
```bash
cd frontend
npm install
npm run dev  # http://localhost:5173
```

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
