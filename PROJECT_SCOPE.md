# Esta Workforce OS — Master Project Scope

## 1. Purpose and authority

This document is the master scope index for Esta Workforce OS, a multi-tenant
Workforce Operating System for SMEs, agencies, IT companies, BPOs, sales
teams, remote teams, and enterprises.

Requirements and status must be interpreted in this order:

1. [Original Enterprise SaaS Architecture/SOW](docs/EstaAI%20Workforce%20OS.docx)
   defines the long-term product vision and feature envelope.
2. [Super Admin Final Requirements and Roadmap](docs/Esta_Workforce_OS_Super_Admin_Final_Requirements_and_Roadmap.docx)
   defines approved Super Admin architecture, business rules, UX rules, and
   delivery dependencies.
3. The repository and reviewed stable checkpoints establish what is currently
   implemented.
4. Historical checkpoint values in the roadmap are history only. In
   particular, SA-H1C.1 and migration 36 are not the current state.

Status terms are **IMPLEMENTED AND VERIFIED**, **PARTIALLY IMPLEMENTED**,
**FOUNDATION ONLY**, **PLANNED**, **DEFERRED**, and **NOT VERIFIED**. A route
labelled `Coming Soon` is not an implementation. This document does not declare
overall production readiness or completion of the full SOW.

## 2. Current checkpoint

### SA-C1 User-Based Billable Seat Authority checkpoint — 2026-10-28

Commit `d7477eb22765f10887eaf165643616710afdda8c` is published on synchronized
local and remote `main`. SA-C1.1 audited the authority; SA-C1.2 implemented the
correction; SA-C1.3 passed 4/4 disposable PostgreSQL integration tests against
all 60 migrations; SA-C1.4 completed independent security and financial review;
and SA-C1.5–SA-C1.7 verified exact staging, local commit, and GitHub publication.
No schema or migration change was required.

Billable seats now count each matching-company, `ACTIVE`, non-deleted tenant
`User` exactly once. Role multiplicity and the presence of an `Employee` profile
do not change the count. Administrative reactivation and invitation activation
enforce capacity transactionally under the company-row mutex, while Employee
lifecycle changes do not allocate or release commercial seats. Historical
subscription quantities, pricing snapshots, renewals, invoices, payments, and
GST records were not rewritten; no repricing or backfill was introduced.

Open SA-C1 LOW follow-ups are populated financial-history regression coverage,
the disposable test fence's reliance on positive identity and external
ownership, and possible test-owned fixture residue before disposable database
destruction. SA-C0 LOW-1 through LOW-3 and historical backend TypeScript
test-fixture typing debt also remain open. SA-C2 is the next planning/audit
checkpoint and has not started.

### EMAIL-QA.3C.4P checkpoint — 2026-10-23

Commit `a827ee09bb6bbe607e88ef652fbd71e2b766e36c` is published on `main`
and synchronized with `origin/main`. It contains the security-accepted
23-path restricted Platform Super Admin invitation implementation, with no
Prisma schema or migration change. The repository contains 60 migration
directories; this documentation update does not independently reverify the
live application database's applied-migration state.

EMAIL-QA.3C.4P.9 recorded **PASS WITH CONDITIONS** after 104/104 focused
backend tests, 16/16 focused Admin tests, 14/14 disposable PostgreSQL
integration assertions, backend/Admin builds, Admin TypeScript validation,
Prisma validation, and diff verification. Account-B performed both the P.8
verification and P.9 full-scope review, so this is fresh review evidence but
not a third-reviewer assessment.

The checkpoint adds Platform `SUPER_ADMIN`-only, tenant-isolated,
server-computed invitation eligibility shared consistently by GET and POST, an
explicitly confirmed Admin User Details action, unique server-selected
tested/inactive SMTP authority, ID/revision fencing, target-scoped invitation
issuance locking, durable STARTED/COMPLETED dispatch fencing, pre-send
revalidation, duplicate-send prevention, and provider-uncertainty quarantine
without automatic mutation retry. It is not live-production acceptance
evidence.

Open LOW findings remain: malformed trusted STARTED evidence can cause broad
fail-closed invitation-issuance blockage and requires audit-retention
protection plus a manual reconciliation runbook; the opt-in PostgreSQL suites
must run sequentially on one disposable database or use isolated databases
until fixture isolation improves. Authenticated browser QA, controlled runtime
verification, one restricted invitation dispatch, link acceptance/account
activation, and automatic-email phases remain pending. At the last verified
checkpoint, all four email gates were disabled.

### Historical CP-R4 snapshot

The following Git facts record the **CP-R4 pre-commit snapshot on
2026-10-13**. They are historical checkpoint evidence rather than permanent
claims about the repository after commit 4 or a later push.

- Branch: `main`
- `origin/main` was `a19f8497f96f0d8a4e48c8aa61abcc93b2f9dad8`.
- Local `HEAD` was `75ce727d8e6e55a331a8c0ac212e159d9c9ac703`,
  three commits ahead.
- The three local commits were:
  `0c119c1df195e268165750e408507fa3c9c0a11c`,
  `1ab1af2eeb208aa692373989399554443ab5e322`, and
  `75ce727d8e6e55a331a8c0ac212e159d9c9ac703`
- The published stable checkpoint was still PC-M2,
  `feat: add subscription and renewal commercial emails`
- Stable-checkpoint migrations: 53. The verified worktree contains 59 migrations;
  `esta_workforce` remains at 53, so migrations 54–59 are pending and no SMTP
  cutover or application-database deployment has occurred.
- Those three local checkpoint commits contained 105 reviewed implementation,
  migration, and test files. At this snapshot, documentation commit 4 and push
  remained pending, so the complete four-commit checkpoint was not finalized.
- Company Onboarding manual browser verification is pending.
- Three local invoice-recovery candidates are blocked by
  `BILLING_PROFILE_INCOMPLETE`.

See [Current Checkpoint](docs/CURRENT_CHECKPOINT.md) for the exact inventory.

## 3. Product vision and 12-layer SOW

The original SOW describes the long-term product vision. It does not imply
that every layer is approved for immediate delivery or currently implemented.

| Layer | Approved vision | Current classification |
|---|---|---|
| 1. SaaS Platform Core | Tenant registration/profile; branches/departments; user/storage limits; trials; Starter, Professional, Enterprise, and Custom plans; Razorpay/Stripe; invoices, GST, renewals, usage billing; platform and tenant roles | PARTIALLY IMPLEMENTED |
| 2. Workforce Management | Employee master/profile/ID; department, designation, reporting manager, shift assignment; company/branch/department/team structure | PARTIALLY IMPLEMENTED |
| 3. Attendance System | Web/login/logout attendance; mobile GPS/geofence/selfie attendance; shift, late, half-day and overtime rules; leave types and holiday calendar | PARTIALLY IMPLEMENTED |
| 4. Desktop Monitoring Agent | Input activity, active/idle time, screenshots, application and website usage, breaks, and live status | PARTIALLY IMPLEMENTED |
| 5. CRM Suite | Leads, contacts, sales pipeline, follow-ups, proposals, quotations, and PDF export | PLANNED |
| 6. Tasks & Projects | Projects, assignments, deadlines, milestones, tasks, priorities, checklists, and Kanban | PLANNED |
| 7. HRMS | Payroll, salary structures, payslips, reimbursements, assets, recruitment, candidates, and interviews | PLANNED beyond current workforce foundations |
| 8. ERP Lite | Customers, vendors, purchase orders, inventory, finance, P&L, ERP invoicing, and payment tracking | PLANNED |
| 9. Communication Hub | WhatsApp follow-up, Gmail/Outlook integration, notifications, and Twilio/Exotel call tracking | FOUNDATION ONLY |
| 10. AI Layer | Productivity, HR, sales, forecasting, assistant, reports, and summaries | PLANNED |
| 11. Reporting & BI | CEO, HR, sales, and manager dashboards and reports | FOUNDATION ONLY / PARTIALLY IMPLEMENTED |
| 12. Mobile Applications | Employee, manager, and HR mobile applications | PLANNED / NOT VERIFIED |

The SOW's ₹99/₹199/₹299 per-user pricing is historical product-vision pricing,
not verified live configuration or a current commercial approval. See
[Product Vision](docs/PRODUCT_VISION.md).

## 4. Actual repository architecture

- `backend/`: NestJS, TypeScript, Prisma, and PostgreSQL.
- `admin-panel/`: React, Vite, MUI, React Query, and routed role-aware Admin UI.
- `desktop-agent/`: Electron/React application with attendance, offline,
  heartbeat, screenshot, input-activity, application, and website monitoring.
- `browser-extension/`: privacy-bounded Chromium hostname tracking paired to
  the desktop agent.
- `shared/`: not yet an authoritative shared-contract package.

The SOW's Next.js website and React Native mobile application are not present.
Redis and MinIO are provisioned concepts but are not complete application
authorities. Current scheduled/recovery processing uses Nest schedulers and
durable PostgreSQL state rather than an established BullMQ architecture.

## 5. Super Admin control plane

Super Admin is the SaaS platform control plane, not a tenant Company Admin.
Platform routes must deny tenant roles, and tenant operational routes must deny
`SUPER_ADMIN`, even when navigation hides a route. Shared routes are permitted
only by explicit policy.

| Area | Current status |
|---|---|
| Dashboard | IMPLEMENTED AND VERIFIED |
| Companies | IMPLEMENTED; onboarding correction and manual browser QA pending |
| Plans and Pricing | IMPLEMENTED AND VERIFIED |
| Subscriptions | IMPLEMENTED AND VERIFIED |
| Trial Management | IMPLEMENTED AND VERIFIED |
| Usage and Seats | IMPLEMENTED AND VERIFIED; user-based authority published in `d7477eb` |
| Storage Usage | IMPLEMENTED AND VERIFIED |
| Payments | IMPLEMENTED AND VERIFIED |
| Invoices | IMPLEMENTED AND VERIFIED |
| GST Invoices | IMPLEMENTED AND VERIFIED foundation and Admin UX; policy-controlled production enablement |
| Renewals | IMPLEMENTED AND VERIFIED |
| Dunning | IMPLEMENTED AND VERIFIED |
| Billing Settings | IMPLEMENTED AND VERIFIED configuration authority |
| Platform User and Access | IMPLEMENTED AND VERIFIED |
| Platform Communication backend | PARTIALLY IMPLEMENTED; EC-B1–EC-B2D.3 is published, while provider acceptance/deployment remains pending |
| Email Delivery Logs | IMPLEMENTED AND VERIFIED |
| Email Configuration backend | IMPLEMENTED AND VERIFIED in published commit `1ab1af2`; live deployment not reverified here |
| Email Configuration UI | IMPLEMENTED with focused automated verification in published commit `1ab1af2`; genuine browser QA pending |
| Email Templates backend | IMPLEMENTED AND VERIFIED in published commit `1ab1af2`; live deployment not reverified here |
| Email Templates UI | IMPLEMENTED with focused automated verification in published commit `1ab1af2`; genuine browser QA pending |
| Reports | PLANNED |
| Platform Settings | PLANNED |
| Shell/Header cleanup | NOT VERIFIED as a completed dedicated phase |
| Tenant Domain Architecture | DEFERRED to a dedicated pre-launch phase |
| Final Functional Review | PLANNED |
| Final cross-product UI/UX Review | PLANNED |
| Final Security and Release Review | PLANNED |

See [Super Admin Roadmap](docs/SUPER_ADMIN_ROADMAP.md).

## 6. Tenant workforce and Company Admin scope

Verified repository scope includes organization structures, employees,
scheduling, shift assignments, attendance, attendance corrections, leave,
holidays, monitoring, productivity foundations, notifications, and associated
tenant Admin experiences.

This is repository evidence, not a separate approved Company Admin roadmap.
Teams, employee documents, full onboarding/offboarding, assets, overtime
policy, formal reports, payroll, reimbursement, and recruitment remain partial
or planned. Tenant roles must never acquire platform control-plane authority.

## 7. Desktop Agent and Browser Extension

The Electron application includes authentication, device identity,
registration, attendance/break controls, heartbeat/live status, secure token
storage, offline queues, screenshot upload, aggregate Windows input activity,
application tracking, idle detection, and browser-bridge foundations.

The Chromium extension sends bounded hostname observations and rejects full
URLs, paths, query strings, page content, cookies, history, typed text, form
values, and clipboard data. It is not a general browsing-surveillance product.

Windows is the evidenced implementation platform. macOS parity, cross-platform
packaging, production distribution, signing, update delivery, and final manual
device QA remain unresolved or not verified.

## 8. Commercial and financial architecture

- Billing is provider-neutral. Razorpay is the first provider implementation;
  generic runtime must not be coupled to it.
- Live provider connectivity is not assumed without approved credentials and
  explicit verification.
- Billing Settings is the authority for invoice prefix/reset policy, payment
  terms, invoice notes, seller/legal identity, and GST metadata.
- `Company.status` is operational state, not subscription/trial authority.
- Payment, tax, invoice, renewal, and provider evidence must be durable,
  immutable where required, tenant-consistent, and BigInt-safe.
- GST calculation and evidence are backend-owned; historical records must not
  receive fabricated tax evidence.
- Invoice issuance has one authority and must preserve idempotency,
  concurrency safety, recovery, and reconciliation with payment truth.
- Renewals preserve financial authority, provider-order idempotency, lifecycle
  locking, and safe late-capture/recovery behavior.
- Dunning is a derived operational projection, not independent financial truth.
- Billable seats are approved as active, login-enabled human tenant users.
  Platform users do not consume tenant seats. The shared authority now counts
  matching-company, `ACTIVE`, non-deleted tenant Users once, independent of
  roles or Employee profiles.
- Revenue, MRR, ARR, ARPU, churn, renewal revenue, and unsupported payment or
  invoice analytics must not be invented.

## 9. Platform Communication

Implemented foundations include typed event policies, safe composition,
durable delivery records, bounded provider-error handling, lease/claim
recovery, token-fenced finalization, retry limits, PostgreSQL concurrency
protection, and Super Admin delivery diagnostics.

Published commit `1ab1af2` adds the verified EC-B1 encrypted SMTP configuration,
EC-B2A lifecycle management, EC-B2B hardened connection tests, EC-B2C
restricted test email, EC-B2D.2 permanent authority and activation lifecycle,
and EC-B2D.3 claim-time worker resolution with immutable snapshots and safe
queue pause. EC-B2D.4 passed all 16 executable isolated checks but is
**BLOCKED** on genuine approved-provider acceptance. The management gate stays
false by default. The historical CP-R4/DB-R3 evidence below records migrations
54–59 as then pending; the repository now contains 60 migrations, while the
live applied-migration state was not reverified in this update.

Migration 59 implements the forward-only Subscription Renewal integrity
convergence. DB-R3.5 passed disposable fresh migrations 1–59 and a restored
historical upgrade through migrations 54–59 while preserving migration 40's
historical checksum. DB-R3.6B found the migration technically ready and
withdrew the earlier index-mapping finding: the historical id-based index and
the Prisma-declared paymentId-based index are distinct, so no Prisma schema
correction is required. At the last verified operational state, migrations
54–59 remained undeployed. At the CP-R4 pre-commit snapshot, commits 1–3 existed
only locally and documentation commit 4 and push were still pending.

EV-D2–EV-D4 implement durable current-email verification, secure one-time
tokens, email-change invalidation, dispatch authority, and the Super Admin
Account Security UI. EV-D4.1 isolated backend-to-SMTP evidence exists; genuine
responsive/keyboard browser verification remains pending.

Implemented event families include monitoring, identity/security, leave,
attendance correction, payment/invoice, subscription, and renewal events where
established by stable checkpoints. Recipient authority is event-specific.

External SMTP delivery is not guaranteed exactly once. The system guarantees
durable internal claims, fencing, retry accounting, and terminal-state safety;
an external provider may accept a request before a network failure hides the
result.

Email Delivery Logs, Email Configuration management backend/UI, and ET-B1–ET-B5
Email Templates backend/runtime/UI are published in Git. Focused
automated verification passed. ET-B6 fresh migrations and isolated PostgreSQL
foundation/management/runtime/delivery evidence passed. ET-B6.1 added isolated
real-HTTP proof for authentication, the 24-event catalog, draft/edit fencing,
validation, preview, publication, history, and rollback. Runtime notification
composition remains supported by service/PostgreSQL evidence rather than an
HTTP mutation because no safe bounded application endpoint exists for that
proof. Genuine browser QA is blocked because no controllable browser was
available. Platform transactional email must not be described as
tenant Gmail/Outlook integration, WhatsApp delivery, or call tracking.

## 10. Security, isolation, and integrity

- Tenant data access must be scoped to authenticated tenant authority.
- Platform users and global roles have no tenant company ownership.
- Platform mutations are `SUPER_ADMIN`-only and auditable where required.
- RolePermission is descriptive metadata, not runtime authorization authority.
- Last-active-platform-Super-Admin protection is concurrency-safe.
- Cross-tenant ownership must be enforced in services and database constraints.
- Financial, GST, invoice, renewal, approval, and notification evidence must
  resist unauthorized mutation and partial transactions.
- Secrets, claims, credentials, raw provider failures, hashes, and unsafe
  internals must not appear in API projections or logs.
- Tenant-domain resolution needs a dedicated design covering uniqueness, DNS,
  TLS, verification, routing, suspension, support mode, changes, and audit.

## 11. Concurrency, idempotency, jobs, and recovery

PostgreSQL locks, advisory locks, deferred constraints, uniqueness constraints,
transaction boundaries, immutable evidence, and durable claims are used where
domain races require database authority. Provider I/O must not be held inside
long-running database transactions.

Workers cover trial/subscription expiration, payment-event recovery,
subscription activation, renewal processing, invoice recovery, monitoring
alerts, notifications, and stale attendance. Workers must be retry-safe,
bounded, observable, and free of process-local correctness dependencies.

## 12. Planned, deferred, and unverified scope

Planned modules include CRM, tasks/projects, full HRMS, ERP Lite, AI, formal
Reporting/BI, mobile applications, tenant communication integrations, Platform
Reports, and Platform Settings.

Deferred dependencies include tenant-domain architecture, real provider
connectivity, production deployment, final
cross-product UX review, and final security/release review.

Production topology, CI/CD, disaster recovery, backups, SLOs, penetration
testing, retention enforcement, mobile stores, desktop signing/update delivery,
and legal/compliance acceptance are **NOT VERIFIED**.

## 13. Quality and release gates

Every bounded phase must apply verification proportional to risk:

1. exact Git scope and migration review;
2. focused unit and regression tests;
3. PostgreSQL integration/concurrency proof for database-specific behavior;
4. Prisma validation and migration-chain proof when schema changes;
5. typecheck and production build;
6. loading, error, empty, refetch, accessibility, and responsive checks;
7. manual desktop/tablet/mobile browser verification for visual Admin work;
8. secret, projection, authorization, tenant-isolation, and integrity review;
9. strict read-only final diff review;
10. explicit authorization before staging, commit, and push.

Automated tests alone do not complete a visual frontend phase. UI tests alone
do not prove financial, security, or concurrency correctness.

## 14. Active priorities and unresolved decisions

1. Complete Company Onboarding manual browser verification and checkpoint its
   six reviewed files.
2. Resolve three local `BILLING_PROFILE_INCOMPLETE` invoice-recovery data
   prerequisites without weakening financial rules.
3. Plan and audit SA-C2; implementation has not started.
4. Complete provider acceptance, key-ring/allowlist/TLS readiness, migration
   rollout approval, and genuine browser QA for the EC-B2D.5 Email Configuration UI.
5. Complete genuine browser QA for the implemented Email Templates backend/UI;
   preserve the isolated ET-B6/ET-B6.1 evidence and the HTTP-composition gap.
6. Define Platform Reports metric authorities.
7. Define Platform Settings ownership and persistence.
8. Approve tenant-domain architecture before launch.

Other decisions include live plan pricing, Stripe priority, mobile scope,
macOS support, communication providers, cloud/storage/queue architecture,
production operations, and sequencing of CRM, Tasks, HRMS, ERP, AI, and BI.

## 15. Codex handoff and checkpoint rules

- Git and the current worktree are authoritative across account handoffs.
- Never restart, reset, restore, stash, clean, or discard existing work merely
  because an account/session changes.
- Verify branch, HEAD, origin, status, staged files, migration count, and
  `git diff --check` before continuing.
- Preserve exact reviewed scope and do not mix unrelated changes.
- Do not edit applied migrations. Add one only for a proven schema requirement
  after explicit scope approval.
- Do not stage, commit, amend, or push without explicit authorization.
- Never force-push a stable checkpoint.
- Distinguish accepted prior evidence from checks run in the current session.

## 16. Documentation map

- [Product Vision](docs/PRODUCT_VISION.md)
- [Super Admin Roadmap](docs/SUPER_ADMIN_ROADMAP.md)
- [Requirements Traceability](docs/REQUIREMENTS_TRACEABILITY.md)
- [Current Checkpoint](docs/CURRENT_CHECKPOINT.md)
- [Original SOW](docs/EstaAI%20Workforce%20OS.docx)
- [Approved Super Admin Roadmap](docs/Esta_Workforce_OS_Super_Admin_Final_Requirements_and_Roadmap.docx)
