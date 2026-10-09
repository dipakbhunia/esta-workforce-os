import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RoleName, UserStatus } from '@prisma/client';
import { CompaniesService } from './companies.service';

describe('CompaniesService Billing Contact authority', () => {
  it('rejects cross-tenant access before persistence', async () => {
    const service = new CompaniesService({} as never);
    await assert.rejects(() => service.getBillingContact('company-2', { id: 'actor', companyId: 'company-1', roles: [RoleName.COMPANY_ADMIN] } as never), /Cross-tenant/);
  });

  it('lists only active same-company users with valid email', async () => {
    const users = [
      { id: 'u1', firstName: 'A', lastName: 'One', email: 'a@example.test' },
      { id: 'u2', firstName: 'B', lastName: 'Two', email: 'invalid' },
    ];
    const prisma = { company: { findFirst: async () => ({ id: 'company-1' }) }, user: { findMany: async ({ where }: any) => { assert.equal(where.companyId, 'company-1'); assert.equal(where.status, UserStatus.ACTIVE); return users; } } };
    const service = new CompaniesService(prisma as never);
    assert.deepEqual(await service.listEligibleBillingContacts('company-1', {}, { id: 'actor', companyId: 'company-1', roles: [RoleName.COMPANY_ADMIN] } as never), [users[0]]);
  });
});
