# Esta Workforce OS — Current Checkpoint

## CP-R4 pre-commit Git snapshot — 2026-10-13

This section records historical pre-commit state. It is intended to remain
accurate after documentation commit 4 or a later push.

- Branch: `main`
- `origin/main` was `a19f8497f96f0d8a4e48c8aa61abcc93b2f9dad8`.
- Local `HEAD` was `75ce727d8e6e55a331a8c0ac212e159d9c9ac703`.
- Local `main` was three commits ahead and zero behind.
- Commit 1: `0c119c1df195e268165750e408507fa3c9c0a11c`,
  `fix: harden onboarding and dashboard date behavior` (12 files)
- Commit 2: `1ab1af2eeb208aa692373989399554443ab5e322`,
  `feat: add managed platform email administration` (91 files)
- Commit 3: `75ce727d8e6e55a331a8c0ac212e159d9c9ac703`,
  `fix: converge subscription renewal integrity` (2 files)
- Commits 1–3 existed only locally. Documentation commit 4 and push remained
  pending; the complete four-commit checkpoint was not finalized.
- The published phase was still PC-M2,
  `feat: add subscription and renewal commercial emails`.
- Stable-checkpoint migrations: 53
- Current verified worktree migrations on disk: 59
- `esta_workforce`: 53 applied; migrations 54–59 pending
- Migration 59: implemented and reviewed; not applied to `esta_workforce`

This supersedes the roadmap's historical SA-H1C.1/migration-36 snapshot for
current-status reporting.

## Company Onboarding correction

The following reviewed correction files are now included across local commits
`0c119c1` and `1ab1af2`:

1. `admin-panel/src/features/organization/pages/CompanyCreatePage.tsx`
2. `admin-panel/src/features/organization/services/companies-api.spec.ts`
3. `admin-panel/src/features/organization/services/companies-api.ts`
4. `admin-panel/src/features/organization/types/company.types.ts`
5. `backend/src/modules/identity-actions/identity-actions.integration.spec.ts`

6. `admin-panel/src/features/organization/pages/CompanyCreatePage.spec.tsx`

The accepted audit says the correction passed strict review. Manual browser
verification remained pending. At the CP-R4 snapshot, push was also pending and
the complete checkpoint was not closed.

## Authoritative documents

- `docs/EstaAI Workforce OS.docx`
- `docs/Esta_Workforce_OS_Super_Admin_Final_Requirements_and_Roadmap.docx`

They were supplied after PC-M2 and must remain unchanged.

## Pending work

- Company Onboarding manual QA and checkpoint.
- User-based billable-seat authority.
- EC-B1–EC-B2D.3 SMTP configuration, authority, and worker backend is verified
  in local commit `1ab1af2`. EC-B2D.4 passed 16/16 executable checks but is
  blocked on genuine approved-provider connection and restricted test-email
  acceptance; simulated evidence is not provider acceptance or inbox delivery.
- Replica key-ring parity, exact-host allowlist and DNS/TLS readiness,
  deployment approval, and migrations 54–59 rollout remain pending. The
  management gate is false by default and no application cutover occurred.
- EC-B2D.5 Email Configuration UI is implemented with focused automated
  verification in local commit `1ab1af2`; genuine browser QA remains pending.
  ET-B1–ET-B5 Email Templates database, management API, validation/preview,
  runtime integration, and Admin UI are implemented and automatically verified
  in local commit `1ab1af2`. ET-B6 fresh migrations and isolated PostgreSQL
  foundation/management/runtime/delivery verification passed. ET-B6.1 isolated
  real-HTTP verification passed for JWT authentication, the 24-event catalog,
  draft/edit fencing, validation, preview, publication, history, rollback, and
  tenant denial. No safe bounded application HTTP endpoint exists for managed
  notification creation, so composition/provenance remains verified through
  service/PostgreSQL tests. Genuine browser QA is blocked because no controllable
  browser was available.
- EV-D2–EV-D4 current-email verification and Account Security UI are present;
  EV-D4.1 isolated backend-to-SMTP evidence exists, while genuine responsive/
  keyboard browser verification remains pending.
- Migration 59 implements the forward-only Subscription Renewal integrity
  convergence. DB-R3.5 passed disposable fresh migrations 1–59 and a restored
  historical upgrade through migrations 54–59, preserving migration 40's
  historical checksum. DB-R3.6B confirmed technical readiness and withdrew the
  incorrect Prisma index-mapping finding: the historical id-based index is
  distinct from the retained Prisma paymentId-based index, so no Prisma schema
  correction is required. No application-database deployment has occurred.
  At the CP-R4 pre-commit snapshot, migration 59 was in local commit `75ce727`,
  while documentation commit 4 and push remained pending.
- Platform Reports and Platform Settings.
- Shell/header and tenant-domain phases. Tenant domains remain a later
  dedicated pre-launch phase; current Company Code and `Company.slug` are not
  hostname authority, and company-subdomain support is not implemented.
- Final functional, UI/UX, security, and release reviews.

Three local invoice-recovery candidates are blocked by
`BILLING_PROFILE_INCOMPLETE`. Treat this as a billing-profile prerequisite;
do not bypass invoice integrity.

## Safety

Preserve the onboarding files, historical migrations 1–58, migration 59, and
both DOCX sources. Do not apply migrations 54–59 to `esta_workforce` or enable
the SMTP management gate without a separately approved deployment. Do not stage,
commit, or push this documentation before strict read-only review and explicit
checkpoint authorization. Do not claim production readiness.
