export type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'TRIAL' | 'SUSPENDED';

export interface Company {
  id: string;
  name: string;
  slug: string;
  primaryEmail: string | null;
  phone: string | null;
  website: string | null;
  country: string | null;
  timezone: string;
  currency: string | null;
  address: string | null;
  status: CompanyStatus;
  createdAt: string;
  updatedAt: string;
  counts: {
    branches: number;
    departments: number;
    designations: number;
    employees: number;
    users: number;
  };
}

export interface CompanyCreationResponse extends Company {
  initialAdminInvitation: {
    userId: string;
    email: string;
    queued: boolean;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CompanyListParams {
  page: number;
  limit: number;
  search?: string;
  status?: CompanyStatus;
}

export interface CompanyPayload {
  name: string;
  slug: string;
  primaryEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  country?: string | null;
  timezone?: string;
  currency?: string | null;
  address?: string | null;
  status: CompanyStatus;
  initialAdmin?: { email: string; firstName: string; lastName: string };
}

export interface CompanyFormValues {
  name: string;
  slug: string;
  status: CompanyStatus;
  primaryEmail: string;
  phone: string;
  website: string;
  country: string;
  timezone: string;
  currency: string;
  address: string;
  initialAdminEmail: string;
  initialAdminFirstName: string;
  initialAdminLastName: string;
}

export interface BillingContactUser { id: string; firstName: string; lastName: string; email: string }
export interface BillingContactConfiguration {
  companyId: string;
  billingProfileExists: boolean;
  billingContactUserId: string | null;
  billingContact: BillingContactUser | null;
}

export const COMPANY_ONBOARDING_READINESS_ITEM_IDS = [
  'COMPANY_PROFILE',
  'OPERATIONAL_LIFECYCLE',
  'TENANT_ADMIN_ACCESS',
  'ADMIN_INVITATION',
  'COMMERCIAL_ACCESS',
  'BILLING_PROFILE',
  'BILLING_CONTACT',
  'COMPANY_CONTACT_DETAILS',
] as const;

export const COMPANY_ONBOARDING_READINESS_STATUSES = [
  'READY',
  'INCOMPLETE',
  'BLOCKED',
  'NOT_APPLICABLE',
  'UNAVAILABLE',
] as const;

export const COMPANY_ONBOARDING_READINESS_CATEGORIES = [
  'ADMINISTRATIVE',
  'OPERATIONAL',
  'COMMERCIAL',
  'BILLING',
  'PROFILE',
] as const;

export type CompanyOnboardingReadinessItemId = typeof COMPANY_ONBOARDING_READINESS_ITEM_IDS[number];
export type CompanyOnboardingReadinessStatus = typeof COMPANY_ONBOARDING_READINESS_STATUSES[number];
export type CompanyOnboardingReadinessCategory = typeof COMPANY_ONBOARDING_READINESS_CATEGORIES[number];

export interface CompanyOnboardingRemediation {
  kind: 'NAVIGATE';
  label: string;
  route: string;
}

export interface CompanyOnboardingReadinessItem {
  id: CompanyOnboardingReadinessItemId;
  category: CompanyOnboardingReadinessCategory;
  label: string;
  status: CompanyOnboardingReadinessStatus;
  blocking: boolean;
  reasonCode: string;
  explanation: string;
  remediation: CompanyOnboardingRemediation | null;
}

export interface CompanyOnboardingReadiness {
  companyId: string;
  contractVersion: '1';
  evaluatedAt: string;
  overallStatus: CompanyOnboardingReadinessStatus;
  blockingCount: number;
  items: CompanyOnboardingReadinessItem[];
}
