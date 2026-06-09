# Esta Workforce OS

Esta Workforce OS is a workforce management platform. Phase 1 is focused on
HRMS capabilities and employee monitoring.

## Technology

- Backend: NestJS with TypeScript
- Admin panel: React with TypeScript
- Desktop agent: Electron, React, and TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Cache: Redis
- Object storage: MinIO

## Repository Structure

```text
backend/        NestJS API and Prisma integration
admin-panel/    React-based administration interface
desktop-agent/  Electron-based employee desktop application
shared/         Shared types, contracts, and utilities
```

The backend includes the SaaS tenant, user/role, and authentication foundation.
The admin panel, desktop agent, shared package, and HRMS or monitoring business
modules have not been scaffolded yet.

## Local Infrastructure

1. Copy `.env.example` to `.env`.
2. Update credentials and JWT secrets for your environment.
3. Start the infrastructure:

```bash
docker compose up -d
```

The compose stack provides PostgreSQL, Redis, and MinIO. MinIO's API is exposed
on port `9000` and its console on port `9001` by default.

PostgreSQL is integrated with the backend and checked by `/api/health`. Redis
and MinIO are provisioned for future use but are not connected to backend
services or included in the health response yet.

## Backend

The backend reads its environment variables from the root `.env` file.

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init_auth_tenant_base
npm run prisma:seed
npm run start:dev
```

- Health API: `http://localhost:3000/api/health`
- Swagger docs: `http://localhost:3000/api/docs`
- Auth API base: `http://localhost:3000/api/auth`

Development company-admin login:

```json
{
  "email": "admin@demo.esta.local",
  "password": "CompanyAdmin@123"
}
```

Change all example secrets and seed passwords outside local development.

Employee, attendance, leave, monitoring, CRM, ERP, AI, and billing modules are
not included at this stage.

## Foundation TODOs

- Integrate Redis when caching or short-lived application state is introduced.
- Integrate MinIO when object-storage workflows are introduced.
- Add tenant-aware composite database constraints before organization
  management APIs can assign cross-related records.
- Add a PostgreSQL partial unique index to enforce one global role per role name
  where `companyId` is null.
- Add automated backend unit, integration, and authentication API tests.
