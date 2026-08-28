import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { Reflector } from '@nestjs/core';
import {
  PaymentAttemptOperation,
  PaymentAttemptStatus,
  PaymentProviderMode,
  PaymentProviderOrderStatus,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
  Prisma,
  RoleName,
  SubscriptionActivationSource,
  SubscriptionStatus,
  UserStatus,
} from '@prisma/client';
import { ConfirmCheckoutDto } from './dto/confirm-checkout.dto';
import { PaymentCheckoutConfirmationsService } from './payment-checkout-confirmations.service';
import { PaymentsController } from './payments.controller';
import { RolesGuard } from '../../common/guards/roles.guard';

const companyId = '00000000-0000-4000-8000-000000000001';
const paymentId = '00000000-0000-4000-8000-000000000002';
const subscriptionId = '00000000-0000-4000-8000-000000000003';
const configurationId = '00000000-0000-4000-8000-000000000004';
const credentialId = '00000000-0000-4000-8000-000000000005';
const orderRecordId = '00000000-0000-4000-8000-000000000006';
const actor = { id: '00000000-0000-4000-8000-000000000007', companyId, email: 'admin@example.com', firstName: 'Company', lastName: 'Admin', status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN] };
const dto = { providerOrderId: 'order_STORED123', providerPaymentId: 'pay_RESULT123', signature: 'a'.repeat(64) };
const subscription = { id: subscriptionId, companyId, status: SubscriptionStatus.PENDING, activationSource: SubscriptionActivationSource.PAYMENT, activatedByPaymentId: null };
const order = { id: orderRecordId, paymentId, providerConfigurationId: configurationId, credentialVersionId: credentialId, sequence: 1, status: PaymentProviderOrderStatus.CREATED, providerOrderId: dto.providerOrderId, providerStatus: 'created', providerReceipt: `pay_${paymentId.replaceAll('-', '')}`, amountMinor: 49500n, currency: 'INR', providerCreatedAt: new Date(), usableUntil: null, closedAt: null, safeMetadata: null, createdAt: new Date(), updatedAt: new Date() };
const payment = { id: paymentId, companyId, subscriptionId, providerConfigurationId: configurationId, purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION, status: PaymentStatus.PENDING, provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST, amountMinor: 49500n, currency: 'INR', idempotencyKey: 'subscription-activation:test', businessReference: 'subscription-activation:test', capturedProviderPaymentId: null, providerStatus: null, failureCode: null, safeFailureMessage: null, authorizedAt: null, capturedAt: null, failedAt: null, createdByUserId: actor.id, createdAt: new Date(), updatedAt: new Date(), subscription, orders: [order] };

function harness(options: { valid?: boolean; payment?: typeof payment; credentialError?: Error; existing?: Record<string, unknown>; competing?: Record<string, unknown>; uniqueRace?: boolean } = {}) {
  const attempts: Record<string, any>[] = options.existing ? [{ ...options.existing }] : [];
  const audits: Record<string, any>[] = [];
  const resolvedCredentialIds: string[] = [];
  const verificationInputs: Record<string, any>[] = [];
  const selected = options.payment ?? payment;
  const tx = {
    $queryRaw: async () => [{ id: selected.id }],
    payment: { findUnique: async () => selected },
    paymentAttempt: {
      findFirst: async ({ where }: { where: Record<string, any> }) => {
        if (where.paymentId) return attempts.find((value) => value.paymentId === where.paymentId && value.operation === where.operation && value.status === where.status) ?? null;
        return options.competing ?? null;
      },
      aggregate: async () => ({ _max: { sequence: attempts.length ? Math.max(...attempts.map((value) => value.sequence)) : null } }),
      create: async ({ data }: { data: Record<string, any> }) => { const value = { id: 'attempt-1', startedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), ...data }; attempts.push(value); return value; },
    },
    auditLog: { create: async ({ data }: { data: Record<string, any> }) => { audits.push(data); return data; } },
  };
  let transactionCalls = 0;
  const prisma = { $transaction: async (callback: (client: typeof tx) => unknown) => { transactionCalls += 1; if (options.uniqueRace && transactionCalls === 1) throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.19.3' }); return callback(tx); } };
  const credentials = { resolveBoundCredentialForRecovery: async (_configurationId: string, id: string) => { resolvedCredentialIds.push(id); if (options.credentialError) throw options.credentialError; return { providerConfigurationId: configurationId, credentialVersionId: id, credentialVersion: 1, provider: PaymentProviderType.RAZORPAY, mode: PaymentProviderMode.TEST, material: { keyId: 'rzp_test_old', keySecret: 'historical-secret', webhookSecret: 'webhook-secret' } }; } };
  const provider = { verifyCheckoutSignature: async (_context: unknown, input: Record<string, any>) => { verificationInputs.push(input); return options.valid ?? true; } };
  const providers = { resolve: () => provider };
  return { service: new PaymentCheckoutConfirmationsService(prisma as never, credentials as never, providers as never), attempts, audits, resolvedCredentialIds, verificationInputs };
}

function successfulAttempt(providerPaymentId = dto.providerPaymentId) { return { id: 'attempt-existing', paymentId, providerConfigurationId: configurationId, credentialVersionId: credentialId, providerOrderRecordId: orderRecordId, sequence: 2, operation: PaymentAttemptOperation.CHECKOUT_CONFIRMATION, status: PaymentAttemptStatus.SUCCEEDED, providerOrderId: order.providerOrderId, providerPaymentId, providerStatus: 'checkout_signature_verified', amountMinor: payment.amountMinor, currency: payment.currency, requestReference: `checkout-confirmation:${orderRecordId}`, failureCode: null, safeFailureMessage: null, safeMetadata: {}, startedAt: new Date(), completedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }; }

describe('PaymentCheckoutConfirmationsService E1.5', () => {
  it('keeps checkout confirmation restricted to COMPANY_ADMIN and SUPER_ADMIN', () => {
    const roles = new Reflector().get<RoleName[]>('roles', PaymentsController);
    assert.deepEqual(roles, [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN]);
    const guard = new RolesGuard({ getAllAndOverride: () => roles } as never);
    const context = { getHandler: () => PaymentsController.prototype.confirmCheckout, getClass: () => PaymentsController, switchToHttp: () => ({ getRequest: () => ({ user: { ...actor, roles: [RoleName.HR] } }) }) };
    assert.throws(() => guard.canActivate(context as never), ForbiddenException);
  });

  it('persists only complete verified evidence using exact server money and historical credential', async () => {
    const h = harness(); const result = await h.service.confirm(paymentId, dto, actor);
    assert.equal(result.verificationStatus, 'VERIFIED'); assert.equal(result.paymentStatus, PaymentStatus.PENDING); assert.equal(result.subscriptionStatus, SubscriptionStatus.PENDING);
    assert.equal(h.attempts.length, 1); assert.equal(h.attempts[0].amountMinor, payment.amountMinor); assert.equal(h.attempts[0].currency, payment.currency); assert.equal(h.attempts[0].credentialVersionId, credentialId);
    assert.deepEqual(h.resolvedCredentialIds, [credentialId]); assert.equal(h.verificationInputs[0].storedProviderOrderId, order.providerOrderId); assert.equal(h.verificationInputs[0].signature, dto.signature);
    assert.equal(h.audits.length, 1); assert.equal(Object.values(h.attempts[0]).includes(dto.signature), false); assert.equal(JSON.stringify(h.audits).includes(dto.signature), false);
    assert.equal(payment.status, PaymentStatus.PENDING); assert.equal(payment.capturedProviderPaymentId, null); assert.equal(subscription.activatedByPaymentId, null);
  });

  it('rejects wrong order and invalid signature without evidence', async () => {
    const wrong = harness(); await assert.rejects(() => wrong.service.confirm(paymentId, { ...dto, providerOrderId: 'order_WRONG' }, actor), BadRequestException); assert.equal(wrong.attempts.length, 0); assert.equal(wrong.verificationInputs.length, 0);
    const invalid = harness({ valid: false }); await assert.rejects(() => invalid.service.confirm(paymentId, dto, actor), BadRequestException); assert.equal(invalid.attempts.length, 0); assert.equal(invalid.audits.length, 0);
  });

  it('enforces tenant and durable Payment/order/subscription compatibility', async () => {
    await assert.rejects(() => harness().service.confirm(paymentId, dto, { ...actor, companyId: '00000000-0000-4000-8000-000000000099' }), ForbiddenException);
    await assert.rejects(() => harness({ payment: { ...payment, amountMinor: 1n } }).service.confirm(paymentId, dto, actor), ConflictException);
    await assert.rejects(() => harness({ payment: { ...payment, subscription: { ...subscription, status: SubscriptionStatus.ACTIVE } } }).service.confirm(paymentId, dto, actor), ConflictException);
  });

  it('returns identical valid replay without a duplicate attempt or audit and rejects conflicting replay', async () => {
    const existing = successfulAttempt(); const h = harness({ existing }); const result = await h.service.confirm(paymentId, dto, actor);
    assert.equal(result.providerPaymentId, dto.providerPaymentId); assert.equal(h.attempts.length, 1); assert.equal(h.audits.length, 0);
    await assert.rejects(() => harness({ existing }).service.confirm(paymentId, { ...dto, providerPaymentId: 'pay_DIFFERENT' }, actor), ConflictException);
  });

  it('translates a same-Payment P2002 race into the durable idempotent result', async () => {
    const existing = successfulAttempt(); const h = harness({ existing, uniqueRace: true });
    const result = await h.service.confirm(paymentId, dto, actor);
    assert.equal(result.providerPaymentId, dto.providerPaymentId); assert.equal(h.attempts.length, 1); assert.equal(h.audits.length, 0);
  });

  it('rejects a provider payment already verified against another Payment', async () => {
    await assert.rejects(() => harness({ competing: successfulAttempt() }).service.confirm(paymentId, dto, actor), ConflictException);
  });

  it('uses a retired order-bound credential and propagates sanitized historical decryption failure', async () => {
    const h = harness(); await h.service.confirm(paymentId, dto, actor); assert.deepEqual(h.resolvedCredentialIds, [credentialId]);
    const unavailable = harness({ credentialError: new ServiceUnavailableException('Payment credential decryption failed') });
    await assert.rejects(() => unavailable.service.confirm(paymentId, dto, actor), (error: ServiceUnavailableException) => error.message === 'Payment credential decryption failed');
  });

  it('rejects malformed and client-controlled DTO fields', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    for (const body of [{ ...dto, signature: 'A'.repeat(64) }, { ...dto, amountMinor: '1' }, { ...dto, companyId }, { ...dto, providerMode: 'LIVE' }, { ...dto, credentialVersionId: credentialId }, { ...dto, status: 'CAPTURED' }]) {
      await assert.rejects(() => pipe.transform(plainToInstance(ConfirmCheckoutDto, body), { type: 'body', metatype: ConfirmCheckoutDto }), BadRequestException);
    }
  });
});
