import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BillingInterval, PaymentProviderEventStatus, PaymentProviderMode, PaymentProviderType,
  PaymentPurpose, PaymentStatus, PlanBillingModel, Prisma, PrismaClient,
  RecurringPriceBasis, SubscriptionActivationSource,
} from '@prisma/client';
import { PaymentProviderEventsService } from './payment-provider-events.service';

const enabled = process.env.RUN_PAYMENT_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('E1.6 PostgreSQL provider-event integrity', () => {
  before(async () => prisma.$connect());
  after(async () => prisma.$disconnect());

  it('retains all required dedupe, ownership, and capture constraints', async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
        'PaymentProviderEvent_provider_event_id_key',
        'PaymentProviderEvent_verified_payload_hash_key',
        'Payment_providerConfigurationId_capturedProviderPaymentId_key'
      )`;
    assert.equal(indexes.length, 3);
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint WHERE conname IN (
        'PaymentProviderEvent_paymentId_providerConfigurationId_fkey',
        'PaymentProviderEvent_providerOrderRecordId_providerConfigurationId_fkey',
        'PaymentProviderEvent_providerOrderRecordId_paymentId_fkey',
        'PaymentProviderEvent_credentialVersionId_providerConfigurationId_fkey',
        'Payment_capture_fields_bidirectional_check'
      )`;
    assert.equal(constraints.length, 5);
  });

  it('enforces provider event ID dedupe in real PostgreSQL and rolls back', async () => {
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      const credential = await fixture(tx);
      const eventId = `probe-${randomUUID()}`; const common = {
        providerConfigurationId: credential.providerConfigurationId, credentialVersionId: credential.id,
        provider: credential.providerConfiguration.provider, providerMode: credential.providerConfiguration.mode,
        providerEventId: eventId, eventType: 'payment.captured', payloadHash: randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64),
        normalizedPayload: { truth: 'PAYMENT_CAPTURED' }, signatureVerifiedAt: new Date(),
      };
      await tx.paymentProviderEvent.create({ data: common });
      await tx.paymentProviderEvent.create({ data: { ...common, payloadHash: 'b'.repeat(64) } });
    }), (error: { code?: string }) => error.code === 'P2002');
  });

  it('enforces exact raw payload-hash dedupe in real PostgreSQL and rolls back', async () => {
    await assert.rejects(() => prisma.$transaction(async (tx) => {
      const credential = await fixture(tx);
      const payloadHash = randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64); const common = {
        providerConfigurationId: credential.providerConfigurationId, credentialVersionId: credential.id,
        provider: credential.providerConfiguration.provider, providerMode: credential.providerConfiguration.mode,
        eventType: 'payment.captured', payloadHash, normalizedPayload: { truth: 'PAYMENT_CAPTURED' }, signatureVerifiedAt: new Date(),
      };
      await tx.paymentProviderEvent.create({ data: { ...common, providerEventId: `probe-${randomUUID()}` } });
      await tx.paymentProviderEvent.create({ data: { ...common, providerEventId: `probe-${randomUUID()}` } });
    }), (error: { code?: string }) => error.code === 'P2002');
  });

  it('converges two concurrent authenticated ingestions of the same event to one durable event', async () => {
    const ensured = await ensureCredential(PaymentProviderMode.TEST);
    const eventId = `evt-${randomUUID()}`; const payloadHash = randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64);
    const normalizedPayload = { sourceEventType: 'probe.unsupported', truth: 'IGNORED' as const, providerOrderId: null,
      providerPaymentId: null, providerPaymentStatus: null, captured: null, amountMinor: null, currency: null, occurredAt: null,
      safeFailureCode: null, safeFailureMessage: null };
    const credentials = { resolveWebhookCandidates: async () => [{ provider: PaymentProviderType.RAZORPAY,
      mode: PaymentProviderMode.TEST, providerConfigurationId: ensured.credential.providerConfigurationId,
      credentialVersionId: ensured.credential.id, material: {} }] };
    const providers = { resolve: () => ({ verifyWebhookSignature: () => true, normalizeWebhookEvent: () => ({
      providerEventId: eventId, sourceEventType: 'probe.unsupported', providerOrderId: null, providerPaymentId: null,
      occurredAt: null, payloadHash, normalizedPayloadVersion: 1, normalizedPayload,
    }) }) };
    const service = new PaymentProviderEventsService(prisma as never, credentials as never, providers as never, { activate: async () => undefined } as never);
    try {
      const results = await Promise.all([service.ingest(PaymentProviderType.RAZORPAY, ensured.credential.providerConfigurationId, Buffer.from('{}'), 'valid'),
        service.ingest(PaymentProviderType.RAZORPAY, ensured.credential.providerConfigurationId, Buffer.from('{}'), 'valid')]);
      assert.equal(results[0].eventId, results[1].eventId);
      const events = await prisma.paymentProviderEvent.findMany({ where: { providerConfigurationId: ensured.credential.providerConfigurationId, providerEventId: eventId } });
      assert.equal(events.length, 1);
      assert.equal(await prisma.auditLog.count({ where: { action: 'PAYMENT_PROVIDER_EVENT_IGNORED', entityId: events[0].id } }), 1);
    } finally {
      const events = await prisma.paymentProviderEvent.findMany({ where: { providerConfigurationId: ensured.credential.providerConfigurationId, providerEventId: eventId }, select: { id: true } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: events.map((event) => event.id) } } });
      await prisma.paymentProviderEvent.deleteMany({ where: { id: { in: events.map((event) => event.id) } } });
      if (ensured.createdCredentialId) await prisma.billingProviderCredential.delete({ where: { id: ensured.createdCredentialId } });
      if (ensured.createdConfigurationId) await prisma.billingProviderConfiguration.delete({ where: { id: ensured.createdConfigurationId } });
    }
  });

  it('serializes concurrent authorized/captured and failed/captured truth with CAPTURED winning', async () => {
    const fixture = await commercialFixture(2);
    const service = new PaymentProviderEventsService(prisma as never, null as never, null as never, { activate: async () => undefined } as never);
    try {
      const authorized = await providerEvent(fixture, 0, 'PAYMENT_AUTHORIZED', 'pay-concurrent-a');
      const captured = await providerEvent(fixture, 0, 'PAYMENT_CAPTURED', 'pay-concurrent-a');
      await Promise.all([service.process(authorized.id), service.process(captured.id)]);
      const first = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.payments[0].id } });
      assert.equal(first.status, PaymentStatus.CAPTURED);
      assert.equal(first.capturedProviderPaymentId, 'pay-concurrent-a');
      assert.ok(first.capturedAt);

      const failed = await providerEvent(fixture, 1, 'PAYMENT_FAILED', 'pay-concurrent-b');
      const recovered = await providerEvent(fixture, 1, 'PAYMENT_CAPTURED', 'pay-concurrent-b');
      await Promise.all([service.process(failed.id), service.process(recovered.id)]);
      const second = await prisma.payment.findUniqueOrThrow({ where: { id: fixture.payments[1].id } });
      assert.equal(second.status, PaymentStatus.CAPTURED);
      assert.equal(second.capturedProviderPaymentId, 'pay-concurrent-b');
    } finally { await cleanupCommercialFixture(fixture); }
  });

  it('converges concurrent cross-payment capture identity to one owner and one safe conflict', async () => {
    const fixture = await commercialFixture(2);
    const service = new PaymentProviderEventsService(prisma as never, null as never, null as never, { activate: async () => undefined } as never);
    try {
      const left = await providerEvent(fixture, 0, 'PAYMENT_CAPTURED', 'pay-shared-concurrent');
      const right = await providerEvent(fixture, 1, 'PAYMENT_CAPTURED', 'pay-shared-concurrent');
      await Promise.all([service.process(left.id), service.process(right.id)]);
      const payments = await prisma.payment.findMany({ where: { id: { in: fixture.payments.map((payment) => payment.id) } } });
      assert.equal(payments.filter((payment) => payment.status === PaymentStatus.CAPTURED).length, 1);
      assert.equal(payments.filter((payment) => payment.capturedProviderPaymentId === 'pay-shared-concurrent').length, 1);
      const events = await prisma.paymentProviderEvent.findMany({ where: { id: { in: [left.id, right.id] } } });
      assert.equal(events.filter((event) => event.status === PaymentProviderEventStatus.IGNORED).length, 1);
    } finally { await cleanupCommercialFixture(fixture); }
  });

  it('behaviorally rejects invalid capture evidence and mismatched event ownership', async () => {
    const fixture = await commercialFixture(2);
    try {
      await assert.rejects(() => prisma.payment.update({ where: { id: fixture.payments[0].id }, data: { status: PaymentStatus.CAPTURED } }));
      await assert.rejects(() => prisma.paymentProviderEvent.create({ data: {
        paymentId: fixture.payments[1].id, providerOrderRecordId: fixture.orders[0].id,
        providerConfigurationId: fixture.configuration.id, credentialVersionId: fixture.credential.id,
        provider: fixture.configuration.provider, providerMode: fixture.configuration.mode,
        eventType: 'payment.captured', payloadHash: 'f'.repeat(64), normalizedPayload: {}, signatureVerifiedAt: new Date(),
      } }));
      await assert.rejects(() => prisma.paymentProviderEvent.create({ data: {
        providerConfigurationId: fixture.configuration.id, credentialVersionId: fixture.otherCredential.id,
        provider: fixture.configuration.provider, providerMode: fixture.configuration.mode,
        eventType: 'payment.captured', payloadHash: 'e'.repeat(64), normalizedPayload: {}, signatureVerifiedAt: new Date(),
      } }));
    } finally { await cleanupCommercialFixture(fixture); }
  });
});

async function commercialFixture(count: number) {
  const primary = await ensureCredential(PaymentProviderMode.TEST);
  const secondary = await ensureCredential(PaymentProviderMode.LIVE);
  const credential = primary.credential;
  const suffix = randomUUID();
  const company = await prisma.company.create({ data: { name: `E1.6 probe ${suffix}`, slug: `e16-probe-${suffix}` } });
  const plan = await prisma.plan.create({ data: { code: `E16-${suffix}`, name: 'E1.6 probe', billingModel: PlanBillingModel.PER_USER } });
  const subscriptions = []; const payments = []; const orders = [];
  for (let index = 0; index < count; index += 1) {
    const subscription = await prisma.companySubscription.create({ data: {
      companyId: company.id, planId: plan.id, activationSource: SubscriptionActivationSource.PAYMENT,
      billingInterval: BillingInterval.MONTHLY, planCodeSnapshot: plan.code, planNameSnapshot: plan.name,
      billingModelSnapshot: PlanBillingModel.PER_USER, currency: 'INR', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
      recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 100n, recurringCurrency: 'INR', pricingInterval: BillingInterval.MONTHLY,
      pricingResolvedAt: new Date(), seatQuantity: 1,
    } });
    const payment = await prisma.payment.create({ data: {
      companyId: company.id, subscriptionId: subscription.id, providerConfigurationId: credential.providerConfigurationId,
      purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, provider: credential.providerConfiguration.provider,
      providerMode: credential.providerConfiguration.mode, amountMinor: 100n, currency: 'INR',
      idempotencyKey: `e16-${suffix}-${index}`, businessReference: `E16-${suffix}-${index}`,
    } });
    const order = await prisma.paymentProviderOrder.create({ data: {
      paymentId: payment.id, providerConfigurationId: credential.providerConfigurationId, credentialVersionId: credential.id,
      sequence: 1, providerOrderId: `order-${suffix}-${index}`, providerStatus: 'created',
      providerReceipt: `receipt-${suffix}-${index}`, amountMinor: 100n, currency: 'INR',
    } });
    subscriptions.push(subscription); payments.push(payment); orders.push(order);
  }
  return { company, plan, configuration: credential.providerConfiguration, credential, otherCredential: secondary.credential,
    createdCredentialIds: [primary.createdCredentialId, secondary.createdCredentialId].filter((id): id is string => Boolean(id)),
    createdConfigurationIds: [primary.createdConfigurationId, secondary.createdConfigurationId].filter((id): id is string => Boolean(id)),
    subscriptions, payments, orders };
}

async function ensureCredential(mode: PaymentProviderMode) {
  let configuration = await prisma.billingProviderConfiguration.findUnique({ where: { provider_mode: { provider: PaymentProviderType.RAZORPAY, mode } } });
  let createdConfigurationId: string | null = null;
  if (!configuration) { configuration = await prisma.billingProviderConfiguration.create({ data: { provider: PaymentProviderType.RAZORPAY, mode } }); createdConfigurationId = configuration.id; }
  let credential = await prisma.billingProviderCredential.findFirst({ where: { providerConfigurationId: configuration.id }, orderBy: { version: 'desc' }, include: { providerConfiguration: true } });
  let createdCredentialId: string | null = null;
  if (!credential) {
    credential = await prisma.billingProviderCredential.create({ data: { providerConfigurationId: configuration.id, version: 1,
      encryptedPayload: Buffer.from('e1.6-disposable-integration-probe'), encryptionKeyVersion: 'probe-v1', credentialFingerprint: randomUUID().replaceAll('-', '') },
      include: { providerConfiguration: true } });
    createdCredentialId = credential.id;
  }
  return { credential, createdCredentialId, createdConfigurationId };
}

async function providerEvent(fixture: Awaited<ReturnType<typeof commercialFixture>>, index: number, truth: 'PAYMENT_AUTHORIZED' | 'PAYMENT_CAPTURED' | 'PAYMENT_FAILED', providerPaymentId: string) {
  const sourceEventType = truth === 'PAYMENT_AUTHORIZED' ? 'payment.authorized' : truth === 'PAYMENT_CAPTURED' ? 'payment.captured' : 'payment.failed';
  const occurredAt = new Date();
  return prisma.paymentProviderEvent.create({ data: {
    providerConfigurationId: fixture.configuration.id, credentialVersionId: fixture.credential.id,
    provider: fixture.configuration.provider, providerMode: fixture.configuration.mode,
    providerEventId: `evt-${randomUUID()}`, eventType: sourceEventType, providerOrderId: fixture.orders[index].providerOrderId,
    providerPaymentId, providerCreatedAt: occurredAt, payloadHash: randomUUID().replaceAll('-', '').padEnd(64, '0').slice(0, 64),
    normalizedPayload: { sourceEventType, truth, providerOrderId: fixture.orders[index].providerOrderId, providerPaymentId,
      providerPaymentStatus: truth === 'PAYMENT_FAILED' ? 'failed' : truth === 'PAYMENT_CAPTURED' ? 'captured' : 'authorized',
      captured: truth === 'PAYMENT_CAPTURED', amountMinor: '100', currency: 'INR', occurredAt: occurredAt.toISOString(),
      safeFailureCode: truth === 'PAYMENT_FAILED' ? 'DECLINED' : null, safeFailureMessage: truth === 'PAYMENT_FAILED' ? 'Payment failed' : null },
    signatureVerifiedAt: new Date(),
  } });
}

async function cleanupCommercialFixture(fixture: Awaited<ReturnType<typeof commercialFixture>>) {
  const paymentIds = fixture.payments.map((payment) => payment.id); const orderIds = fixture.orders.map((order) => order.id);
  const events = await prisma.paymentProviderEvent.findMany({ where: { OR: [{ paymentId: { in: paymentIds } }, { providerOrderRecordId: { in: orderIds } }, { providerOrderId: { in: fixture.orders.map((order) => order.providerOrderId) } }] }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ companyId: fixture.company.id }, { entityType: 'PaymentProviderEvent', entityId: { in: events.map((event) => event.id) } }] } });
  await prisma.paymentProviderEvent.deleteMany({ where: { id: { in: events.map((event) => event.id) } } });
  await prisma.paymentProviderOrder.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.companySubscription.deleteMany({ where: { id: { in: fixture.subscriptions.map((subscription) => subscription.id) } } });
  await prisma.plan.delete({ where: { id: fixture.plan.id } });
  await prisma.company.delete({ where: { id: fixture.company.id } });
  await prisma.billingProviderCredential.deleteMany({ where: { id: { in: fixture.createdCredentialIds } } });
  await prisma.billingProviderConfiguration.deleteMany({ where: { id: { in: fixture.createdConfigurationIds } } });
}

async function fixture(tx: Prisma.TransactionClient) {
  const configuration = await tx.billingProviderConfiguration.findFirst({ where: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } })
    ?? await tx.billingProviderConfiguration.create({ data: { provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST } });
  const existing = await tx.billingProviderCredential.findFirst({ where: { providerConfigurationId: configuration.id }, orderBy: { version: 'desc' }, include: { providerConfiguration: true } });
  if (existing) return existing;
  return tx.billingProviderCredential.create({ data: {
    providerConfigurationId: configuration.id, version: 1, encryptedPayload: Buffer.from('integration-probe'),
    encryptionKeyVersion: 'probe-v1', credentialFingerprint: 'a'.repeat(64),
  }, include: { providerConfiguration: true } });
}
