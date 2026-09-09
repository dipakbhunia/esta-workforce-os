import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BillingInterval, InvoiceNumberResetPolicy, PaymentPurpose, PaymentStatus,
  PlanBillingModel, RecurringPriceBasis, SubscriptionActivationSource,
} from '@prisma/client';
import { invoiceNumberScope, InvoiceIssuanceError, InvoiceIssuanceService } from './invoice-issuance.service';

describe('Invoice issuance numbering authority', () => {
  it('uses a durable non-resetting bucket', () => {
    assert.deepEqual(invoiceNumberScope(InvoiceNumberResetPolicy.NEVER, new Date('2026-01-01T00:00:00Z')), { bucket: 'NEVER', label: '' });
  });

  it('changes calendar-year scope at Jan 1 00:00 Asia/Kolkata', () => {
    assert.deepEqual(invoiceNumberScope(InvoiceNumberResetPolicy.CALENDAR_YEAR, new Date('2025-12-31T18:29:59.999Z')), { bucket: '2025', label: '2025/' });
    assert.deepEqual(invoiceNumberScope(InvoiceNumberResetPolicy.CALENDAR_YEAR, new Date('2025-12-31T18:30:00.000Z')), { bucket: '2026', label: '2026/' });
  });

  it('changes financial-year scope at Apr 1 00:00 Asia/Kolkata', () => {
    assert.deepEqual(invoiceNumberScope(InvoiceNumberResetPolicy.FINANCIAL_YEAR, new Date('2026-03-31T18:29:59.999Z')), { bucket: 'FY2025-26', label: 'FY2025-26/' });
    assert.deepEqual(invoiceNumberScope(InvoiceNumberResetPolicy.FINANCIAL_YEAR, new Date('2026-03-31T18:30:00.000Z')), { bucket: 'FY2026-27', label: 'FY2026-27/' });
  });

  it('rejects an invalid issuance instant', () => {
    assert.throws(() => invoiceNumberScope(InvoiceNumberResetPolicy.NEVER, new Date('invalid')), InvoiceIssuanceError);
  });
});

describe('Invoice issuance eligibility', () => {
  const valid = () => ({
    id: '11111111-1111-4111-8111-111111111111', companyId: '22222222-2222-4222-8222-222222222222',
    subscriptionId: '33333333-3333-4333-8333-333333333333', purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION,
    status: PaymentStatus.CAPTURED, capturedAt: new Date('2026-09-01T00:00:00Z'), capturedProviderPaymentId: 'pay_safe',
    amountMinor: 1_000n, currency: 'INR', subscription: {
      id: '33333333-3333-4333-8333-333333333333', companyId: '22222222-2222-4222-8222-222222222222', currency: 'INR',
      planId: '44444444-4444-4444-8444-444444444444', activationSource: SubscriptionActivationSource.PAYMENT,
      billingModelSnapshot: PlanBillingModel.PER_USER,
      activatedByPaymentId: '11111111-1111-4111-8111-111111111111', billingInterval: BillingInterval.MONTHLY,
      pricingInterval: BillingInterval.MONTHLY, pricingResolvedAt: new Date(), planCodeSnapshot: 'SAFE',
      planNameSnapshot: 'Safe Plan', recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
      recurringUnitPriceMinor: 100n, recurringTotalPriceMinor: 1_000n, recurringCurrency: 'INR', seatQuantity: 10,
      currentPeriodStart: new Date('2026-09-01T00:00:00Z'), currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
    },
  });

  for (const [name, mutate, code] of [
    ['wrong purpose', (p: any) => { p.purpose = 'OTHER'; }, 'WRONG_PAYMENT_PURPOSE'],
    ['non-captured status', (p: any) => { p.status = PaymentStatus.PENDING; }, 'PAYMENT_NOT_CAPTURED'],
    ['missing capturedAt', (p: any) => { p.capturedAt = null; }, 'CAPTURE_EVIDENCE_MISSING'],
    ['missing provider identity', (p: any) => { p.capturedProviderPaymentId = ' '; }, 'CAPTURE_EVIDENCE_MISSING'],
    ['amount mismatch', (p: any) => { p.amountMinor = 999n; }, 'COMMERCIAL_MISMATCH'],
    ['currency mismatch', (p: any) => { p.currency = 'USD'; }, 'COMMERCIAL_MISMATCH'],
    ['subscription currency mismatch', (p: any) => { p.subscription.currency = 'USD'; }, 'COMMERCIAL_MISMATCH'],
    ['billing model and price basis mismatch', (p: any) => { p.subscription.billingModelSnapshot = PlanBillingModel.CUSTOM; }, 'COMMERCIAL_SNAPSHOT_INVALID'],
    ['invalid service period', (p: any) => { p.subscription.currentPeriodEnd = p.subscription.currentPeriodStart; }, 'SERVICE_PERIOD_INVALID'],
  ] as const) {
    it(`rejects ${name} before sequence allocation`, async () => {
      const payment = valid();
      mutate(payment);
      let sequenceCalls = 0;
      const tx: any = {
        invoice: { findFirst: async () => null },
        payment: { findUnique: async () => payment },
        $queryRaw: async () => { sequenceCalls += 1; return sequenceCalls === 1 ? [{ id: payment.id }] : []; },
      };
      const prisma: any = { invoice: tx.invoice, $transaction: async (callback: (client: any) => unknown) => callback(tx) };
      await assert.rejects(() => new InvoiceIssuanceService(prisma).issue(payment.id),
        (error: unknown) => error instanceof InvoiceIssuanceError && error.code === code);
      assert.equal(sequenceCalls, 1);
    });
  }

  it('rejects a missing source Payment before any create or sequence path', async () => {
    let transactionQueries = 0;
    let createCalls = 0;
    const tx: any = {
      invoice: { findFirst: async () => null, create: async () => { createCalls += 1; } },
      invoiceLine: { create: async () => { createCalls += 1; } },
      auditLog: { create: async () => { createCalls += 1; } },
      $queryRaw: async () => { transactionQueries += 1; return []; },
    };
    const prisma: any = { invoice: tx.invoice, $transaction: async (callback: (client: any) => unknown) => callback(tx) };
    await assert.rejects(() => new InvoiceIssuanceService(prisma).issue('11111111-1111-4111-8111-111111111111'),
      (error: unknown) => error instanceof InvoiceIssuanceError && error.code === 'PAYMENT_NOT_FOUND');
    assert.equal(transactionQueries, 1);
    assert.equal(createCalls, 0);
  });

  for (const [name, mutate, code] of [
    ['defensive company ownership mismatch', (p: any) => { p.subscription.companyId = '55555555-5555-4555-8555-555555555555'; }, 'OWNERSHIP_MISMATCH'],
    ['activation source-link mismatch', (p: any) => { p.subscription.activatedByPaymentId = null; }, 'ACTIVATION_LINK_MISMATCH'],
  ] as const) {
    it(`rejects ${name} before sequence allocation`, async () => {
      const payment = valid();
      mutate(payment);
      let queries = 0;
      let createCalls = 0;
      const tx: any = {
        invoice: { findFirst: async () => null, create: async () => { createCalls += 1; } },
        invoiceLine: { create: async () => { createCalls += 1; } },
        auditLog: { create: async () => { createCalls += 1; } },
        payment: { findUnique: async () => payment },
        $queryRaw: async () => { queries += 1; return queries === 1 ? [{ id: payment.id }] : []; },
      };
      const prisma: any = { invoice: tx.invoice, $transaction: async (callback: (client: any) => unknown) => callback(tx) };
      await assert.rejects(() => new InvoiceIssuanceService(prisma).issue(payment.id),
        (error: unknown) => error instanceof InvoiceIssuanceError && error.code === code);
      assert.equal(queries, 1);
      assert.equal(createCalls, 0);
    });
  }
});
