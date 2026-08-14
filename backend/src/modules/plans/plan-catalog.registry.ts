export enum EntitlementAvailability {
  AVAILABLE = 'AVAILABLE',
  COMING_SOON = 'COMING_SOON',
}

export interface CommercialEntitlement {
  key: string;
  name: string;
  group: string;
  description: string;
  availability: EntitlementAvailability;
  assignable: boolean;
  sortOrder: number;
}

export const ENTITLEMENT_CATALOG = [
  { key: 'workforce.attendance', name: 'Attendance', group: 'Workforce', description: 'Attendance capture, review, corrections, and policy workflows.', availability: EntitlementAvailability.AVAILABLE, assignable: true, sortOrder: 10 },
  { key: 'workforce.leave', name: 'Leave', group: 'Workforce', description: 'Leave types, requests, approvals, and balances.', availability: EntitlementAvailability.AVAILABLE, assignable: true, sortOrder: 20 },
  { key: 'workforce.scheduling', name: 'Scheduling', group: 'Workforce', description: 'Shifts, assignments, rosters, weekly offs, and holidays.', availability: EntitlementAvailability.AVAILABLE, assignable: true, sortOrder: 30 },
  { key: 'monitoring.core', name: 'Monitoring Core', group: 'Monitoring', description: 'Device status, activity timeline, applications, websites, and idle analytics.', availability: EntitlementAvailability.AVAILABLE, assignable: true, sortOrder: 100 },
  { key: 'monitoring.screenshots', name: 'Screenshots', group: 'Monitoring', description: 'Managed desktop screenshot capture and review.', availability: EntitlementAvailability.AVAILABLE, assignable: true, sortOrder: 110 },
  { key: 'monitoring.productivity', name: 'Productivity', group: 'Monitoring', description: 'Productivity classification, analytics, trends, and coverage.', availability: EntitlementAvailability.AVAILABLE, assignable: true, sortOrder: 120 },
  { key: 'monitoring.alerts', name: 'Alerts', group: 'Monitoring', description: 'Monitoring alerts, policies, operations, and related notifications.', availability: EntitlementAvailability.AVAILABLE, assignable: true, sortOrder: 130 },
  { key: 'crm.core', name: 'CRM', group: 'Business Operations', description: 'Leads, contacts, sales pipeline, follow-ups, and quotations.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 200 },
  { key: 'projects.core', name: 'Projects & Tasks', group: 'Business Operations', description: 'Projects, tasks, boards, and project calendar.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 210 },
  { key: 'erp.core', name: 'ERP Lite', group: 'Business Operations', description: 'Customers, vendors, purchasing, inventory, finance, and invoicing.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 220 },
  { key: 'hrms.core', name: 'HRMS', group: 'People Operations', description: 'Payroll, reimbursements, recruitment, and expanded employee lifecycle workflows.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 300 },
  { key: 'communication.core', name: 'Communication Hub', group: 'Platform Extensions', description: 'WhatsApp, email workflows, and call tracking.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 400 },
  { key: 'reports.core', name: 'Reports', group: 'Platform Extensions', description: 'Workforce, monitoring, productivity, and executive reports.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 410 },
  { key: 'analytics.ai', name: 'AI Analytics', group: 'Platform Extensions', description: 'AI-assisted productivity, HR, sales, and assistant workflows.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 420 },
  { key: 'platform.api_access', name: 'API Access', group: 'Platform Extensions', description: 'Commercial access to future public platform APIs.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 430 },
  { key: 'mobile.app', name: 'Mobile App', group: 'Applications', description: 'Commercial access to the future mobile application.', availability: EntitlementAvailability.COMING_SOON, assignable: false, sortOrder: 500 },
] as const satisfies readonly CommercialEntitlement[];

export const CURRENT_ENTITLEMENTS = ENTITLEMENT_CATALOG
  .filter((item) => item.availability === EntitlementAvailability.AVAILABLE && item.assignable)
  .map((item) => item.key);

export const RESERVED_ENTITLEMENTS = ENTITLEMENT_CATALOG
  .filter((item) => !item.assignable)
  .map((item) => item.key);

export const PLAN_LIMIT_KEYS = ['maxStorageBytes', 'screenshotRetentionDays'] as const;
export type PlanLimits = Partial<Record<(typeof PLAN_LIMIT_KEYS)[number], number>>;

export function isAssignableEntitlement(value: string): boolean {
  const item = ENTITLEMENT_CATALOG.find((candidate) => candidate.key === value);
  return Boolean(item?.assignable && item.availability === EntitlementAvailability.AVAILABLE);
}
