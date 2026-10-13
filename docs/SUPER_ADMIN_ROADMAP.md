# Esta Workforce OS — Super Admin Roadmap

## Source and current interpretation

This reconciles the
[approved roadmap](Esta_Workforce_OS_Super_Admin_Final_Requirements_and_Roadmap.docx)
with published stable checkpoint `a19f8497f96f0d8a4e48c8aa61abcc93b2f9dad8`.
At the CP-R4 pre-commit snapshot on 2026-10-13, local commits `0c119c1`,
`1ab1af2`, and `75ce727` contained the reviewed implementation, migration, and
test scope; they had not been pushed and documentation commit 4 remained
pending. This is historical checkpoint evidence, not a permanent current-state
claim.
The source's SA-H1C.1, commit `a046ec2…`, and migration 36 are historical;
the published checkpoint migration count is 53. The local repository contains
59 migrations, while `esta_workforce` remains at 53 applied migrations.

## Mission and boundaries

Super Admin is the platform control plane for companies, commercial
configuration, platform access, communication, analytics, reports, and
settings. It is not tenant Company Admin.

- `/` dispatches by role to platform or tenant dashboards.
- Tenant operational routes deny `SUPER_ADMIN`; platform routes deny tenants.
- Navigation, search, and route policy use centralized roles.
- Tenant inspection must become explicit, selected, and auditable support mode.
- Security, integrity, tenant isolation, responsive UX, and checkpoint proof
  take precedence over speed.

## Approved shell and header decisions

These are approved requirements, but completion of a dedicated shell/header
phase is **NOT VERIFIED**:

- Preferred composition: **Search Navigation | Notifications | Super Admin
  Profile**, with optional **Help/Support**.
- **Download Apps** remains a product capability because desktop monitoring
  needs a download center, but it should not remain a prominent primary Super
  Admin header action.
- The misleading/redundant **Global workspace** treatment should be removed.
- Future tenant inspection must be an explicit, company-selected, auditable
  **Tenant Context**, **View Tenant**, or **Support Mode**.
- Shell/header work must not be mixed into unrelated dashboard implementation.

## Module roadmap

| Module | Status | Remaining work |
|---|---|---|
| Dashboard | IMPLEMENTED AND VERIFIED | Preserve metric authority/exclusions |
| Companies | IMPLEMENTED; active correction | Onboarding manual QA/checkpoint |
| Plans and Pricing | IMPLEMENTED AND VERIFIED | Live pricing approval remains separate |
| Subscriptions | IMPLEMENTED AND VERIFIED | Preserve lifecycle/financial regressions |
| Trial Management | IMPLEMENTED AND VERIFIED | Preserve lifecycle regressions |
| Usage and Seats | PARTIALLY IMPLEMENTED | Replace Employee authority with user seats |
| Storage Usage | IMPLEMENTED AND VERIFIED | Preserve measured/unmeasured distinction |
| Payments | IMPLEMENTED AND VERIFIED | Controlled live-provider validation |
| Invoices | IMPLEMENTED AND VERIFIED | Local billing-profile prerequisites |
| GST Invoices | IMPLEMENTED AND VERIFIED foundation | Controlled legal/policy activation |
| Renewals | IMPLEMENTED AND VERIFIED | Preserve concurrency/recovery proof |
| Dunning | IMPLEMENTED AND VERIFIED | Keep derived/read-oriented semantics |
| Billing Settings | IMPLEMENTED AND VERIFIED | Remains legal/invoice/GST authority |
| Platform User and Access | IMPLEMENTED AND VERIFIED | Permissions remain descriptive metadata |
| Platform Communication | PARTIALLY IMPLEMENTED | Transactional delivery, Delivery Logs, EV-D2–EV-D4, EC-B1–EC-B2D.3 SMTP backend, EC-B2D.5 Configuration UI, and ET-B1–ET-B5 Templates backend/runtime/UI are verified in local commit `1ab1af2`. ET-B6 fresh migrations and isolated PostgreSQL foundation/management/runtime/delivery evidence passed. ET-B6.1 isolated real-HTTP authentication and template-management verification passed; notification composition remains service/PostgreSQL evidence because no safe bounded application HTTP mutation exists. EC-B2D.4 passed 16 executable checks; genuine provider acceptance, deployment, and browser QA remain pending |
| Reports | PLANNED | Define authoritative metrics first |
| Platform Settings | PLANNED | Define ownership/persistence first |
| Shell/Header | NOT VERIFIED | Dedicated bounded phase |
| Tenant Domain Architecture | DEFERRED | Dedicated pre-launch phase |
| Final Functional Review | PLANNED | After remaining modules |
| Final UI/UX Review | PLANNED | Near functional lock |
| Final Security/Release Review | PLANNED | Before production-readiness claim |

## Commercial rules

- Provider-neutral billing; Razorpay is first, not the generic domain.
- Real connectivity needs approved credentials and explicit evidence.
- Billable seats are active, login-enabled human tenant users; platform users
  consume none. Current active-Employee authority is a known mismatch.
- Billing Settings owns invoice numbering/reset, terms, notes, seller/legal
  identity, and GST metadata.
- `Company.status` is not subscription/trial truth.
- Do not invent annual multipliers, prices, revenue, MRR, ARR, ARPU, churn,
  payment totals, or conversion rates.

## Dashboard contract

### Date range and URL authority

- Reuse the existing `EnterpriseDateRangePicker`; do not introduce a competing
  date picker.
- Default: **Last 30 Days**, inclusive of today.
- URL contract: `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Reporting calendar: UTC.
- API dates are inclusive; backend evaluation is
  `[fromInclusive, toExclusive)`.
- Maximum custom range: 366 inclusive days.
- Future end dates, malformed dates, partial ranges, reversed ranges, and
  impossible calendar dates must be rejected or normalized according to the
  locked date-range contract.
- Presets: Today, Last 7 Days, Last 30 Days, Last 90 Days, Current Month,
  Previous Month, and Custom Range.

### Metric authority

| Metric | Class | Date range | Authority |
|---|---|---|---|
| Total Companies | Current snapshot | No | Non-deleted companies |
| Effective Active Subscriptions | Current snapshot | No | `ACTIVE` and period-valid |
| Effective Active Trials | Current snapshot | No | `ACTIVE`, started, and not ended |
| New Companies | Date-range aggregate | Yes | `Company.createdAt` |
| Trials Ending Soon | Current snapshot | No | Effective trials ending within 7 days |
| Subscriptions Ending Soon | Current snapshot | No | Live subscriptions ending within 30 days |
| Platform Growth: New Companies | Date-range trend | Yes | `Company.createdAt` |
| Platform Growth: Trial Starts | Date-range trend | Yes | `Trial.startsAt` |
| Subscription Status Distribution | Current snapshot | No | Analytically normalized lifecycle |
| Current Plan Distribution | Current snapshot | No | Immutable subscription plan snapshots |
| Trial Lifecycle Summary | Current snapshot | No | Trial lifecycle authority |
| Storage Analytics | Current snapshot | No | Established storage authority |
| Attention Required | Current snapshot | No | Structured authoritative conditions |
| Recent Companies | Current snapshot | No | Bounded recent-company records |

The six KPI cards are Total Companies, Effective Active Subscriptions,
Effective Active Trials, New Companies in the range, Trials Ending Soon, and
Subscriptions Ending Soon.

### Growth aggregation

The backend owns aggregation and zero filling for New Companies and Trial
Starts:

| Inclusive selected range | Granularity | Bucket rule |
|---|---|---|
| 1–45 days | Daily | UTC calendar day |
| 46–180 days | Weekly | Monday UTC; first bucket may precede `from` |
| 181–366 days | Monthly | First UTC day of month; first bucket may precede `from` |

The historical implementation record says these UTC rules were corrected and
validated under an Asia/Kolkata PostgreSQL session, including exact boundaries
and zero-filled buckets. That is implementation evidence, not a new rule.

### Storage semantics

- Storage may report Measured Storage, Configured Allocation, Measurement
  Coverage, Companies At Limit, Companies Over Limit, and bounded High Storage
  Usage companies.
- Incomplete measurement must be labelled **Measured Storage**; incomplete
  bytes must never be presented as definitive total storage.
- Large byte values remain decimal strings and must not be coerced into unsafe
  JavaScript `Number` values.
- Measurement gaps are data-quality states, not request errors.

### Attention Required

Return at most 10 structured items in this exact priority order:

| Priority | Condition | Severity |
|---|---|---|
| 1 | `STORAGE_OVER_LIMIT` | `CRITICAL` |
| 2 | `COMPANY_SUSPENDED` | `CRITICAL` |
| 3 | `SUBSCRIPTION_ENDING_SOON` | `WARNING` |
| 4 | `TRIAL_ENDING_SOON` | `WARNING` |
| 5 | `STORAGE_AT_LIMIT` | `WARNING` |
| 6 | `STORAGE_UNMEASURABLE` | `WARNING` |
| 7 | `NO_COMMERCIAL_ACCESS` | `INFO` |

Failed-payment, invoice, and renewal alerts are excluded until supported by
their dedicated analytics authorities.

### Recent Companies

- Maximum six companies.
- Sort by `createdAt DESC` with deterministic ID tie-break.
- Include identity, operational status, creation time, and safely derived
  commercial state.
- Commercial precedence is: effective trial → period-valid `ACTIVE`
  subscription → period-valid `SUSPENDED` subscription → `NONE`.
- Do not fabricate a generic Recent Activity feed.

### Unsupported dashboard analytics

Exclude Billable Seats/Seat Utilization until seat authority is corrected;
revenue, MRR, ARR, ARPU, churn, renewal revenue; payment totals/trends;
invoice/GST/renewal analytics; tenant employee, attendance, monitoring,
productivity, and payroll data; fake deltas; and unsupported conversion rates.

### UX and state requirements

- Use the MUI enterprise design system with restrained colors and semantic
  status tones.
- Support balanced desktop, two-column tablet, and one-column narrow/mobile
  layouts without clipping.
- Preserve layout with skeletons on initial load.
- Keep the last successful data visible during background refetch and show an
  updating state.
- Use explicit `No activity in this period` and
  `No immediate platform issues` empty messages where applicable.
- Use one dashboard-level error treatment with Retry and preserve prior data on
  refetch failure where practical.
- Provide labels, keyboard/focus behavior, contrast, accessible chart summary,
  and reduced-motion support.
- Visual checkpoints require manual browser verification.

### Accepted backend limitations from the historical checkpoint

These were accepted as non-blocking at SA-H1C.1 and remain historical notes,
not newly approved defects:

- Attention tie ordering used default-locale `localeCompare`.
- Total Companies did not explicitly exclude records created after `asOf`.
- Interface-based response DTOs limited generated Swagger schema metadata.
- Independent dashboard queries could have minor cross-query snapshot skew
  during concurrent writes rather than holding a long request transaction.

## SMTP and email-verification status

- EC-B1: versioned SMTP foundation and encrypted credentials implemented.
- EC-B2A: configuration lifecycle implemented.
- EC-B2B: allowlisted DNS/IP-pinned, TLS-verified connection testing implemented.
- EC-B2C: restricted test-email backend implemented.
- EC-B2D.1: activation/worker architecture reviewed.
- EC-B2D.2: permanent authority, activation, rollback, disable/re-enable, and
  the default-closed management gate implemented.
- EC-B2D.3: claim-time authority resolution, immutable snapshots, and safe
  non-consuming queue pause implemented.
- EC-B2D.4: 16/16 executable isolated checks passed, but genuine approved-
  provider acceptance remains blocked and is not deployment evidence.
- EV-D2–EV-D4: durable exact-current-email verification, secure token lifecycle,
  email-change invalidation, dispatch authority, and Account Security UI are
  implemented. EV-D4.1 isolated backend-to-SMTP evidence exists; genuine
  responsive/keyboard browser QA remains pending.

The worktree contains 59 migrations while `esta_workforce` remains at 53;
migrations 54–59 are pending. Migration 59 implements the forward-only
Subscription Renewal integrity convergence. DB-R3.5 passed disposable fresh
1–59 and historical 54–59 upgrade rehearsals while preserving migration 40's
historical checksum. DB-R3.6B confirmed technical readiness and withdrew the
incorrect Prisma index-mapping finding; no Prisma schema correction is required.
No application-database deployment or stable Git checkpoint has occurred. The
management gate remains false, SMTP has not been activated, and no application
SMTP cutover occurred. Genuine approved-provider acceptance and genuine browser
QA remain pending.

## Tenant-domain phase

Email Configuration and Email Templates are delivered before this dedicated
phase by reusing the secure transactional-email, renderer, delivery, and
identity-action foundations. Invitation and activation link generation must
remain origin-resolvable so a later tenant-host policy can be introduced
without replacing the email pipeline.

Before launch, design platform host separation, canonical unique tenant URL
slugs, reserved-name restrictions, DNS, wildcard TLS, custom-domain
verification, secure hostname-to-tenant resolution, tenant-bound
authentication and authorization, login and activation routing, suspended/expired access,
domain changes, audited support mode, and safety. The intended architecture is
a separate Super Admin hostname, company subdomains, and later verified
enterprise custom domains.

The existing Company Code and `Company.slug` are not hostname authority. The
final product domain, URL-slug lifecycle, and exact activation-host routing
policy remain pending decisions for this phase. Do not claim tenant-domain or
company-subdomain support until implementation and end-to-end security
verification are complete, and do not mix domain routing into the preceding
email modules.

## Recommended remaining sequence

1. Close Company Onboarding correction and manual QA.
2. Correct billable-seat authority.
3. Complete genuine provider verification, operational readiness, and genuine
   browser QA for the implemented EC-B2D.5 Email Configuration Admin UI.
4. Complete genuine browser QA for the implemented ET-B1–ET-B5 Email Templates
   backend/UI; ET-B6 isolated PostgreSQL and ET-B6.1 real-HTTP management
   verification have passed. Preserve future tenant-origin compatibility and
   retain the bounded HTTP notification-composition evidence gap.
5. Define and implement Platform Reports.
6. Define and implement Platform Settings.
7. Run dedicated shell/header cleanup.
8. Complete tenant-domain architecture before launch.
9. Run final functional, cross-product UI/UX, security, and release reviews.
