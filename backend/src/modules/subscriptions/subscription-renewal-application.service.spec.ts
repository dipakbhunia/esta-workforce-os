import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BillingInterval, PaymentPurpose, PaymentStatus, RecurringPriceBasis,
  SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';
import {
  SUBSCRIPTION_RENEWAL_APPLIED, SUBSCRIPTION_RENEWAL_BLOCKED,
  SUBSCRIPTION_RENEWAL_RECOVERED_AFTER_EXPIRATION, SubscriptionRenewalApplicationService,
} from './subscription-renewal-application.service';

const ids = { payment: '00000000-0000-4000-8000-000000000001', renewal: '00000000-0000-4000-8000-000000000002',
  subscription: '00000000-0000-4000-8000-000000000003', company: '00000000-0000-4000-8000-000000000004' };
const cycleStart = new Date('2026-10-01T00:00:00.000Z');
const cycleEnd = new Date('2026-11-01T00:00:00.000Z');

function harness(options: Record<string, any> = {}) {
  const subscription: any = { id: ids.subscription, companyId: ids.company,
    status: options.subscriptionStatus ?? SubscriptionStatus.ACTIVE,
    currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
    currentPeriodEnd: options.boundary ?? cycleStart,
    endedAt: options.subscriptionStatus === SubscriptionStatus.EXPIRED ? cycleStart : null };
  const payment: any = { id: ids.payment, companyId: options.paymentCompanyId ?? ids.company,
    subscriptionId: ids.subscription, purpose: options.purpose ?? PaymentPurpose.SUBSCRIPTION_RENEWAL,
    status: options.paymentStatus ?? PaymentStatus.CAPTURED, amountMinor: options.amountMinor ?? 1000n,
    currency: options.paymentCurrency ?? 'INR', capturedAt: new Date('2026-09-30T00:00:00Z'),
    capturedProviderPaymentId: 'pay_safe', taxSnapshot: options.taxSnapshot ?? null };
  const renewal: any = { id: ids.renewal, companyId: ids.company, subscriptionId: ids.subscription,
    paymentId: ids.payment, cycleStart, cycleEnd, billingInterval: BillingInterval.MONTHLY,
    recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n,
    recurringTotalPriceMinor: 1000n, currency: 'INR', seatQuantity: 10,
    status: options.renewalStatus ?? SubscriptionRenewalStatus.PREPARED,
    createdAt: options.renewalCreatedAt ?? new Date('2026-09-01T00:00:00.000Z'),
    applicationAttemptCount: 0, appliedAt: options.renewalStatus === SubscriptionRenewalStatus.APPLIED ? new Date() : null,
    blockedAt: options.renewalStatus === SubscriptionRenewalStatus.BLOCKED ? new Date() : null,
    blockCode: options.renewalStatus === SubscriptionRenewalStatus.BLOCKED ? 'INCOMPATIBLE_SUBSCRIPTION_STATE' : null,
    safeBlockMessage: null, payment };
  const audits: any[] = []; const events: string[] = []; const generated: string[] = [];
  const tx: any = {
    $queryRaw: async (query: any) => { const sql = Array.isArray(query?.strings) ? query.strings.join('?') : String(query); for (const table of ['CompanySubscription', 'Payment', 'SubscriptionRenewal']) if (sql.includes(`FROM "${table}"`)) events.push(`lock:${table}`); return [{ id: 'locked' }]; },
    subscriptionRenewal: {
      findUnique: async () => renewal,
      findMany: async () => options.laterRenewals ?? [],
      update: async ({ data }: any) => { events.push(`renewal:${data.status ?? 'attempt'}`); if (data.applicationAttemptCount?.increment) renewal.applicationAttemptCount += data.applicationAttemptCount.increment; Object.assign(renewal, data, { applicationAttemptCount: renewal.applicationAttemptCount }); return renewal; },
    },
    companySubscription: {
      findUnique: async () => subscription,
      findFirst: async () => options.live ? { id: 'other-live' } : null,
      update: async ({ data }: any) => { events.push('subscription:update'); Object.assign(subscription, data); return subscription; },
    },
    auditLog: {
      findFirst: async ({ where }: any) => audits.find(audit => audit.action === where.action && audit.entityId === where.entityId) ?? null,
      create: async ({ data }: any) => { audits.push(data); events.push(`audit:${data.action}`); return data; },
    },
  };
  const prisma: any = {
    payment: { findUnique: async () => ({ companyId: ids.company, renewal: { id: ids.renewal } }) },
    $transaction: async (callback: any) => { const result = await callback(tx); events.push('transaction:commit'); return result; },
    $queryRaw: async () => options.candidates ?? [],
  };
  const service = new SubscriptionRenewalApplicationService(prisma,
    { lockCompany: async () => events.push('company:lock') } as never,
    { generate: async (id: string) => { generated.push(id); events.push('invoice:generate'); if (options.invoiceThrows) throw new Error('invoice unavailable'); return { outcome: 'ISSUED' }; } } as never);
  return { service, subscription, payment, renewal, audits, events, generated };
}

describe('SubscriptionRenewalApplicationService', () => {
  it('atomically applies the exact next ACTIVE cycle and triggers Invoice generation after commit', async () => {
    const h = harness();
    const result = await h.service.apply(ids.payment);
    assert.equal(result.outcome, 'APPLIED');
    assert.equal(h.subscription.currentPeriodStart, cycleStart); assert.equal(h.subscription.currentPeriodEnd, cycleEnd);
    assert.equal(h.renewal.status, SubscriptionRenewalStatus.APPLIED); assert.ok(h.renewal.appliedAt instanceof Date);
    assert.equal(h.renewal.applicationAttemptCount, 1);
    assert.deepEqual(h.audits.map(audit => audit.action), [SUBSCRIPTION_RENEWAL_APPLIED]);
    assert.ok(h.events.indexOf('transaction:commit') < h.events.indexOf('invoice:generate'));
    assert.deepEqual(h.generated, [ids.payment]);
    assert.deepEqual(h.events.filter(event => event.startsWith('lock:')), ['lock:CompanySubscription', 'lock:Payment', 'lock:SubscriptionRenewal']);
  });

  it('returns APPLIED replay idempotently without another period mutation, attempt, or audit', async () => {
    const h = harness({ renewalStatus: SubscriptionRenewalStatus.APPLIED });
    h.subscription.currentPeriodStart = cycleStart; h.subscription.currentPeriodEnd = cycleEnd;
    const result = await h.service.apply(ids.payment);
    assert.equal(result.outcome, 'ALREADY_APPLIED'); assert.equal(h.renewal.applicationAttemptCount, 0);
    assert.deepEqual(h.audits, []); assert.equal(h.events.includes('subscription:update'), false);
    assert.deepEqual(h.generated, []);
  });

  it('fails closed on inconsistent APPLIED Payment, commercial, currency, or GST evidence without Invoice generation', async () => {
    const tax = { companyId: ids.company, sourceSubscriptionId: ids.subscription, currency: 'INR', taxableSubtotalMinor: 1000n,
      totalTaxMinor: 180n, grossTotalMinor: 1180n, components: [{ taxableAmountMinor: 1000n, taxAmountMinor: 180n, currency: 'INR' }] };
    for (const options of [
      { paymentStatus: PaymentStatus.PENDING }, { purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION },
      { amountMinor: 999n }, { paymentCurrency: 'USD' },
      { amountMinor: 1180n, taxSnapshot: { ...tax, totalTaxMinor: 179n } },
    ]) {
      const h = harness({ ...options, renewalStatus: SubscriptionRenewalStatus.APPLIED });
      h.subscription.currentPeriodStart = cycleStart; h.subscription.currentPeriodEnd = cycleEnd;
      await assert.rejects(() => h.service.apply(ids.payment), /Applied renewal evidence conflicts/);
      assert.deepEqual(h.generated, []); assert.equal(h.events.includes('subscription:update'), false);
    }
  });

  it('reconciles an older APPLIED renewal through contiguous later captured renewal evidence without mutation or Invoice generation', async () => {
    const laterStart = cycleEnd; const laterEnd = new Date('2026-12-01T00:00:00.000Z');
    const laterPayment = { id: 'later-payment', companyId: ids.company, subscriptionId: ids.subscription,
      purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: PaymentStatus.CAPTURED, amountMinor: 1000n, currency: 'INR',
      capturedAt: new Date('2026-10-31T00:00:00Z'), capturedProviderPaymentId: 'pay_later', taxSnapshot: null };
    const laterRenewal = { id: 'later-renewal', companyId: ids.company, subscriptionId: ids.subscription,
      paymentId: laterPayment.id, cycleStart: laterStart, cycleEnd: laterEnd, billingInterval: BillingInterval.MONTHLY,
      recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT, recurringUnitPriceMinor: 100n,
      recurringTotalPriceMinor: 1000n, currency: 'INR', seatQuantity: 10,
      status: SubscriptionRenewalStatus.APPLIED, payment: laterPayment };
    const h = harness({ renewalStatus: SubscriptionRenewalStatus.APPLIED, laterRenewals: [laterRenewal] });
    h.subscription.currentPeriodStart = laterStart; h.subscription.currentPeriodEnd = laterEnd;
    assert.equal((await h.service.apply(ids.payment)).outcome, 'ALREADY_APPLIED');
    assert.equal(h.events.includes('subscription:update'), false); assert.deepEqual(h.generated, []);
  });

  it('does not apply non-captured truth or a previously BLOCKED renewal', async () => {
    const pending = harness({ paymentStatus: PaymentStatus.PENDING });
    assert.equal((await pending.service.apply(ids.payment)).outcome, 'NOT_READY');
    assert.equal(pending.renewal.applicationAttemptCount, 0); assert.deepEqual(pending.generated, []);
    const blocked = harness({ renewalStatus: SubscriptionRenewalStatus.BLOCKED });
    assert.equal((await blocked.service.apply(ids.payment)).outcome, 'BLOCKED');
    assert.deepEqual(blocked.generated, []);
  });

  it('blocks wrong purpose, ownership, money, currency, boundary, and competing live subscription safely', async () => {
    for (const options of [
      { purpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION }, { paymentCompanyId: 'wrong-company' },
      { amountMinor: 999n }, { paymentCurrency: 'USD' }, { boundary: new Date('2026-09-30T00:00:00Z') }, { live: true },
    ]) {
      const h = harness(options); const result = await h.service.apply(ids.payment);
      assert.equal(result.outcome, 'BLOCKED'); assert.equal(h.renewal.status, SubscriptionRenewalStatus.BLOCKED);
      assert.ok(h.renewal.blockCode); assert.equal(h.audits.filter(audit => audit.action === SUBSCRIPTION_RENEWAL_BLOCKED).length, 1);
      assert.deepEqual(h.generated, []);
    }
  });

  it('reuses persisted GST evidence and rejects contradictory GST without consulting policy state', async () => {
    const tax = { companyId: ids.company, sourceSubscriptionId: ids.subscription, currency: 'INR', taxableSubtotalMinor: 1000n,
      totalTaxMinor: 180n, grossTotalMinor: 1180n, components: [{ taxableAmountMinor: 1000n, taxAmountMinor: 180n, currency: 'INR' }] };
    const valid = harness({ amountMinor: 1180n, taxSnapshot: tax });
    assert.equal((await valid.service.apply(ids.payment)).outcome, 'APPLIED');
    const invalid = harness({ amountMinor: 1180n, taxSnapshot: { ...tax, totalTaxMinor: 179n } });
    assert.equal((await invalid.service.apply(ids.payment)).outcome, 'BLOCKED');
  });

  it('recovers an exact pre-existing renewal after expiration and rejects arbitrary EXPIRED state', async () => {
    const valid = harness({ subscriptionStatus: SubscriptionStatus.EXPIRED });
    const result = await valid.service.apply(ids.payment);
    assert.equal(result.outcome, 'APPLIED'); assert.equal(valid.subscription.status, SubscriptionStatus.ACTIVE);
    assert.equal(valid.subscription.endedAt, null);
    assert.deepEqual(valid.audits.map(audit => audit.action), [SUBSCRIPTION_RENEWAL_RECOVERED_AFTER_EXPIRATION]);
    const invalid = harness({ subscriptionStatus: SubscriptionStatus.EXPIRED }); invalid.subscription.endedAt = new Date('2026-09-15');
    assert.equal((await invalid.service.apply(ids.payment)).outcome, 'BLOCKED');
  });

  it('rejects post-boundary renewal evidence only for privileged EXPIRED recovery', async () => {
    const expired = harness({ subscriptionStatus: SubscriptionStatus.EXPIRED, renewalCreatedAt: new Date(cycleStart.getTime() + 1) });
    const blocked = await expired.service.apply(ids.payment);
    assert.equal(blocked.outcome, 'BLOCKED');
    if (blocked.outcome === 'BLOCKED') assert.equal(blocked.code, 'RENEWAL_PROVENANCE_INVALID');
    const active = harness({ renewalCreatedAt: new Date(cycleStart.getTime() + 1) });
    assert.equal((await active.service.apply(ids.payment)).outcome, 'APPLIED');
  });

  it('does not roll back a committed application when post-commit Invoice generation fails', async () => {
    const h = harness({ invoiceThrows: true });
    assert.equal((await h.service.apply(ids.payment)).outcome, 'APPLIED');
    assert.equal(h.subscription.currentPeriodEnd, cycleEnd); assert.equal(h.renewal.status, SubscriptionRenewalStatus.APPLIED);
  });

  it('discovers bounded captured PREPARED recovery work and isolates transient failures', async () => {
    const h = harness({ candidates: [{ paymentId: 'first' }, { paymentId: 'second' }] }); const calls: string[] = [];
    (h.service as any).apply = async (id: string) => { calls.push(id); if (id === 'first') throw new Error('temporary'); };
    await h.service.recoverDue(25); assert.deepEqual(calls, ['first', 'second']);
  });
});
