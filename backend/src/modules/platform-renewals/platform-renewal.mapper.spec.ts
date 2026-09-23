import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BillingInterval, GstJurisdictionClassification, GstTaxComponentType, GstTaxTreatment, PaymentProviderMode,
  PaymentProviderOrderStatus, PaymentProviderType, PaymentPurpose, PaymentStatus, RecurringPriceBasis,
  SubscriptionRenewalStatus, SubscriptionStatus,
} from '@prisma/client';
import { mapPlatformRenewal, mapPlatformRenewalDetails } from './platform-renewal.mapper';

function fixture(status = SubscriptionRenewalStatus.PREPARED): any {
  return { id: 'renewal', status, cycleStart: new Date('2030-01-01Z'), cycleEnd: new Date('2030-02-01Z'),
    billingInterval: BillingInterval.MONTHLY, recurringPriceBasis: RecurringPriceBasis.PER_USER_UNIT,
    recurringUnitPriceMinor: 900719925474099n, recurringTotalPriceMinor: 9007199254740990n, currency: 'INR', seatQuantity: 10,
    applicationAttemptCount: 2, lastApplicationAttemptAt: new Date('2030-01-02Z'), appliedAt: status === SubscriptionRenewalStatus.APPLIED ? new Date('2030-01-02Z') : null,
    blockedAt: status === SubscriptionRenewalStatus.BLOCKED ? new Date('2030-01-02Z') : null,
    blockCode: status === SubscriptionRenewalStatus.BLOCKED ? 'SAFE_CODE' : null,
    safeBlockMessage: status === SubscriptionRenewalStatus.BLOCKED ? 'Safe message' : null,
    createdAt: new Date('2029-12-01Z'), updatedAt: new Date('2030-01-02Z'), company: { id: 'company', name: 'Safe Company' },
    subscription: { id: 'subscription', status: SubscriptionStatus.ACTIVE, planId: 'plan', planCodeSnapshot: 'SAFE', planNameSnapshot: 'Safe Plan' },
    preparedBy: { id: 'user', email: 'safe@example.invalid', firstName: 'Safe', lastName: 'Admin' },
    payment: { id: 'payment', purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: PaymentStatus.CAPTURED,
      amountMinor: 9007199254740991n, currency: 'INR', provider: PaymentProviderType.RAZORPAY, providerMode: PaymentProviderMode.TEST,
      capturedAt: new Date('2030-01-01Z'), taxSnapshot: { treatment: GstTaxTreatment.TAXABLE, decisionAt: new Date('2029-12-01Z'),
        currency: 'INR', taxableSubtotalMinor: 9007199254740990n, totalTaxMinor: 1n, grossTotalMinor: 9007199254740991n,
        jurisdictionClassification: GstJurisdictionClassification.INTER_STATE, serviceClassification: 'SAC', placeOfSupplyState: 'Karnataka',
        placeOfSupplyStateCode: '29', components: [{ type: GstTaxComponentType.IGST, rateBasisPoints: 1,
          taxableAmountMinor: 9007199254740990n, taxAmountMinor: 1n, currency: 'INR' }] },
      orders: [{ id: 'order', sequence: 2, providerOrderId: 'safe_order', status: PaymentProviderOrderStatus.CREATED,
        providerStatus: 'created', createdAt: new Date('2029-12-01Z'), updatedAt: new Date('2029-12-01Z') }],
      invoice: { id: 'invoice', invoiceNumber: 'INV/1', issuedAt: new Date('2030-01-02Z'),
        servicePeriodStart: new Date('2030-01-01Z'), servicePeriodEnd: new Date('2030-02-01Z'), currency: 'INR',
        subtotalMinor: 9007199254740990n, totalTaxMinor: 1n, totalMinor: 9007199254740991n } } };
}

describe('platform renewal mapper', () => {
  it('maps PREPARED, APPLIED, and BLOCKED lifecycle evidence with exact decimal strings', () => {
    for (const status of [SubscriptionRenewalStatus.PREPARED, SubscriptionRenewalStatus.APPLIED, SubscriptionRenewalStatus.BLOCKED]) {
      const mapped = mapPlatformRenewal(fixture(status));
      assert.equal(mapped.status, status); assert.equal(mapped.recurringTotalPriceMinor, '9007199254740990');
      assert.equal(mapped.payment.amountMinor, '9007199254740991');
      if (status === SubscriptionRenewalStatus.BLOCKED) assert.equal(mapped.safeBlockMessage, 'Safe message');
    }
  });

  it('maps only persisted tax, current provider order, and source-Payment Invoice evidence safely', () => {
    const mapped = mapPlatformRenewalDetails(fixture());
    assert.equal(mapped.tax!.grossTotalMinor, '9007199254740991');
    assert.deepEqual(mapped.tax!.components, [{ type: GstTaxComponentType.IGST, rateBasisPoints: 1,
      taxableAmountMinor: '9007199254740990', taxAmountMinor: '1', currency: 'INR' }]);
    assert.equal(mapped.providerOrder!.sequence, 2); assert.equal(mapped.invoice!.totalMinor, '9007199254740991');
    const serialized = JSON.stringify(mapped);
    for (const forbidden of ['idempotencyKey', 'businessReference', 'providerConfigurationId', 'keySecret', 'rawPayload']) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });
});
