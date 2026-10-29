import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/services/http', () => ({ http: { get, post, patch } }));

import { getBillingContact, getCompanyOnboardingReadiness, getEligibleBillingContacts, InvalidCompanyOnboardingReadinessResponseError, resendInitialAdminInvitation, UnsupportedCompanyOnboardingReadinessContractError, updateBillingContact } from './companies-api';

const readinessItems = [
  ['COMPANY_PROFILE', 'ADMINISTRATIVE', 'READY'],
  ['OPERATIONAL_LIFECYCLE', 'OPERATIONAL', 'INCOMPLETE'],
  ['TENANT_ADMIN_ACCESS', 'ADMINISTRATIVE', 'BLOCKED'],
  ['ADMIN_INVITATION', 'ADMINISTRATIVE', 'NOT_APPLICABLE'],
  ['COMMERCIAL_ACCESS', 'COMMERCIAL', 'UNAVAILABLE'],
  ['BILLING_PROFILE', 'BILLING', 'READY'],
  ['BILLING_CONTACT', 'BILLING', 'INCOMPLETE'],
  ['COMPANY_CONTACT_DETAILS', 'PROFILE', 'READY'],
].map(([id, category, status], index) => ({
  id, category, status, label: `Item ${index}`, blocking: id === 'COMPANY_PROFILE' || id === 'TENANT_ADMIN_ACCESS',
  reasonCode: `REASON_${index}`, explanation: `Explanation ${index}`, remediation: index === 0 ? { kind: 'NAVIGATE', label: 'Review', route: '/organization/companies/company-1' } : null,
}));

describe('company Billing Contact API', () => {
  beforeEach(() => { get.mockReset(); post.mockReset(); patch.mockReset(); });

  it('uses tenant-scoped configuration routes and bounded payloads', async () => {
    await getBillingContact('company/id');
    expect(get).toHaveBeenCalledWith('/companies/company/id/billing-contact');
    await getEligibleBillingContacts('company/id', 'Alice');
    expect(get).toHaveBeenCalledWith('/companies/company/id/billing-contact/eligible-users', { params: { search: 'Alice' } });
    await updateBillingContact('company/id', 'user-1');
    expect(patch).toHaveBeenCalledWith('/companies/company/id/billing-contact', { billingContactUserId: 'user-1' });
    await updateBillingContact('company/id', null);
    expect(patch).toHaveBeenLastCalledWith('/companies/company/id/billing-contact', { billingContactUserId: null });
  });

  it('uses the existing authorized resend endpoint for the exact initial-admin identity', async () => {
    await resendInitialAdminInvitation('initial/admin');
    expect(post).toHaveBeenCalledWith('/users/initial%2Fadmin/resend-invitation');
  });
});

describe('Company onboarding readiness API', () => {
  beforeEach(() => get.mockReset());

  it('uses the company-scoped endpoint and accepts the complete version 1 contract', async () => {
    get.mockResolvedValue({ data: { companyId: 'company/id', contractVersion: '1', evaluatedAt: '2026-10-28T10:00:00.000Z', overallStatus: 'BLOCKED', blockingCount: 1, items: readinessItems } });
    const response = await getCompanyOnboardingReadiness('company/id');
    expect(get).toHaveBeenCalledWith('/companies/company%2Fid/onboarding-readiness');
    expect(response.data.items.map((item) => item.id)).toHaveLength(8);
    expect(new Set(response.data.items.map((item) => item.status))).toEqual(new Set(['READY', 'INCOMPLETE', 'BLOCKED', 'NOT_APPLICABLE', 'UNAVAILABLE']));
    expect(response.data.items[0].explanation).toBe('Explanation 0');
  });

  it('fails safely for unsupported contract versions', async () => {
    get.mockResolvedValue({ data: { contractVersion: '2' } });
    await expect(getCompanyOnboardingReadiness('company-1')).rejects.toBeInstanceOf(UnsupportedCompanyOnboardingReadinessContractError);
  });

  it.each([
    ['empty response', null],
    ['missing dimension', { companyId: 'company-1', contractVersion: '1', evaluatedAt: '2026-10-28T10:00:00.000Z', overallStatus: 'READY', blockingCount: 0, items: readinessItems.slice(1) }],
    ['duplicate dimension', { companyId: 'company-1', contractVersion: '1', evaluatedAt: '2026-10-28T10:00:00.000Z', overallStatus: 'READY', blockingCount: 0, items: [...readinessItems.slice(1), readinessItems[1]] }],
  ])('fails safely for a malformed %s', async (_label, data) => {
    get.mockResolvedValue({ data });
    await expect(getCompanyOnboardingReadiness('company-1')).rejects.toBeInstanceOf(InvalidCompanyOnboardingReadinessResponseError);
  });
});
