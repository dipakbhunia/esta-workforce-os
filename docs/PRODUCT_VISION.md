# Esta Workforce OS — Product Vision

## Authority

This is an index of the long-term vision in
[EstaAI Workforce OS.docx](EstaAI%20Workforce%20OS.docx), not a delivery or
completion claim. Current status comes from repository and checkpoint evidence.

The current published backend checkpoint is
`c380b1054ad07c8f42831d2b35029e92289f8f28` (SA-C2.3 Unified Company
Onboarding Readiness Backend), with 60 migration directories and no SA-C2.3
schema or migration change. Prior evidence records 70 database-free tests, 8
disposable PostgreSQL/API integration tests, and an independent **PASS WITH
CONDITIONS** review. This documentation task does not rerun those tests.

The selected delivery direction is **Option A**: finish the full Platform Super
Admin scope before declaring Super Admin complete or starting Company Admin or
another tenant role. Existing long-term requirements—including Stripe,
reporting, tenant domains, automated email, Platform Settings,
shell/accessibility closure, and final release acceptance—remain in scope until
an explicit authorized product decision changes them.

## Vision and users

One platform combining CRM, HRMS, monitoring, tasks, ERP, AI analytics, and
SaaS billing for SMEs, agencies, IT companies, BPOs, sales teams, remote teams,
and enterprises.

## Product layers

1. **SaaS Platform Core — PARTIALLY IMPLEMENTED.** Company registration and
   profiles; branches/departments; user/storage limits; trials; Starter,
   Professional, Enterprise and Custom plans; Razorpay/Stripe; invoices, GST,
   renewals, usage billing; Super Admin, Company Admin, HR, Manager, Team Lead,
   and Employee roles. Stripe and general usage charging are not verified.
2. **Workforce Management — PARTIALLY IMPLEMENTED.** Employee master/profile/
   ID, department, designation, reporting manager, shift assignment, company,
   branch, department, and team. A complete team domain is not verified.
3. **Attendance — PARTIALLY IMPLEMENTED.** Web/login/logout attendance; mobile
   GPS/geofence/selfie attendance; shift/late/half-day/overtime rules; casual,
   sick and earned leave; holidays. Mobile evidence and full overtime scope are
   planned.
4. **Desktop Monitoring — PARTIALLY IMPLEMENTED.** Keyboard activity, mouse
   activity, active time, and idle time; screenshots at 5-minute, 10-minute,
   15-minute, and custom intervals; application monitoring including Chrome,
   VS Code, Photoshop, Excel, and Teams; website monitoring including Facebook,
   YouTube, ChatGPT, LinkedIn, and any website; lunch, tea, personal, and custom
   breaks; and Online, Offline, Away, and Break live states. Windows foundations
   exist. macOS parity and final distribution are not verified.
5. **CRM — PLANNED.** Leads, contacts, pipeline, follow-up, proposals,
   quotations, and PDF export.
6. **Tasks & Projects — PLANNED.** Projects, assignments, deadlines,
   milestones, tasks, priority/status/checklists, and Kanban.
7. **HRMS — PLANNED beyond workforce foundations.** Payroll, salary, payslips,
   reimbursement, assets, recruitment, candidates, and interviews.
8. **ERP Lite — PLANNED.** Customers, vendors, purchase orders, inventory,
   finance, P&L, ERP invoicing, and payment tracking. SaaS billing is not ERP.
9. **Communication Hub — FOUNDATION ONLY.** WhatsApp, Gmail/Outlook, and
   Twilio/Exotel are planned. Platform transactional email is implemented but
   is not equivalent to these tenant integrations. Email Configuration and
   Email Templates precede the dedicated tenant-domain phase and must reuse
   the secure delivery and identity-action foundations. Invitation links must
   remain compatible with future tenant-specific origins; current Company Code
   and `Company.slug` are not authoritative hostnames.
   Published Git history implements EC-B1–EC-B2D.3 encrypted SMTP configuration,
   lifecycle, secure testing, restricted test email, permanent authority,
   activation/rollback, and safe worker pause. EC-B2D.4 passed 16 executable
   isolated checks but is blocked on genuine approved-provider acceptance; it
   was not deployed at that historical checkpoint. The repository now contains
   60 migration directories; this documentation synchronization does not
   independently reverify the live application's applied-migration state. The
   management gate remains default-closed. The Configuration UI is implemented with focused automated verification
   in published commit `1ab1af2`; genuine browser QA remains pending. ET-B1–ET-B5
   implement the versioned Templates backend, safe runtime resolution, and Admin
   UI in published commit `1ab1af2`. ET-B6 fresh migrations and isolated PostgreSQL
   verification passed. ET-B6.1 real-HTTP authentication and template-management
   verification also passed; notification composition remains proven at the
   service/PostgreSQL boundary because no safe bounded application HTTP mutation
   exists for that check. Genuine browser QA remains blocked by unavailable browser control.
   EV-D2–EV-D4 current-email verification and Account Security UI are present;
   genuine responsive/keyboard browser verification remains pending.
   Migration 59 adds the forward-only Subscription Renewal integrity convergence.
   DB-R3.5 passed disposable fresh 1–59 and historical 54–59 upgrade rehearsals;
   DB-R3.6B confirmed technical readiness, withdrew the incorrect Prisma index-
   mapping finding, and confirmed that no Prisma schema correction is required.
   Migration 40's historical checksum remains preserved. At the CP-R4
   pre-commit snapshot on 2026-10-13, the reviewed changes were in local commits
   `0c119c1`, `1ab1af2`, and `75ce727`; they had not been pushed and documentation
   commit 4 remained pending. At the last verified operational state, no
   application-database deployment or SMTP activation had occurred.
   EMAIL-QA.3C.4P is published in commit `a827ee09bb6bbe607e88ef652fbd71e2b766e36c`
   with 23 implementation paths and no schema or migration change. Its
   restricted platform-invitation eligibility, explicit Admin confirmation,
   unique tested/inactive SMTP authority, target-scoped issuance fence,
   durable dispatch evidence, pre-send revalidation, and uncertainty quarantine
   passed P.9 security review with conditions. Account-B performed both P.8 and
   P.9, so the review is not third-reviewer evidence. Authenticated browser and
   runtime QA, one restricted dispatch, link acceptance/account activation,
   operational reconciliation, general worker hardening, template/delivery
   operational follow-through, automatic eligible-user invitations, automated
   password-reset/email-verification delivery, and tenant domains remain future
   controlled work. General automatic email delivery remains disabled.
10. **AI — PLANNED.** Productivity/HR/sales predictions, forecasting,
    assistant, report generation, and summaries.
11. **Reporting & BI — FOUNDATION ONLY / PARTIAL.** Platform and workforce
    dashboards exist; full CEO, HR, sales, and manager BI does not.
12. **Mobile Applications — PLANNED / NOT VERIFIED.** The Employee App covers
    Attendance, Leave Apply, Tasks, and Announcements. The Manager App covers
    Team Attendance, Team Productivity, and Approval System. The HR App covers
    Leave Approval and Attendance Reports. These React Native applications are
    not present.

## Technology vision reconciliation

| SOW | Repository evidence |
|---|---|
| Node.js / Express | NestJS 11 application stack |
| PostgreSQL | Implemented with Prisma |
| Redis | Provisioned concept; not complete application authority |
| React Admin | Implemented with Vite and MUI |
| Next.js website | Not present |
| Electron + React | Present |
| React Native | Not present |
| AWS/DigitalOcean | Production deployment not verified |
| S3/MinIO | Partial foundation; production authority not verified |
| Redis + BullMQ | Not the current durable-job architecture |

## Historical pricing

The SOW records Starter ₹99, Professional ₹199, and Enterprise ₹299 per user
per month. These are vision-level historical values, not verified production
configuration or current commercial approval.
