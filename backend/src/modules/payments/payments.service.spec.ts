import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  BillingInterval,
  PaymentProviderMode,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
  RoleName,
  SubscriptionActivationSource,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

const companyId = '00000000-0000-4000-8000-000000000001';
const subscriptionId = '00000000-0000-4000-8000-000000000002';
const actor = { id: '00000000-0000-4000-8000-000000000003', companyId, email: 'admin@example.com', firstName: 'Company', lastName: 'Admin', status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN] };
const subscription = {
  id: subscriptionId, companyId, activationSource: SubscriptionActivationSource.PAYMENT,
  status: SubscriptionStatus.PENDING, recurringTotalPriceMinor: 49500n, recurringCurrency: 'INR',
  pricingInterval: BillingInterval.MONTHLY, pricingResolvedAt: new Date(),
};
const provider = { id: '00000000-0000-4000-8000-000000000004', provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST, enabled: true, isDefault: true };
const payment = {
  id: '00000000-0000-4000-8000-000000000005', companyId, subscriptionId,
  providerConfigurationId: provider.id, purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION,
  status: PaymentStatus.PENDING, provider: provider.provider, providerMode: provider.mode,
  amountMinor: 49500n, currency: 'INR', idempotencyKey: `subscription-activation:${subscriptionId}`,
  businessReference: `subscription-activation:${subscriptionId}`, capturedProviderPaymentId: null,
  providerStatus: null, failureCode: null, safeFailureMessage: null, authorizedAt: null,
  capturedAt: null, failedAt: null, createdByUserId: actor.id, createdAt: new Date(), updatedAt: new Date(),
};

function harness(options: { subscription?: typeof subscription; provider?: typeof provider | null; existing?: typeof payment | null; createError?: unknown } = {}) {
  const events: string[] = [];
  const selectedSubscription = options.subscription ?? subscription;
  const selectedProvider = options.provider === undefined ? provider : options.provider;
  let createdData: Record<string, unknown> | null = null;
  let auditCount = 0;
  const existing = options.existing ?? null;
  const tx = {
    $queryRaw: async () => { events.push('lock-subscription'); return [{ id: subscriptionId }]; },
    companySubscription: { findUnique: async () => selectedSubscription },
    payment: {
      findFirst: async () => { events.push('find-payment'); return existing; },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.createError) throw options.createError;
        events.push('create-payment'); createdData = data;
        return { ...payment, ...data };
      },
    },
    billingProviderConfiguration: { findFirst: async () => selectedProvider },
    auditLog: { create: async () => { auditCount += 1; return {}; } },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    payment: { findFirst: async () => existing, findUnique: async () => existing ?? payment },
  };
  return { service: new PaymentsService(prisma as never), data: () => createdData, audits: () => auditCount, events };
}

describe('PaymentsService E1.2 creation runtime', () => {
  it('creates from the immutable subscription snapshot without consulting Plan pricing', async () => {
    const h = harness();
    const result = await h.service.createForSubscription(subscriptionId, actor);
    assert.equal(result.amountMinor, '49500');
    assert.equal(result.currency, 'INR');
    assert.equal('idempotencyKey' in result, false);
    assert.equal('providerConfigurationId' in result, false);
    assert.equal(h.data()?.amountMinor, 49500n);
    assert.equal(h.data()?.status, PaymentStatus.PENDING);
    assert.equal(h.audits(), 1);
    assert.equal((h.data() as Record<string, unknown>).activatedByPaymentId, undefined);
  });

  it('rejects client-controlled commercial and provider fields', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const body of [{ amountMinor: '1' }, { currency: 'USD' }, { companyId }, { providerConfigurationId: provider.id }]) {
      await assert.rejects(() => pipe.transform(plainToInstance(CreatePaymentDto, body), { type: 'body', metatype: CreatePaymentDto }), BadRequestException);
    }
  });

  it('rejects unresolved, invalid, and unsupported commercial snapshots', async () => {
    const variants = [
      { recurringTotalPriceMinor: null }, { recurringTotalPriceMinor: 0n }, { recurringCurrency: 'usd' },
      { pricingInterval: BillingInterval.CUSTOM }, { pricingResolvedAt: null },
    ];
    for (const patch of variants) await assert.rejects(() => harness({ subscription: { ...subscription, ...patch } as typeof subscription }).service.createForSubscription(subscriptionId, actor), BadRequestException);
  });

  it('rejects non-payment and non-pending subscriptions', async () => {
    await assert.rejects(() => harness({ subscription: { ...subscription, activationSource: SubscriptionActivationSource.MANUAL } }).service.createForSubscription(subscriptionId, actor), BadRequestException);
    await assert.rejects(() => harness({ subscription: { ...subscription, status: SubscriptionStatus.ACTIVE } }).service.createForSubscription(subscriptionId, actor), BadRequestException);
  });

  it('enforces tenant isolation while allowing super admin context', async () => {
    await assert.rejects(() => harness().service.createForSubscription(subscriptionId, { ...actor, companyId: '00000000-0000-4000-8000-000000000099' }), ForbiddenException);
    const result = await harness().service.createForSubscription(subscriptionId, { ...actor, companyId: null, roles: [RoleName.SUPER_ADMIN] });
    assert.equal(result.subscriptionId, subscriptionId);
  });

  it('rejects a missing or disabled default provider configuration', async () => {
    await assert.rejects(() => harness({ provider: null }).service.createForSubscription(subscriptionId, actor), ConflictException);
    await assert.rejects(() => harness({ provider: { ...provider, enabled: false } }).service.createForSubscription(subscriptionId, actor), ConflictException);
  });

  it('returns a compatible durable activation payment idempotently without another audit', async () => {
    const h = harness({ existing: payment });
    const result = await h.service.createForSubscription(subscriptionId, actor);
    assert.equal(result.id, payment.id);
    assert.equal(h.data(), null);
    assert.equal(h.audits(), 0);
    assert.deepEqual(h.events, ['lock-subscription', 'find-payment']);
  });

  it('rejects an incompatible durable activation payment', async () => {
    await assert.rejects(() => harness({ existing: { ...payment, amountMinor: 1n } }).service.createForSubscription(subscriptionId, actor), ConflictException);
  });

  it('serializes bigint on retrieval and enforces tenant access', async () => {
    assert.equal((await harness({ existing: payment }).service.findOne(payment.id, actor)).amountMinor, '49500');
    await assert.rejects(() => harness({ existing: payment }).service.findOne(payment.id, { ...actor, companyId: '00000000-0000-4000-8000-000000000099' }), ForbiddenException);
  });
});
