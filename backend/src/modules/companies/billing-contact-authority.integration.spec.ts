import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Prisma, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CommercialBillingRecipientResolver } from '../notifications/commercial-billing-recipient-resolver.service';

const enabled = process.env.RUN_BILLING_CONTACT_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-M0 PostgreSQL designated Billing Contact authority', () => {
  const suffix = randomUUID();
  const companyIds: string[] = [];
  const userIds: string[] = [];
  let companyId = '';
  let otherCompanyId = '';
  let actorId = '';
  let firstUserId = '';
  let secondUserId = '';

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({ data: { name: `PC-M0 ${suffix}`, slug: `pc-m0-${suffix}` } });
    const otherCompany = await prisma.company.create({ data: { name: `PC-M0 Other ${suffix}`, slug: `pc-m0-other-${suffix}` } });
    companyId = company.id;
    otherCompanyId = otherCompany.id;
    companyIds.push(companyId, otherCompanyId);
    actorId = await createUser(companyId, 'actor');
    firstUserId = await createUser(companyId, 'first');
    secondUserId = await createUser(companyId, 'second');
    await createUser(otherCompanyId, 'other');
  });

  after(async () => {
    try {
      if (companyIds.length) {
        await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.companyBillingProfile.deleteMany({ where: { companyId: { in: companyIds } } });
      }
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      if (companyIds.length) await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('enforces nullable same-company authority, concurrency, audit, and fail-closed mutation safety', async () => {
    const service = new CompaniesService(prisma as never);
    const resolver = new CommercialBillingRecipientResolver(prisma as never);
    const actor = { id: actorId, companyId, roles: [RoleName.COMPANY_ADMIN] } as never;

    assert.deepEqual(await service.getBillingContact(companyId, actor), {
      companyId,
      billingProfileExists: false,
      billingContactUserId: null,
      billingContact: null,
    });
    await assert.rejects(
      () => service.updateBillingContact(companyId, { billingContactUserId: firstUserId }, actor),
      /billing profile not found/i,
    );

    await prisma.companyBillingProfile.create({
      data: {
        companyId,
        billingName: 'PC-M0 Billing',
        addressLine1: '1 Billing Road',
        city: 'Pune',
        postalCode: '411001',
        country: 'IN',
      },
    });
    const legacy = await prisma.companyBillingProfile.findUniqueOrThrow({ where: { companyId } });
    assert.equal(legacy.billingContactUserId, null);

    const otherUserId = userIds.at(-1)!;
    await assert.rejects(
      () => prisma.companyBillingProfile.update({ where: { companyId }, data: { billingContactUserId: otherUserId } }),
      isForeignKeyRestriction,
    );

    await service.updateBillingContact(companyId, { billingContactUserId: firstUserId }, actor);
    assert.equal((await resolver.resolve(companyId))?.userId, firstUserId);
    await assert.rejects(() => prisma.user.delete({ where: { id: firstUserId } }), isForeignKeyRestriction);
    await assert.rejects(
      () => prisma.user.update({ where: { id: firstUserId }, data: { companyId: otherCompanyId } }),
      isForeignKeyRestriction,
    );

    await prisma.user.update({ where: { id: firstUserId }, data: { status: UserStatus.INACTIVE } });
    assert.equal(await resolver.resolve(companyId), null);
    await assert.rejects(
      () => service.updateBillingContact(companyId, { billingContactUserId: firstUserId }, actor),
      /eligible Billing Contact/i,
    );
    await prisma.user.update({ where: { id: firstUserId }, data: { status: UserStatus.ACTIVE, email: `pc-m0-first-${suffix}@example.invalid` } });

    const results = await Promise.all([
      service.updateBillingContact(companyId, { billingContactUserId: firstUserId }, actor),
      service.updateBillingContact(companyId, { billingContactUserId: secondUserId }, actor),
    ]);
    assert.equal(results.length, 2);
    const persisted = await prisma.companyBillingProfile.findUniqueOrThrow({ where: { companyId } });
    assert.ok([firstUserId, secondUserId].includes(persisted.billingContactUserId!));
    assert.equal((await resolver.resolve(companyId))?.userId, persisted.billingContactUserId);

    const selectedId = persisted.billingContactUserId!;
    const selected = await prisma.user.findUniqueOrThrow({ where: { id: selectedId }, select: { email: true } });
    await prisma.user.update({ where: { id: selectedId }, data: { email: 'invalid' } });
    assert.equal(await resolver.resolve(companyId), null);
    await prisma.user.update({ where: { id: selectedId }, data: { email: selected.email, deletedAt: new Date() } });
    assert.equal(await resolver.resolve(companyId), null);
    await prisma.user.update({ where: { id: selectedId }, data: { deletedAt: null } });
    assert.equal((await resolver.resolve(companyId))?.userId, selectedId);

    const audits = await prisma.auditLog.count({
      where: { companyId, action: 'COMPANY_BILLING_CONTACT_CHANGED', entityType: 'CompanyBillingProfile' },
    });
    assert.ok(audits >= 2);

    await service.updateBillingContact(companyId, { billingContactUserId: null }, actor);
    assert.equal(await resolver.resolve(companyId), null);
    assert.equal((await prisma.companyBillingProfile.findUniqueOrThrow({ where: { companyId } })).billingContactUserId, null);

    const constraints = await prisma.$queryRaw<Array<{ conname: string; confdeltype: string; confupdtype: string }>>`
      SELECT conname, confdeltype::text, confupdtype::text
      FROM pg_constraint
      WHERE conname = 'CompanyBillingProfile_billingContactUserId_companyId_fkey'
    `;
    assert.deepEqual(constraints, [{
      conname: 'CompanyBillingProfile_billingContactUserId_companyId_fkey',
      confdeltype: 'r',
      confupdtype: 'r',
    }]);
  });

  async function createUser(ownerCompanyId: string, label: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        companyId: ownerCompanyId,
        email: `pc-m0-${label}-${suffix}@example.invalid`,
        passwordHash: 'integration-only-hash',
        firstName: 'PC-M0',
        lastName: label,
        status: UserStatus.ACTIVE,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }
});

function isForeignKeyRestriction(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
