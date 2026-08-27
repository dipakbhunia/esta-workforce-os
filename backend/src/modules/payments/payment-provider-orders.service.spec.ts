import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  PaymentAttemptOperation, PaymentAttemptStatus, PaymentProviderMode, PaymentProviderOrderStatus,
  PaymentProviderType, PaymentPurpose, PaymentStatus, RoleName, SubscriptionStatus, UserStatus,
} from '@prisma/client';
import { CreateProviderOrderDto } from './dto/create-provider-order.dto';
import { PaymentProviderOrdersService } from './payment-provider-orders.service';
import { ProviderOperationError } from './providers/provider-operation.error';

const companyId = '00000000-0000-4000-8000-000000000001';
const paymentId = '00000000-0000-4000-8000-000000000002';
const subscriptionId = '00000000-0000-4000-8000-000000000003';
const configurationId = '00000000-0000-4000-8000-000000000004';
const actor = { id: '00000000-0000-4000-8000-000000000005', companyId, email: 'admin@example.com', firstName: 'Admin', lastName: 'User', status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN] };
const basePayment = {
  id: paymentId, companyId, subscriptionId, providerConfigurationId: configurationId,
  purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.PENDING,
  provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST,
  amountMinor: 49500n, currency: 'INR', idempotencyKey: 'subscription-activation:x', businessReference: 'subscription-activation:x',
  capturedProviderPaymentId: null, providerStatus: null, failureCode: null, safeFailureMessage: null,
  authorizedAt: null, capturedAt: null, failedAt: null, createdByUserId: actor.id,
  createdAt: new Date(), updatedAt: new Date(), subscription: { status: SubscriptionStatus.PENDING },
};
const receipt = `pay_${paymentId.replaceAll('-', '')}`;
const rawOrder = { id: 'order_ABC123', amountMinor: 49500n, currency: 'INR', receipt, status: 'created', createdAt: new Date() };

function harness(options: { payment?: typeof basePayment; enabled?: boolean; missingCredential?: boolean; createResult?: typeof rawOrder | Error; reconcile?: typeof rawOrder[]; competingOrder?: Partial<any> } = {}) {
  const payment = options.payment ?? { ...basePayment };
  const attempts: any[] = [];
  const orders: any[] = [];
  const audits: any[] = [];
  const resolutions: string[] = [];
  let currentVersion = 1;
  let providerCalls = 0;
  let historicalResolutionCalls = 0;
  let historicalFailureAtCall: number | null = null;
  const configuration = { id: configurationId, provider: payment.provider, mode: payment.providerMode, enabled: options.enabled ?? true };
  const credentialsById = new Map([
    ['credential-v1', { providerConfigurationId: configurationId, provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST, credentialVersionId: 'credential-v1', credentialVersion: 1, material: { keyId: 'rzp_test_v1', keySecret: 'secret-v1', webhookSecret: 'webhook-v1' } }],
    ['credential-v2', { providerConfigurationId: configurationId, provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST, credentialVersionId: 'credential-v2', credentialVersion: 2, material: { keyId: 'rzp_test_v2', keySecret: 'secret-v2', webhookSecret: 'webhook-v2' } }],
  ]);
  const paymentAttempt = {
    findFirst: async () => attempts.at(-1) ?? null,
    aggregate: async () => ({ _max: { sequence: attempts.length ? Math.max(...attempts.map((item) => item.sequence)) : null } }),
    create: async ({ data }: any) => { const value = { id: `attempt-${attempts.length + 1}`, providerOrderRecordId: null, providerOrderId: null, providerPaymentId: null, providerStatus: null, failureCode: null, safeFailureMessage: null, startedAt: new Date(), completedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }; attempts.push(value); return value; },
    updateMany: async ({ where, data }: any) => {
      const statuses = where.status?.in ?? [where.status];
      const value = attempts.find((item) => item.id === where.id && statuses.includes(item.status));
      if (!value) return { count: 0 }; Object.assign(value, data); return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }: any) => attempts.find((item) => item.id === where.id)!,
    update: async ({ where, data }: any) => { const value = attempts.find((item) => item.id === where.id)!; Object.assign(value, data); return value; },
  };
  const paymentProviderOrder = {
    findFirst: async () => orders.find((order) => [PaymentProviderOrderStatus.CREATED, PaymentProviderOrderStatus.PAID].includes(order.status)) ?? null,
    aggregate: async () => ({ _max: { sequence: orders.length ? Math.max(...orders.map((item) => item.sequence)) : null } }),
    create: async ({ data }: any) => { const value = { id: `order-record-${orders.length + 1}`, createdAt: new Date(), updatedAt: new Date(), usableUntil: null, closedAt: null, ...data }; orders.push(value); return value; },
  };
  const tx = {
    $queryRaw: async () => [{ id: paymentId }], payment: { findUnique: async () => payment }, paymentAttempt, paymentProviderOrder,
    billingProviderConfiguration: { findUnique: async () => configuration },
    billingProviderCredential: { findFirst: async ({ where }: any) => where.id === `credential-v${currentVersion}` ? { id: where.id, retiredAt: null } : { id: where.id, retiredAt: new Date() } },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
  };
  const prisma = { ...tx, $transaction: async (callback: any) => callback(tx) };
  const credentials = {
    resolveForOperation: async () => {
      if (!configuration.enabled) throw new ConflictException('not eligible');
      if (options.missingCredential) throw new ConflictException('missing credential');
      const value = credentialsById.get(`credential-v${currentVersion}`)!; resolutions.push(`current:${value.credentialVersionId}`); return value;
    },
    resolveBoundCredentialForRecovery: async (_config: string, id: string) => {
      historicalResolutionCalls += 1;
      if (historicalFailureAtCall === historicalResolutionCalls) throw new Error('safe simulated historical resolution failure');
      const value = credentialsById.get(id); if (!value) throw new ConflictException('missing'); resolutions.push(`historical:${id}`); return value;
    },
  };
  const adapter = {
    createOrder: async (context: any) => {
      providerCalls += 1; resolutions.push(`create:${context.credentialVersionId}`);
      if (options.createResult instanceof Error) throw options.createResult;
      if (options.competingOrder) orders.push({
        id: 'order-record-competing', paymentId, providerConfigurationId: configurationId,
        credentialVersionId: 'credential-v1', sequence: 1, status: PaymentProviderOrderStatus.CREATED,
        providerOrderId: rawOrder.id, providerStatus: rawOrder.status, providerReceipt: receipt,
        amountMinor: rawOrder.amountMinor, currency: rawOrder.currency, providerCreatedAt: rawOrder.createdAt,
        safeMetadata: {}, usableUntil: null, closedAt: null, createdAt: new Date(), updatedAt: new Date(),
        ...options.competingOrder,
      });
      return options.createResult ?? rawOrder;
    },
    findOrdersByReceipt: async (context: any) => { resolutions.push(`reconcile:${context.credentialVersionId}`); return options.reconcile ?? []; },
  };
  const service = new PaymentProviderOrdersService(prisma as never, credentials as never, { resolve: () => adapter } as never);
  return {
    service, payment, attempts, orders, audits, resolutions, providerCalls: () => providerCalls,
    rotate: () => { currentVersion = 2; },
    failNextHistoricalResolution: () => { historicalFailureAtCall = historicalResolutionCalls + 1; },
    failHistoricalResolutionAtCall: (call: number) => { historicalFailureAtCall = call; },
  };
}

describe('PaymentProviderOrdersService E1.4', () => {
  it('creates from Payment evidence, binds one credential version, and leaves Payment/subscription pending', async () => {
    const h = harness();
    const result = await h.service.prepare(paymentId, actor);
    assert.equal(result.amountMinor, '49500'); assert.equal(result.currency, 'INR'); assert.equal(result.keyId, 'rzp_test_v1');
    assert.equal(h.attempts[0].credentialVersionId, 'credential-v1'); assert.equal(h.attempts[0].status, PaymentAttemptStatus.SUCCEEDED);
    assert.equal(h.orders[0].credentialVersionId, 'credential-v1'); assert.equal(h.orders[0].providerReceipt, receipt);
    assert.equal(h.payment.status, PaymentStatus.PENDING); assert.equal(h.payment.subscription.status, SubscriptionStatus.PENDING);
    assert.equal(h.audits.length, 1); assert.equal(JSON.stringify(h.audits).includes('secret-v1'), false);
  });

  it('does not switch credentials when rotation occurs after reservation', async () => {
    const h = harness({ createResult: rawOrder });
    const original = (h.service as any).providers.resolve().createOrder;
    (h.service as any).providers.resolve = () => ({ createOrder: async (context: any, input: any) => { h.rotate(); return original(context, input); } });
    await h.service.prepare(paymentId, actor);
    assert.deepEqual(h.resolutions.filter((value) => value.startsWith('create:')), ['create:credential-v1']);
    assert.equal(h.orders[0].credentialVersionId, 'credential-v1');
  });

  it('returns a compatible current order idempotently without another provider call or audit', async () => {
    const h = harness(); const first = await h.service.prepare(paymentId, actor); const second = await h.service.prepare(paymentId, actor);
    assert.equal(second.providerOrderId, first.providerOrderId); assert.equal(h.providerCalls(), 1); assert.equal(h.audits.length, 1);
  });

  it('resolves a same-credential competing order without a second provider call', async () => {
    const h = harness({ competingOrder: { credentialVersionId: 'credential-v1' } });
    const result = await h.service.prepare(paymentId, actor);
    assert.equal(result.keyId, 'rzp_test_v1'); assert.equal(h.providerCalls(), 1); assert.equal(h.orders.length, 1);
    assert.equal(h.attempts[0].status, PaymentAttemptStatus.SUCCEEDED);
    assert.equal(h.attempts[0].providerOrderRecordId, 'order-record-competing');
    assert.equal(h.audits.length, 1); assert.equal(h.audits[0].action, 'PAYMENT_PROVIDER_ORDER_RECONCILED');
  });

  it('returns the competing order historical key and durably resolves the attempt after credential rotation', async () => {
    const h = harness({ competingOrder: { credentialVersionId: 'credential-v2' } });
    const result = await h.service.prepare(paymentId, actor);
    assert.equal(result.keyId, 'rzp_test_v2'); assert.equal(h.providerCalls(), 1); assert.equal(h.orders.length, 1);
    assert.equal(h.attempts[0].status, PaymentAttemptStatus.SUCCEEDED);
    assert.equal(h.attempts[0].providerOrderRecordId, 'order-record-competing');
    assert.equal(h.attempts[0].providerOrderId, rawOrder.id);
    assert.equal(h.audits.length, 1); assert.equal(h.audits[0].action, 'PAYMENT_PROVIDER_ORDER_RECONCILED');
    assert.ok(h.resolutions.includes('historical:credential-v2'));
  });

  it('fails closed and leaves the attempt UNKNOWN for incompatible competing provider evidence', async () => {
    const h = harness({ competingOrder: { providerOrderId: 'order_DIFFERENT' } });
    await assert.rejects(() => h.service.prepare(paymentId, actor), ConflictException);
    assert.equal(h.providerCalls(), 1); assert.equal(h.orders.length, 1);
    assert.equal(h.attempts[0].status, PaymentAttemptStatus.UNKNOWN);
    assert.equal(h.attempts[0].providerOrderRecordId, null); assert.equal(h.audits.length, 0);
  });

  it('returns an existing rotated order with its exact historical key', async () => {
    const h = harness({ competingOrder: { credentialVersionId: 'credential-v1' } });
    await h.service.prepare(paymentId, actor);
    h.rotate();
    const result = await h.service.prepare(paymentId, actor);
    assert.equal(result.keyId, 'rzp_test_v1'); assert.equal(h.providerCalls(), 1); assert.equal(h.audits.length, 1);
  });

  it('preserves durable success when post-commit checkout credential resolution fails and retries idempotently', async () => {
    const h = harness();
    h.failNextHistoricalResolution();
    await assert.rejects(() => h.service.prepare(paymentId, actor), /safe simulated historical resolution failure/);
    assert.equal(h.orders.length, 1); assert.equal(h.attempts[0].status, PaymentAttemptStatus.SUCCEEDED);
    assert.equal(h.attempts[0].providerOrderRecordId, h.orders[0].id); assert.ok(h.attempts[0].completedAt);
    assert.equal(h.audits.length, 1); assert.equal(h.audits[0].action, 'PAYMENT_PROVIDER_ORDER_CREATED'); assert.equal(h.providerCalls(), 1);
    const retry = await h.service.prepare(paymentId, actor);
    assert.equal(retry.providerOrderId, rawOrder.id); assert.equal(retry.keyId, 'rzp_test_v1');
    assert.equal(h.providerCalls(), 1); assert.equal(h.audits.length, 1);
  });

  it('preserves reconciled success when post-commit checkout credential resolution fails', async () => {
    const h = harness({ createResult: new ProviderOperationError('AMBIGUOUS', 'TIMEOUT', 'unknown'), reconcile: [rawOrder] });
    await assert.rejects(() => h.service.prepare(paymentId, actor), ConflictException);
    h.failHistoricalResolutionAtCall(2);
    await assert.rejects(() => h.service.prepare(paymentId, actor), /safe simulated historical resolution failure/);
    assert.equal(h.orders.length, 1); assert.equal(h.attempts[0].status, PaymentAttemptStatus.SUCCEEDED);
    assert.equal(h.attempts[0].providerOrderRecordId, h.orders[0].id); assert.ok(h.attempts[0].completedAt);
    assert.equal(h.audits.length, 1); assert.equal(h.audits[0].action, 'PAYMENT_PROVIDER_ORDER_RECONCILED'); assert.equal(h.providerCalls(), 1);
    await h.service.prepare(paymentId, actor);
    assert.equal(h.providerCalls(), 1); assert.equal(h.audits.length, 1);
  });

  it('reuses already-SUCCEEDED compatible persistence without rewriting or duplicate audit', async () => {
    const h = harness();
    await h.service.prepare(paymentId, actor);
    const completedAt = h.attempts[0].completedAt;
    const durable = await (h.service as any).persistSuccess(h.payment, h.attempts[0], rawOrder, true, actor);
    assert.equal(durable.id, h.orders[0].id); assert.equal(h.orders.length, 1);
    assert.equal(h.attempts[0].completedAt, completedAt); assert.equal(h.audits.length, 1);
  });

  it('marks timeout UNKNOWN, blocks blind duplication, and recovers with retired bound credential', async () => {
    const h = harness({ createResult: new ProviderOperationError('AMBIGUOUS', 'TIMEOUT', 'Provider result unknown'), reconcile: [rawOrder] });
    await assert.rejects(() => h.service.prepare(paymentId, actor), ConflictException);
    assert.equal(h.attempts[0].status, PaymentAttemptStatus.UNKNOWN); assert.equal(h.providerCalls(), 1);
    h.rotate(); await h.service.prepare(paymentId, actor);
    assert.equal(h.providerCalls(), 1); assert.ok(h.resolutions.includes('historical:credential-v1')); assert.ok(h.resolutions.includes('reconcile:credential-v1'));
    assert.equal(h.orders[0].credentialVersionId, 'credential-v1');
  });

  it('keeps UNKNOWN when receipt lookup cannot prove absence or returns conflicts', async () => {
    for (const reconcile of [[], [rawOrder, { ...rawOrder, id: 'order_OTHER' }]]) {
      const h = harness({ createResult: new ProviderOperationError('AMBIGUOUS', 'TIMEOUT', 'unknown'), reconcile });
      await assert.rejects(() => h.service.prepare(paymentId, actor), ConflictException);
      await assert.rejects(() => h.service.prepare(paymentId, actor), ConflictException);
      assert.equal(h.attempts[0].status, PaymentAttemptStatus.UNKNOWN); assert.equal(h.orders.length, 0); assert.equal(h.providerCalls(), 1);
    }
  });

  it('marks definite rejection FAILED without failing Payment', async () => {
    const h = harness({ createResult: new ProviderOperationError('DEFINITE_FAILURE', 'REJECTED', 'Safe rejection') });
    await assert.rejects(() => h.service.prepare(paymentId, actor), BadGatewayException);
    assert.equal(h.attempts[0].status, PaymentAttemptStatus.FAILED); assert.equal(h.payment.status, PaymentStatus.PENDING); assert.equal(h.audits[0].action, 'PAYMENT_PROVIDER_ORDER_FAILED');
  });

  it('rejects response mismatches and malformed evidence as UNKNOWN without persistence', async () => {
    for (const patch of [{ amountMinor: 1n }, { currency: 'USD' }, { receipt: 'wrong' }, { id: ' ' }, { status: 'unknown' }, { createdAt: null }]) {
      const h = harness({ createResult: { ...rawOrder, ...patch } });
      await assert.rejects(() => h.service.prepare(paymentId, actor), ConflictException);
      assert.equal(h.attempts[0].status, PaymentAttemptStatus.UNKNOWN); assert.equal(h.orders.length, 0);
    }
  });

  it('enforces tenant, disabled configuration, TEST-only, pending-only, and existing credential requirements', async () => {
    await assert.rejects(() => harness().service.prepare(paymentId, { ...actor, companyId: '00000000-0000-4000-8000-000000000099' }), ForbiddenException);
    await assert.rejects(() => harness({ enabled: false }).service.prepare(paymentId, actor), ConflictException);
    await assert.rejects(() => harness({ missingCredential: true }).service.prepare(paymentId, actor), ConflictException);
    await assert.rejects(() => harness({ payment: { ...basePayment, providerMode: PaymentProviderMode.LIVE } }).service.prepare(paymentId, actor), ConflictException);
    await assert.rejects(() => harness({ payment: { ...basePayment, status: PaymentStatus.CAPTURED, capturedAt: new Date(), capturedProviderPaymentId: 'pay_x' } }).service.prepare(paymentId, actor), BadRequestException);
  });

  it('rejects every client-controlled commercial/provider field at the API DTO boundary', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const body of [{ amountMinor: '1' }, { currency: 'USD' }, { provider: 'RAZORPAY' }, { providerMode: 'LIVE' }, { providerConfigurationId: configurationId }, { credentialVersionId: 'x' }, { receipt: 'x' }, { providerOrderId: 'x' }, { companyId }, { subscriptionId }, { keyId: 'rzp_test_attacker' }]) {
      await assert.rejects(() => pipe.transform(plainToInstance(CreateProviderOrderDto, body), { type: 'body', metatype: CreateProviderOrderDto }), BadRequestException);
    }
  });
});
