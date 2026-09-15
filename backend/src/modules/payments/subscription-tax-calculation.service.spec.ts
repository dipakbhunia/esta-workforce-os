import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GstRegistrationStatus, GstRoundingMode, GstTaxTreatment } from '@prisma/client';
import { calculateSubscriptionTax, GstTaxDomainError } from './subscription-tax-calculation.service';

const policy = { id: '00000000-0000-4000-8000-000000000001', policyCode: 'TEST_SUBSCRIPTION', version: 1,
  treatment: GstTaxTreatment.TAXABLE, currency: 'INR', totalRateBasisPoints: 1800, cgstRateBasisPoints: 900,
  sgstRateBasisPoints: 900, igstRateBasisPoints: 1800, serviceClassification: 'TEST-SAC',
  roundingMode: GstRoundingMode.HALF_UP_MINOR_UNIT_PER_COMPONENT, calculationVersion: 1 };
const seller = { gstin: '27ABCDE1234F1Z5', gstLegalName: 'Test Seller', sellerLegalName: 'Seller',
  gstRegisteredState: 'Maharashtra', gstRegisteredStateCode: '27' };
const buyer = { gstRegistrationStatus: GstRegistrationStatus.UNREGISTERED, gstin: null, state: 'Maharashtra',
  billingStateCode: '27', placeOfSupplyState: 'Maharashtra', placeOfSupplyStateCode: '27' };
const calculate = (overrides: Record<string, unknown> = {}) => calculateSubscriptionTax({ taxableSubtotalMinor: 1000n,
  currency: 'INR', decisionAt: new Date('2026-09-15T00:00:00Z'), policy, seller, buyer, ...overrides });

describe('GST subscription tax calculation', () => {
  it('calculates deterministic intra-state component evidence using bigint', () => {
    const first = calculate(); const second = calculate();
    assert.equal(first.totalTaxMinor, 180n); assert.equal(first.grossTotalMinor, 1180n);
    assert.deepEqual(first.components.map(({ type, taxAmountMinor }) => ({ type, taxAmountMinor })),
      [{ type: 'CGST', taxAmountMinor: 90n }, { type: 'SGST', taxAmountMinor: 90n }]);
    assert.deepEqual(first, second);
  });
  it('calculates inter-state IGST and exact half-up boundaries', () => {
    const result = calculate({ taxableSubtotalMinor: 5n, seller, buyer: { ...buyer, placeOfSupplyState: 'Karnataka', placeOfSupplyStateCode: '29' },
      policy: { ...policy, totalRateBasisPoints: 1000, cgstRateBasisPoints: 500, sgstRateBasisPoints: 500, igstRateBasisPoints: 1000 } });
    assert.equal(result.totalTaxMinor, 1n); assert.equal(result.components[0]?.type, 'IGST');
  });
  it('supports an explicit zero-rate non-taxable policy without classifying legacy data', () => {
    const result = calculate({ policy: { ...policy, treatment: GstTaxTreatment.NON_TAXABLE, totalRateBasisPoints: 0,
      cgstRateBasisPoints: 0, sgstRateBasisPoints: 0, igstRateBasisPoints: 0, serviceClassification: null } });
    assert.equal(result.totalTaxMinor, 0n); assert.equal(result.grossTotalMinor, 1000n); assert.deepEqual(result.components, []);
  });
  it('rejects overflow, component mismatch, missing evidence, and unsupported currency', () => {
    const invalid = [
      () => calculate({ taxableSubtotalMinor: 9_007_199_254_740_991n }),
      () => calculate({ policy: { ...policy, cgstRateBasisPoints: 800 } }),
      () => calculate({ seller: { ...seller, gstin: null } }),
      () => calculate({ buyer: { ...buyer, placeOfSupplyStateCode: null } }),
      () => calculate({ currency: 'USD' }),
    ];
    for (const operation of invalid) assert.throws(operation, GstTaxDomainError);
  });
  it('preserves the maximum supported amount under explicit zero tax', () => {
    const result = calculate({ taxableSubtotalMinor: 9_007_199_254_740_991n, policy: { ...policy,
      treatment: GstTaxTreatment.NON_TAXABLE, totalRateBasisPoints: 0, cgstRateBasisPoints: 0,
      sgstRateBasisPoints: 0, igstRateBasisPoints: 0, serviceClassification: null } });
    assert.equal(result.grossTotalMinor.toString(), '9007199254740991');
  });
});
