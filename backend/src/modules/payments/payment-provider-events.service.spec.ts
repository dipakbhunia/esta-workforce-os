import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentProviderEventStatus, PaymentProviderMode, PaymentProviderOrderStatus, PaymentProviderType, PaymentStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { PaymentProviderEventsService } from './payment-provider-events.service';

const now = new Date('2026-08-28T10:00:00.000Z');
const ids = { event: '00000000-0000-4000-8000-000000000001', payment: '00000000-0000-4000-8000-000000000002', order: '00000000-0000-4000-8000-000000000003', config: '00000000-0000-4000-8000-000000000004', company: '00000000-0000-4000-8000-000000000005', subscription: '00000000-0000-4000-8000-000000000006' };

function harness(status = PaymentStatus.PENDING, truth = 'PAYMENT_CAPTURED', subscriptionStatus = SubscriptionStatus.PENDING) {
  const event: Record<string, any> = { id: ids.event, paymentId: null, providerOrderRecordId: null, providerConfigurationId: ids.config, credentialVersionId: 'credential', provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST, providerEventId: 'evt-1', eventType: 'payment.captured', providerOrderId: 'order_ABC', providerPaymentId: 'pay_ABC', providerCreatedAt: now, status: PaymentProviderEventStatus.RECEIVED, payloadHash: 'a'.repeat(64), normalizedPayloadVersion: 1, normalizedPayload: { sourceEventType: 'payment.captured', truth, providerOrderId: 'order_ABC', providerPaymentId: 'pay_ABC', providerPaymentStatus: truth === 'PAYMENT_FAILED' ? 'failed' : truth === 'PAYMENT_AUTHORIZED' ? 'authorized' : 'captured', captured: truth === 'PAYMENT_CAPTURED', amountMinor: '99000', currency: 'INR', occurredAt: now.toISOString(), safeFailureCode: truth === 'PAYMENT_FAILED' ? 'DECLINED' : null, safeFailureMessage: truth === 'PAYMENT_FAILED' ? 'Payment failed' : null }, signatureVerifiedAt: now, attemptCount: 0, receivedAt: now, processingStartedAt: null, processedAt: null, nextRetryAt: null, safeErrorMessage: null };
  const payment: Record<string, any> = { id: ids.payment, companyId: ids.company, subscriptionId: ids.subscription, providerConfigurationId: ids.config, provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST, status, amountMinor: 99000n, currency: 'INR', providerStatus: status === PaymentStatus.FAILED ? 'failed' : null, capturedProviderPaymentId: status === PaymentStatus.CAPTURED ? 'pay_ABC' : null, authorizedAt: status === PaymentStatus.AUTHORIZED ? now : null, capturedAt: status === PaymentStatus.CAPTURED ? now : null, failedAt: status === PaymentStatus.FAILED ? now : null, failureCode: status === PaymentStatus.FAILED ? 'OLD_FAILURE' : null, safeFailureMessage: status === PaymentStatus.FAILED ? 'Old failure' : null, attempts: [], subscription: { id: ids.subscription, companyId: ids.company, status: subscriptionStatus, activatedByPaymentId: null } };
  const order: Record<string, any> = { id: ids.order, paymentId: ids.payment, providerConfigurationId: ids.config, providerOrderId: 'order_ABC', status: PaymentProviderOrderStatus.CREATED, providerStatus: 'created', amountMinor: 99000n, currency: 'INR', closedAt: null };
  const audits: Record<string, any>[] = [];
  const client: Record<string, any> = {
    $queryRaw: async () => [{ id: ids.payment }],
    paymentProviderEvent: {
      findUnique: async () => event,
      updateMany: async ({ data }: any) => { if (event.status !== PaymentProviderEventStatus.RECEIVED && event.status !== PaymentProviderEventStatus.FAILED && event.status !== PaymentProviderEventStatus.PROCESSING) return { count: 0 }; const attemptCount = data.attemptCount ? event.attemptCount + 1 : event.attemptCount; Object.assign(event, data, { attemptCount }); return { count: 1 }; },
      update: async ({ data }: any) => { Object.assign(event, data); return event; },
      findMany: async () => [{ id: event.id }],
    },
    paymentProviderOrder: { findUnique: async () => order, update: async ({ data }: any) => { Object.assign(order, data); return order; } },
    payment: { findUnique: async () => payment, findFirst: async () => null, update: async ({ data }: any) => { Object.assign(payment, data); return payment; } },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
  };
  client.$transaction = async (callback: (tx: any) => unknown) => callback(client);
  const service = new PaymentProviderEventsService(client as never, {} as never, {} as never);
  return { service, event, payment, order, audits };
}

describe('PaymentProviderEventsService truth processing', () => {
  it('captures without E1.5 and leaves a pending subscription untouched', async () => {
    const h = harness(); await h.service.process(ids.event);
    assert.equal(h.payment.status, PaymentStatus.CAPTURED); assert.equal(h.payment.capturedProviderPaymentId, 'pay_ABC'); assert.equal(h.payment.capturedAt.toISOString(), now.toISOString());
    assert.equal(h.order.status, PaymentProviderOrderStatus.PAID); assert.equal(h.payment.subscription.status, SubscriptionStatus.PENDING); assert.equal(h.payment.subscription.activatedByPaymentId, null); assert.equal(h.event.status, PaymentProviderEventStatus.PROCESSED);
  });

  it('converges matching E1.5 evidence and permanently rejects conflicting E1.5 identity', async () => {
    const matching = harness(); matching.payment.attempts = [{ providerPaymentId: 'pay_ABC' }]; await matching.service.process(ids.event); assert.equal(matching.payment.status, PaymentStatus.CAPTURED);
    const conflicting = harness(); conflicting.payment.attempts = [{ providerPaymentId: 'pay_CHECKOUT' }]; await conflicting.service.process(ids.event); assert.equal(conflicting.payment.status, PaymentStatus.PENDING); assert.equal(conflicting.event.status, PaymentProviderEventStatus.IGNORED); assert.equal(conflicting.payment.attempts[0].providerPaymentId, 'pay_CHECKOUT');
  });

  it('applies authorization and failure truth without capture evidence', async () => {
    const authorized = harness(PaymentStatus.PENDING, 'PAYMENT_AUTHORIZED'); await authorized.service.process(ids.event); assert.equal(authorized.payment.status, PaymentStatus.AUTHORIZED); assert.equal(authorized.payment.capturedProviderPaymentId, null);
    const failed = harness(PaymentStatus.PENDING, 'PAYMENT_FAILED'); await failed.service.process(ids.event); assert.equal(failed.payment.status, PaymentStatus.FAILED); assert.equal(failed.payment.failureCode, 'DECLINED'); assert.equal(failed.order.status, PaymentProviderOrderStatus.CREATED);
  });

  it('recovers FAILED to CAPTURED without erasing historical failure evidence', async () => {
    const h = harness(PaymentStatus.FAILED); await h.service.process(ids.event);
    assert.equal(h.payment.status, PaymentStatus.CAPTURED); assert.equal(h.payment.failureCode, 'OLD_FAILURE'); assert.equal(h.payment.safeFailureMessage, 'Old failure'); assert.equal(h.payment.failedAt, now); assert.ok(h.audits.some((value) => value.action === 'PAYMENT_RECOVERED_AFTER_PROVIDER_FAILURE'));
  });

  it('never regresses CAPTURED and rejects a different capture identity', async () => {
    const stale = harness(PaymentStatus.CAPTURED, 'PAYMENT_FAILED'); await stale.service.process(ids.event); assert.equal(stale.payment.status, PaymentStatus.CAPTURED); assert.equal(stale.event.status, PaymentProviderEventStatus.IGNORED);
    const conflict = harness(PaymentStatus.CAPTURED); conflict.event.providerPaymentId = 'pay_OTHER'; conflict.event.normalizedPayload.providerPaymentId = 'pay_OTHER'; await conflict.service.process(ids.event); assert.equal(conflict.payment.capturedProviderPaymentId, 'pay_ABC'); assert.equal(conflict.event.status, PaymentProviderEventStatus.IGNORED); assert.ok(conflict.audits.some((value) => value.action === 'PAYMENT_PROVIDER_EVENT_CONFLICT'));
  });

  it('records capture truth after cancellation without activating the subscription', async () => {
    const h = harness(PaymentStatus.PENDING, 'PAYMENT_CAPTURED', SubscriptionStatus.CANCELLED); await h.service.process(ids.event);
    assert.equal(h.payment.status, PaymentStatus.CAPTURED); assert.equal(h.payment.subscription.status, SubscriptionStatus.CANCELLED); assert.equal(h.payment.subscription.activatedByPaymentId, null); assert.ok(h.audits.some((value) => value.action === 'PAYMENT_CAPTURED_FOR_CANCELLED_SUBSCRIPTION'));
  });

  it('retains an unknown order for retry instead of failing Payment truth', async () => {
    const h = harness(); (h.service as any).prisma.paymentProviderOrder.findUnique = async () => null; await h.service.process(ids.event);
    assert.equal(h.payment.status, PaymentStatus.PENDING); assert.equal(h.event.status, PaymentProviderEventStatus.FAILED); assert.ok(h.event.nextRetryAt instanceof Date);
  });

  it('terminalizes unknown-order recovery at the bounded maximum and never schedules it again', async () => {
    const h = harness(); h.event.attemptCount = 9; (h.service as any).prisma.paymentProviderOrder.findUnique = async () => null; await h.service.process(ids.event);
    assert.equal(h.event.attemptCount, 10); assert.equal(h.event.status, PaymentProviderEventStatus.FAILED); assert.equal(h.event.nextRetryAt, null); assert.match(h.event.safeErrorMessage, /manual review/i); assert.ok(h.audits.some((value) => value.action === 'PAYMENT_PROVIDER_EVENT_PROCESSING_EXHAUSTED'));
  });

  it('does not reclaim an already processed duplicate', async () => { const h = harness(); h.event.status = PaymentProviderEventStatus.PROCESSED; await h.service.process(ids.event); assert.equal(h.event.attemptCount, 0); assert.equal(h.payment.status, PaymentStatus.PENDING); });
});

describe('PaymentProviderEventsService recovery selection', () => {
  it('selects bounded eligible work and isolates one poisoned event from the rest of the batch', async () => {
    const calls: any[] = []; const processed: string[] = [];
    const prisma: any = { paymentProviderEvent: { findMany: async (args: any) => { calls.push(args); return calls.length === 1 ? [] : [{ id: 'poison' }, { id: 'healthy' }]; } } };
    const service = new PaymentProviderEventsService(prisma, {} as never, {} as never);
    (service as any).process = async (id: string) => { processed.push(id); if (id === 'poison') throw new Error('poisoned'); };
    await service.recoverDue(25);
    assert.deepEqual(processed, ['poison', 'healthy']); assert.equal(calls[1].take, 25);
    const serialized = JSON.stringify(calls[1].where);
    assert.match(serialized, /RECEIVED/); assert.match(serialized, /FAILED/); assert.match(serialized, /PROCESSING/); assert.match(serialized, /nextRetryAt/); assert.match(serialized, /attemptCount/);
  });

  it('allows only one claimant in an immediate-processor versus scheduler race', async () => {
    let claims = 0; const prisma: any = { paymentProviderEvent: { updateMany: async () => ({ count: claims++ === 0 ? 1 : 0 }), findUnique: async () => null, update: async () => ({}) }, $transaction: async (callback: (tx: any) => unknown) => callback(prisma) };
    const service = new PaymentProviderEventsService(prisma, {} as never, {} as never); (service as any).applyTruth = async () => undefined;
    await Promise.all([service.process(ids.event), service.process(ids.event)]); assert.equal(claims, 2);
  });
});

function collisionHarness(kind: 'exact' | 'event-id' | 'payload-id' | 'split') {
  const normalized = { providerEventId: 'evt-1', sourceEventType: 'payment.captured', truth: 'PAYMENT_CAPTURED' as const, providerOrderId: 'order_ABC', providerPaymentId: 'pay_ABC', providerPaymentStatus: 'captured', captured: true, amountMinor: 99000n, currency: 'INR', occurredAt: now, safeFailureCode: null, safeFailureMessage: null, payloadHash: 'a'.repeat(64), normalizedPayloadVersion: 1, normalizedPayload: { sourceEventType: 'payment.captured', truth: 'PAYMENT_CAPTURED', providerOrderId: 'order_ABC', providerPaymentId: 'pay_ABC', providerPaymentStatus: 'captured', captured: true, amountMinor: '99000', currency: 'INR', occurredAt: now.toISOString(), safeFailureCode: null, safeFailureMessage: null } };
  const row = { ...normalized, id: ids.event, providerConfigurationId: ids.config, credentialVersionId: 'credential', provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST, eventType: normalized.sourceEventType, providerCreatedAt: now, normalizedPayload: normalized.normalizedPayload, status: PaymentProviderEventStatus.PROCESSED, receivedAt: now };
  const payloadRow = kind === 'split' ? { ...row, id: '00000000-0000-4000-8000-000000000099', providerEventId: 'evt-other' } : row;
  const audits: any[] = [];
  const store: any = {
    paymentProviderEvent: {
      create: async () => { throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }); },
      findFirst: async ({ where }: any) => where.providerEventId ? (kind === 'payload-id' ? null : row) : (kind === 'event-id' ? null : payloadRow),
      findUnique: async ({ where }: any) => where.id === row.id ? row : payloadRow,
      updateMany: async () => ({ count: 0 }),
    },
    auditLog: { findFirst: async () => audits[0] ?? null, create: async ({ data }: any) => { audits.push(data); return data; } },
    $queryRaw: async () => [],
  };
  store.$transaction = async (callback: (tx: any) => unknown) => callback(store);
  const credentials = { resolveWebhookCandidates: async () => [{ providerConfigurationId: ids.config, provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST, credentialVersionId: 'credential', credentialVersion: 1, material: {} }] };
  const provider = { verifyWebhookSignature: () => true, normalizeWebhookEvent: () => ({ ...normalized, ...(kind === 'event-id' ? { payloadHash: 'b'.repeat(64) } : {}), ...(kind === 'payload-id' ? { providerEventId: 'evt-other' } : {}) }) };
  const registry = { resolve: () => provider };
  return { service: new PaymentProviderEventsService(store, credentials as never, registry as never), audits, row };
}

describe('PaymentProviderEventsService collision classification', () => {
  it('reuses only exact compatible durable evidence', async () => { const h = collisionHarness('exact'); const result = await h.service.ingest(PaymentProviderType.RAZORPAY, ids.config, Buffer.from('{}'), 'signature', 'evt-1'); assert.equal(result.eventId, ids.event); assert.equal(h.audits.length, 0); });
  it('records contradictory provider-event ID reuse without processing altered evidence', async () => { const h = collisionHarness('event-id'); const result = await h.service.ingest(PaymentProviderType.RAZORPAY, ids.config, Buffer.from('{}'), 'signature', 'evt-1'); assert.equal(result.conflict, true); assert.equal(h.audits[0].metadata.category, 'CONTRADICTORY_PROVIDER_EVENT_ID_REUSE'); });
  it('records conflicting provider-event semantics on identical payload hash', async () => { const h = collisionHarness('payload-id'); const result = await h.service.ingest(PaymentProviderType.RAZORPAY, ids.config, Buffer.from('{}'), 'signature', 'evt-other'); assert.equal(result.conflict, true); assert.equal(h.audits[0].metadata.category, 'CONTRADICTORY_PAYLOAD_REUSE'); });
  it('fails closed when event ID and payload hash resolve to different durable rows', async () => { const h = collisionHarness('split'); const result = await h.service.ingest(PaymentProviderType.RAZORPAY, ids.config, Buffer.from('{}'), 'signature', 'evt-1'); assert.equal(result.conflict, true); assert.equal(h.audits[0].metadata.category, 'DEDUPE_KEYS_RESOLVE_TO_DIFFERENT_EVENTS'); });
});
