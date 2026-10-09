import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationType, Prisma } from '@prisma/client';
import { CommercialTransactionalNotificationService } from './commercial-transactional-notification.service';

const input = { type: NotificationType.PAYMENT_CAPTURED, sourceId: 'payment-1', companyId: 'company-1', payload: { companyName: 'Acme', paymentReference: 'PAY-1', amountMinor: '12345', currency: 'INR', occurredAt: '2026-10-09T00:00:00.000Z' } } as const;
const profile = { companyId: 'company-1', billingContactUserId: 'user-1', billingContact: { id: 'user-1', companyId: 'company-1', email: 'Billing@Example.test', status: 'ACTIVE', deletedAt: null } };
const service = (recipient: unknown) => new CommercialTransactionalNotificationService({ resolveInTransaction: async () => recipient } as never);

describe('CommercialTransactionalNotificationService', () => {
  it('creates durable intent and delivery in the caller transaction with exact idempotency', async () => {
    let data: any;
    const tx: any = { companyBillingProfile: { findFirst: async () => profile }, notification: { create: async (args: any) => { data = args.data; return args.data; } } };
    assert.equal(await service({ userId: 'user-1', companyId: 'company-1', email: 'billing@example.test' }).createInTransaction(tx, input), true);
    assert.equal(data.idempotencyKey, 'payment-1:PAYMENT_CAPTURED:user-1:EMAIL');
    assert.equal(data.deliveries.create.recipient, 'billing@example.test');
    assert.equal(data.detailsPath, null);
  });

  it('fails closed for missing, cross-tenant, inactive, deleted, or invalid-email billing authority', async () => {
    for (const bad of [null, { ...profile, billingContact: { ...profile.billingContact, companyId: 'other' } }, { ...profile, billingContact: { ...profile.billingContact, status: 'INACTIVE' } }, { ...profile, billingContact: { ...profile.billingContact, deletedAt: new Date() } }, { ...profile, billingContact: { ...profile.billingContact, email: 'invalid' } }]) {
      let creates = 0;
      const tx: any = { companyBillingProfile: { findFirst: async () => bad }, notification: { create: async () => { creates += 1; } } };
      const recipient = bad === null ? null : bad.billingContact.companyId === 'company-1' && bad.billingContact.status === 'ACTIVE' && !bad.billingContact.deletedAt && bad.billingContact.email.includes('@') ? { userId: 'user-1', companyId: 'company-1', email: bad.billingContact.email.toLowerCase() } : null;
      assert.equal(await service(recipient).createInTransaction(tx, input), false);
      assert.equal(creates, 0);
    }
  });

  it('converges only the exact notification idempotency conflict', async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test', meta: { target: ['idempotencyKey'] } });
    const tx: any = { companyBillingProfile: { findFirst: async () => profile }, notification: { create: async () => { throw duplicate; } } };
    const notifications = service({ userId: 'user-1', companyId: 'company-1', email: 'billing@example.test' });
    assert.equal(await notifications.createInTransaction(tx, input), false);
    tx.notification.create = async () => { throw new Prisma.PrismaClientKnownRequestError('other', { code: 'P2002', clientVersion: 'test', meta: { target: ['userId'] } }); };
    await assert.rejects(() => notifications.createInTransaction(tx, input));
  });
});
