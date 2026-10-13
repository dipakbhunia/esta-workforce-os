import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { EmailTemplateVersionLifecycle, NotificationType, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import { CommercialTransactionalNotificationService } from './commercial-transactional-notification.service';
import { CommercialBillingRecipientResolver } from './commercial-billing-recipient-resolver.service';
import { EmailTemplateRuntimeResolver } from './email-template-runtime-resolver.service';

const describeDb = process.env.RUN_PC_M1_DB_INTEGRATION === '1' ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-M1 PostgreSQL commercial notification atomicity', () => {
  const suffix = randomUUID();
  let companyId = '';
  let userId = '';
  let managedVersionId = '';
  const service = new CommercialTransactionalNotificationService(new CommercialBillingRecipientResolver(prisma as never),
    new EmailTemplateRuntimeResolver());

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({ data: { name: `PC-M1 ${suffix}`, slug: `pc-m1-${suffix}` } });
    companyId = company.id;
    const user = await prisma.user.create({ data: { companyId, email: `pc-m1-${suffix}@example.test`, passwordHash: 'not-used', firstName: 'Billing', lastName: 'Contact', status: UserStatus.ACTIVE } });
    userId = user.id;
    await prisma.companyBillingProfile.create({ data: { companyId, billingName: 'PC-M1 Billing', addressLine1: '1 Billing Road', city: 'Pune', postalCode: '411001', country: 'IN', billingContactUserId: userId } });
    const platformRole = await prisma.role.findFirst({ where: { companyId: null, systemName: RoleName.SUPER_ADMIN } })
      ?? await prisma.role.create({ data: { key: `ET_B4_PLATFORM_${suffix}`, name: 'ET-B4 Platform', systemName: RoleName.SUPER_ADMIN } });
    const platform = await prisma.user.create({ data: { email: `et-b4-platform-${suffix}@example.test`, passwordHash: 'not-used',
      firstName: 'Platform', lastName: 'Admin', roles: { create: { roleId: platformRole.id } } } });
    const template = await prisma.emailTemplate.create({ data: {
      id: randomUUID(),
      templateKey: NotificationType.PAYMENT_CAPTURED, notificationType: NotificationType.PAYMENT_CAPTURED,
    } });
    const managed = await prisma.emailTemplateVersion.create({ data: { id: randomUUID(), templateId: template.id,
      lifecycle: EmailTemplateVersionLifecycle.PUBLISHED, subjectTemplate: 'Managed payment {{paymentReference}}',
      textBodyTemplate: '{{companyName}} received {{amountMinor}} {{currency}} at {{occurredAt}}.',
      placeholderContractVersion: 1, validationResultCode: 'VALID', validatedAt: new Date(), publishedAt: new Date(),
      createdByUserId: platform.id, validatedByUserId: platform.id, publishedByUserId: platform.id } });
    managedVersionId = managed.id;
    await prisma.emailTemplate.update({ where: { id: template.id }, data: { activeVersionId: managed.id } });
  });

  after(async () => {
    try {
      if (companyId) {
        await prisma.notification.deleteMany({ where: { companyId } });
        await prisma.companyBillingProfile.deleteMany({ where: { companyId } });
      }
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
      if (companyId) await prisma.company.deleteMany({ where: { id: companyId } });
    } finally { await prisma.$disconnect(); }
  });

  it('commits one durable intent under concurrency and rolls intent back with its caller transaction', async () => {
    const sourceId = randomUUID();
    const input = { type: NotificationType.PAYMENT_CAPTURED, sourceId, companyId, payload: { companyName: 'PC-M1', paymentReference: 'PAY-1', amountMinor: '900719925474099301', currency: 'INR', occurredAt: '2026-10-09T00:00:00.000Z' } } as const;
    const results = await Promise.all(Array.from({ length: 4 }, () => prisma.$transaction((tx) => service.createInTransaction(tx, input))));
    assert.equal(results.filter(Boolean).length, 1);
    const rows = await prisma.notification.findMany({ where: { idempotencyKey: `${sourceId}:PAYMENT_CAPTURED:${userId}:EMAIL` }, include: { deliveries: true } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].deliveries.length, 1);
    assert.equal(rows[0].deliveries[0].recipient, `pc-m1-${suffix}@example.test`);
    assert.equal(rows[0].title, 'Managed payment PAY-1');
    assert.equal(rows[0].emailTemplateVersionId, managedVersionId);

    const rollbackSourceId = randomUUID();
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      await service.createInTransaction(tx, { ...input, sourceId: rollbackSourceId, type: NotificationType.PAYMENT_FAILED });
      throw new Error('simulated authoritative transaction rollback');
    }));
    assert.equal(await prisma.notification.count({ where: { idempotencyKey: { startsWith: rollbackSourceId } } }), 0);
  });

  it('keeps persisted content immutable when the active template changes', async () => {
    const existing = await prisma.notification.findFirstOrThrow({ where: { emailTemplateVersionId: managedVersionId } });
    await prisma.emailTemplate.update({ where: { notificationType: NotificationType.PAYMENT_CAPTURED },
      data: { activeVersionId: null } });
    const unchanged = await prisma.notification.findUniqueOrThrow({ where: { id: existing.id } });
    assert.equal(unchanged.title, existing.title);
    assert.equal(unchanged.message, existing.message);
    assert.equal(unchanged.emailTemplateVersionId, managedVersionId);
  });

  it('persists each subscription and renewal event once and honors renewal-prepared preference', async () => {
    const cases = [
      [NotificationType.SUBSCRIPTION_ACTIVATED, { companyName: 'PC-M2', subscriptionReference: 'SUB-1', planName: 'Growth', activatedAt: '2026-10-09T00:00:00.000Z', periodStart: '2026-10-09T00:00:00.000Z', periodEnd: '2026-11-09T00:00:00.000Z' }],
      [NotificationType.SUBSCRIPTION_EXPIRED, { companyName: 'PC-M2', subscriptionReference: 'SUB-1', expiredAt: '2026-11-09T00:00:00.000Z' }],
      [NotificationType.RENEWAL_APPLIED, { companyName: 'PC-M2', renewalReference: 'REN-1', periodStart: '2026-11-09T00:00:00.000Z', periodEnd: '2026-12-09T00:00:00.000Z' }],
      [NotificationType.RENEWAL_BLOCKED, { companyName: 'PC-M2', renewalReference: 'REN-2', blockedReason: 'Commercial evidence did not reconcile' }],
      [NotificationType.RENEWAL_PREPARED, { companyName: 'PC-M2', renewalReference: 'REN-3', periodStart: '2026-12-09T00:00:00.000Z', periodEnd: '2027-01-09T00:00:00.000Z' }],
    ] as const;
    for (const [type, payload] of cases) {
      const sourceId = randomUUID();
      const results = await Promise.all(Array.from({ length: 2 }, () => prisma.$transaction((tx) => service.createInTransaction(tx, { type, sourceId, companyId, payload }))));
      assert.equal(results.filter(Boolean).length, 1);
      assert.equal(await prisma.notification.count({ where: { idempotencyKey: `${sourceId}:${type}:${userId}:EMAIL` } }), 1);
    }
    await prisma.notificationPreference.upsert({ where: { userId }, create: { userId, companyId, emailEnabled: false }, update: { emailEnabled: false } });
    const suppressed = await prisma.$transaction((tx) => service.createInTransaction(tx, {
      type: NotificationType.RENEWAL_PREPARED, sourceId: randomUUID(), companyId,
      payload: { companyName: 'PC-M2', renewalReference: 'REN-4', periodStart: '2027-01-09T00:00:00.000Z', periodEnd: '2027-02-09T00:00:00.000Z' },
    }));
    assert.equal(suppressed, false);
  });
});
