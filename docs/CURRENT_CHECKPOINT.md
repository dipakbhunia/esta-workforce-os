# Esta Workforce OS — Current Checkpoint

## SA-C2.2 Company Lifecycle Security Correction — published 2026-10-28

- Branch: `main`
- Local `HEAD` and `origin/main`:
  `11c8b7d5d54088ea83202199f036cf83ae77f90c`
- Commit: `fix(companies): secure lifecycle transitions and concurrency`
- Scope: five paths (four modified, one added), with no schema or migration
  change.
- Repository migration directories: 60.

Platform `SUPER_ADMIN` exclusively controls Company lifecycle status changes.
Tenant `COMPANY_ADMIN` retains permitted profile editing but cannot reactivate
a suspended Company or make another lifecycle mutation; cross-tenant mutation
remains denied. `initialAdmin` is excluded from Company updates, while Company
creation and initial-administrator provisioning remain supported.

Company update and archive now acquire a transaction-local PostgreSQL row lock.
Lifecycle audits use the locked prior status, archive/status contention cannot
resurrect an archived Company, and lifecycle mutation plus audit creation is
atomic. Independent database-free review recorded 46 passed tests with one
integration suite skipped. Final disposable PostgreSQL verification recorded
6 passed, 0 failed, and 0 skipped after all 60 migrations were applied. Backend
build and Prisma validation passed. The disposable container and volume were
removed, and protected PostgreSQL resources were preserved.

Open SA-C2.2 findings:

- **LOW-1:** the test harness rejects Docker IPv4 addresses ending in `.0` or
  `.255` without subnet-aware evaluation.
- **LOW-2:** the integration test uses a 150 ms timing-based pending-lock
  observation.

Completed scope includes implementation, authorization regression coverage,
real PostgreSQL concurrency and audit-atomicity verification, independent
security review, and exact-scope Git publication. Authenticated Company
Management browser acceptance, the unified onboarding-readiness contract,
billing-profile onboarding, dirty-form navigation protection, broader Company
Management UI acceptance, and later roadmap phases remain pending. Company
Admin login development is not claimed complete. SA-C2 overall is not fully
accepted; SA-C2.3 Unified Company Onboarding Readiness Contract is the next
planned separately authorized checkpoint.

## SA-C1 User-Based Billable Seat Authority — published 2026-10-28

- Branch: `main`
- Local `HEAD` and `origin/main`:
  `d7477eb22765f10887eaf165643616710afdda8c`
- Commit: `fix(billing): use tenant users for billable seat authority`
- Scope: 21 paths (18 modified, 3 added), with no schema or migration change.
- Repository migration directories: 60.

SA-C1.1 completed the authority audit; SA-C1.2 implemented the correction;
SA-C1.3 passed 4/4 disposable PostgreSQL integration tests with all 60
migrations applied; SA-C1.4 completed independent security and financial
review; SA-C1.5 verified exact staging; SA-C1.6 created the local commit; and
SA-C1.7 independently verified the GitHub fast-forward push and clean 0/0
synchronization.

Billable seats now count matching-company, `ACTIVE`, non-deleted tenant Users,
once per User. Multi-role Users remain deduplicated, Employee profiles are not
required, and Employee lifecycle does not independently allocate or release a
seat. Administrative reactivation and invitation activation enforce capacity
transactionally under the company-row mutex. Prisma counting, aggregate SQL,
company detail views, and Admin Usage & Seats presentation share this authority.

Historical subscription quantities and pricing snapshots, renewals, invoices,
payments, and GST records were not rewritten. No automatic repricing or
backfill was introduced, and explicit below-usage override semantics remain.
Populated financial-history PostgreSQL regression coverage remains a
non-blocking LOW follow-up; full financial browser E2E coverage is not claimed.

Open findings remain:

- SA-C0 LOW-1: hard-coded SMTP QA database identity and port.
- SA-C0 LOW-2: external disposable-database ownership attestation.
- SA-C0 LOW-3: missing dedicated two-tenant activation regression.
- SA-C1 LOW: populated financial-history regression coverage.
- SA-C1 LOW: disposable test fence relies on positive identity and external
  ownership.
- SA-C1 LOW: possible test-owned fixture residue before disposable database
  destruction.
- Historical backend TypeScript test-fixture typing debt.

SA-C0 and SA-C1 implementation, verification, and Git publication are complete.
SA-C2.2 is now published as described above; its completion does not complete
SA-C2 overall or tenant-role development.

## EMAIL-QA.3C.4P published checkpoint — 2026-10-23

- Branch: `main`
- Local `HEAD` and `origin/main`:
  `a827ee09bb6bbe607e88ef652fbd71e2b766e36c`
- Commit: `feat: add secure restricted platform invitation delivery`
- Accepted and committed scope: 23 implementation paths, with no schema or
  migration change.
- Repository migration directories: 60.
- Live application-database applied-migration state was not reverified during
  this documentation-only synchronization.

EMAIL-QA.3C.4P.9 recorded **PASS WITH CONDITIONS**. Its historical evidence is
104/104 focused backend tests, 16/16 focused Admin tests, 14/14 disposable
PostgreSQL integration assertions, backend/Admin production builds, Admin
TypeScript validation, Prisma validation, and Git diff verification. Account-B
performed both P.8 verification and the P.9 full-scope review, so P.9 is fresh
review evidence but not a fully independent third-reviewer assessment. P.10
reported READY FOR CHECKPOINT; P.11A verified staging; P.11B created the local
commit; and P.11C verified the remote push and clean 0/0 synchronization.

Implemented scope includes Platform `SUPER_ADMIN`-only, tenant-isolated,
server-computed restricted invitation eligibility shared consistently by GET
and POST, restricted dispatch, explicit Admin User Details confirmation,
unique server-selected tested/inactive SMTP authority, configuration
ID/revision fencing, target-scoped invitation issuance protection, durable
STARTED/COMPLETED audit fencing, pre-send revalidation, duplicate-send
prevention, and provider-uncertainty quarantine without automatic retry.

Open findings:

- **LOW-A:** malformed trusted STARTED evidence can broadly block invitation
  issuance, including unrelated tenant invitations. Preserve audit evidence,
  create a manual reconciliation runbook, and consider future blast-radius
  hardening without weakening fail-closed behavior.
- **LOW-B:** opt-in PostgreSQL suites can collide if run concurrently against
  one disposable database. Run them sequentially or use isolated databases
  until fixture isolation improves.

Pending work includes authenticated browser QA, controlled runtime
verification, one restricted Platform Super Admin invitation dispatch,
invitation-link acceptance/account activation, uncertain-provider operational
reconciliation, general Email Notification Worker production hardening,
Email Templates/delivery-tracking operational follow-through, automatic
eligible-user invitations, automated password-reset/email-verification
delivery, and tenant-domain support. General automatic delivery remains
disabled and outside the restricted-bootstrap checkpoint. At the last verified
checkpoint, all four email gates were disabled; this documentation task did not
reverify runtime values.

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

- Preserve the published SA-C2.2 lifecycle correction and complete authenticated
  Company Management browser acceptance, onboarding-readiness, billing-profile
  onboarding, dirty-form navigation, and broader UI acceptance work.
- Plan SA-C2.3 Unified Company Onboarding Readiness Contract as a separate
  authorized checkpoint; do not treat it as implemented.
- Preserve the published user-based billable-seat authority and complete its
  remaining LOW regression/fencing follow-ups.
- EC-B1–EC-B2D.3 SMTP configuration, authority, and worker backend is verified
  in published commit `1ab1af2`. EC-B2D.4 passed 16/16 executable checks but is
  blocked on genuine approved-provider connection and restricted test-email
  acceptance; simulated evidence is not provider acceptance or inbox delivery.
- Replica key-ring parity, exact-host allowlist and DNS/TLS readiness,
  deployment approval, and migrations 54–59 rollout remain pending. The
  management gate is false by default and no application cutover occurred.
- EC-B2D.5 Email Configuration UI is implemented with focused automated
  verification in published commit `1ab1af2`; genuine browser QA remains pending.
  ET-B1–ET-B5 Email Templates database, management API, validation/preview,
  runtime integration, and Admin UI are implemented and automatically verified
  in published commit `1ab1af2`. ET-B6 fresh migrations and isolated PostgreSQL
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
  correction is required. At the last verified operational state, no
  application-database deployment had occurred. At the CP-R4 pre-commit
  snapshot, migration 59 was in local commit `75ce727`,
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

Preserve the onboarding files, historical migrations 1–59, migration 60, and
both DOCX sources. Do not infer or change live database state from repository
migration count, and do not enable SMTP management or general delivery without
a separately approved deployment. Do not stage,
commit, or push this documentation before strict read-only review and explicit
checkpoint authorization. Do not claim production readiness.
