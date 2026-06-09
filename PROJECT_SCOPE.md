# Project Scope

## Product

Esta Workforce OS

## Phase 1

Phase 1 targets:

1. Human Resource Management System (HRMS)
2. Employee monitoring

## Implemented Foundation

- NestJS backend with configuration, Swagger, and health checks.
- PostgreSQL persistence through Prisma.
- SaaS tenant base: companies, branches, departments, designations, and shifts.
- User and company-scoped role structure.
- JWT access authentication and rotating refresh tokens.
- Seeded super admin, demo company, company admin, and default roles.
- Audit-log storage for successful authentication events.
- Local PostgreSQL, Redis, and MinIO infrastructure.

## Current Auth Scope

- Login, token refresh, logout, and current-user APIs.
- Active-user and active/trial-company checks.
- Password hashing with bcrypt.
- Passport JWT guard and current-user decorator.
- Refresh-token hashing, expiration, rotation, and revocation.

## Foundation TODOs

- Redis integration is deferred until a cache or short-lived state use case is
  implemented.
- MinIO integration is deferred until an object-storage use case is
  implemented.
- Tenant composite constraints must be added before organization-management
  APIs can create or update related tenant records.
- A PostgreSQL partial unique index is required for global roles where
  `companyId` is null.
- Backend unit, integration, and API tests remain to be implemented.

## Explicitly Out of Scope

- Employee management.
- Attendance and leave management.
- Employee monitoring.
- CRM, ERP, AI, and billing.
- Admin panel screens and desktop-agent implementation.
- Production deployment and CI/CD.

Detailed permissions, tenant administration APIs, monitoring policies, privacy
controls, and data-retention rules remain future work.
