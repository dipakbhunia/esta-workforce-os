import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UserStatus } from '@prisma/client';
import { CommercialBillingRecipientResolver } from './commercial-billing-recipient-resolver.service';

describe('CommercialBillingRecipientResolver', () => {
  const valid = { companyId: 'company-1', billingContactUserId: 'user-1', billingContact: { id: 'user-1', companyId: 'company-1', email: ' Billing@Example.test ', status: UserStatus.ACTIVE, deletedAt: null } };
  const resolver = (profile: unknown) => new CommercialBillingRecipientResolver({ companyBillingProfile: { findFirst: async () => profile } } as never);

  it('returns only the exact current eligible designated tenant user', async () => {
    assert.deepEqual(await resolver(valid).resolve('company-1'), { userId: 'user-1', companyId: 'company-1', email: 'billing@example.test' });
  });

  it('fails closed for missing, stale, cross-tenant, inactive, deleted, or invalid-email authority', async () => {
    for (const profile of [null, { ...valid, billingContactUserId: null }, { ...valid, billingContact: null },
      { ...valid, billingContact: { ...valid.billingContact, id: 'user-2' } },
      { ...valid, billingContact: { ...valid.billingContact, companyId: 'company-2' } },
      { ...valid, billingContact: { ...valid.billingContact, status: UserStatus.INACTIVE } },
      { ...valid, billingContact: { ...valid.billingContact, deletedAt: new Date() } },
      { ...valid, billingContact: { ...valid.billingContact, email: 'invalid' } }]) {
      assert.equal(await resolver(profile).resolve('company-1'), null);
    }
  });
});
