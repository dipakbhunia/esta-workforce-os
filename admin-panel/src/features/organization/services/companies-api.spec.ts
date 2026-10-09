import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/services/http', () => ({ http: { get, patch } }));

import { getBillingContact, getEligibleBillingContacts, updateBillingContact } from './companies-api';

describe('company Billing Contact API', () => {
  beforeEach(() => { get.mockReset(); patch.mockReset(); });

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
});
