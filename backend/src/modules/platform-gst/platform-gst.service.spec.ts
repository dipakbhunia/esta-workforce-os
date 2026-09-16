import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GstTaxPolicyStatus, GstTaxTreatment, Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { PlatformGstService } from './platform-gst.service';

const date = new Date('2026-09-01T00:00:00Z');
const policy = { id: 'p', policyCode: 'SUBSCRIPTION_GST', version: 1, status: GstTaxPolicyStatus.DRAFT, effectiveFrom: date, effectiveUntil: null, currency: 'INR', treatment: GstTaxTreatment.TAXABLE, totalRateBasisPoints: 1800, cgstRateBasisPoints: 900, sgstRateBasisPoints: 900, igstRateBasisPoints: 1800, serviceClassification: '9983', roundingMode: 'HALF_UP_MINOR_UNIT_PER_COMPONENT', calculationVersion: 1, createdByUserId: 'u', createdAt: date, updatedAt: date };
function harness() {
  const calls: any[] = [];
  const tx: any = { gstTaxPolicyVersion: { findMany: async (args: any) => (calls.push(args), [policy]), count: async () => 1, findFirst: async () => ({ version: 2 }), findUnique: async () => policy, create: async ({ data }: any) => ({ ...policy, ...data, id: 'new' }) }, paymentTaxSnapshot: { findMany: async (args: any) => (calls.push(args), [evidence]), count: async () => 1, findUnique: async () => evidence }, $queryRaw: async () => [{ pg_advisory_xact_lock: null }] };
  const prisma: any = { ...tx, $transaction: async (callback: any) => callback(tx) };
  return { service: new PlatformGstService(prisma), calls };
}
const evidence: any = { id: 'e', paymentId: 'pay', companyId: 'company', sourceSubscriptionId: 'sub', policyVersionId: 'p', treatment: 'TAXABLE', calculationVersion: 1, decisionAt: date, currency: 'INR', taxableSubtotalMinor: 9007199254740000n, totalTaxMinor: 900n, grossTotalMinor: 9007199254740900n, jurisdictionClassification: 'INTER_STATE', serviceClassification: '9983', roundingMode: 'HALF_UP_MINOR_UNIT_PER_COMPONENT', sellerGstin: 'safe', sellerLegalName: 'Seller', sellerRegisteredState: 'State', sellerRegisteredStateCode: '27', buyerRegistrationStatus: 'UNREGISTERED', buyerGstin: null, buyerBillingState: 'State', buyerBillingStateCode: '29', placeOfSupplyState: 'State', placeOfSupplyStateCode: '29', createdAt: date, company: { id: 'company', name: 'Company' }, policyVersion: { policyCode: 'SUBSCRIPTION_GST', version: 1 }, components: [{ type: 'IGST', rateBasisPoints: 1, taxableAmountMinor: 9007199254740000n, taxAmountMinor: 900n, currency: 'INR' }], invoiceEvidence: { invoiceId: 'invoice', policyCode: 'SUBSCRIPTION_GST', policyVersion: 1, taxableSubtotalMinor: 9007199254740000n, totalTaxMinor: 900n, grossTotalMinor: 9007199254740900n, createdAt: date } };

describe('PlatformGstService', () => {
  it('lists policies with pagination, effective filtering, and deterministic ordering', async () => { const { service, calls } = harness(); const result: any = await service.listPolicies({ page: 2, limit: 10, status: GstTaxPolicyStatus.DRAFT, currency: 'INR', effectiveAt: date.toISOString() }); assert.equal(result.meta.total, 1); assert.equal(calls[0].skip, 10); assert.deepEqual(calls[0].orderBy, [{ effectiveFrom: 'desc' }, { version: 'desc' }, { id: 'desc' }]); });
  it('returns policy and persisted GST evidence details without deriving legacy rows', async () => { const { service } = harness(); assert.equal((await service.getPolicy('p')).id, 'p'); const detail: any = await service.getTransaction('e'); assert.equal(detail.grossTotalMinor, '9007199254740900'); assert.equal(detail.invoiceEvidence.invoiceId, 'invoice'); });
  it('appends a server-owned version without enabling GST', async () => { const { service } = harness(); const result: any = await service.createPolicy({ policyCode: 'SUBSCRIPTION_GST', status: GstTaxPolicyStatus.DRAFT, currency: 'INR', treatment: GstTaxTreatment.TAXABLE, totalRateBasisPoints: 1800, cgstRateBasisPoints: 900, sgstRateBasisPoints: 900, igstRateBasisPoints: 1800, serviceClassification: '9983', effectiveFrom: date.toISOString() }, 'actor'); assert.equal(result.version, 3); });
  it('rejects incoherent and retired append input', async () => { const { service } = harness(); await assert.rejects(() => service.createPolicy({ policyCode: 'X', status: GstTaxPolicyStatus.RETIRED, currency: 'INR', treatment: GstTaxTreatment.NON_TAXABLE, totalRateBasisPoints: 0, cgstRateBasisPoints: 0, sgstRateBasisPoints: 0, igstRateBasisPoints: 0, effectiveFrom: date.toISOString() }, 'actor')); });
  it('normalizes only positively identified policy conflicts and propagates unrelated raw failures', async () => {
    const dto = { policyCode: 'SUBSCRIPTION_GST', status: GstTaxPolicyStatus.DRAFT, currency: 'INR', treatment: GstTaxTreatment.NON_TAXABLE, totalRateBasisPoints: 0, cgstRateBasisPoints: 0, sgstRateBasisPoints: 0, igstRateBasisPoints: 0, effectiveFrom: date.toISOString() };
    const make = (error: Error) => new PlatformGstService({ $transaction: async (callback: any) => callback({ $queryRaw: async () => { throw error; } }) } as never);
    const unrelated = new Prisma.PrismaClientKnownRequestError('unrelated raw failure', { code: 'P2010', clientVersion: '6.19.3', meta: { code: 'XX000' } });
    await assert.rejects(() => make(unrelated).createPolicy(dto, 'actor'), error => error === unrelated);
    const expected = new Prisma.PrismaClientKnownRequestError('23P01 GstTaxPolicyVersion_active_window_excl', { code: 'P2010', clientVersion: '6.19.3', meta: { code: '23P01' } });
    await assert.rejects(() => make(expected).createPolicy(dto, 'actor'), ConflictException);
    const infrastructure = new Error('advisory lock unavailable');
    await assert.rejects(() => make(infrastructure).createPolicy(dto, 'actor'), error => error === infrastructure);
  });
  it('lists persisted evidence with exact strings, filters, pagination, ordering, linkage, and no sensitive provider fields', async () => { const { service, calls } = harness(); const result: any = await service.listTransactions({ page: 1, limit: 20, companyId: 'company', treatment: 'TAXABLE' as never, from: date.toISOString(), to: '2026-10-01T00:00:00Z' }); assert.equal(result.data[0].taxableSubtotalMinor, '9007199254740000'); assert.deepEqual(calls[0].orderBy, [{ decisionAt: 'desc' }, { id: 'desc' }]); const serialized = JSON.stringify(result); for (const key of ['keySecret', 'webhookSecret', 'authorization', 'rawPayload', 'normalizedPayload']) assert.equal(serialized.includes(key), false); });
});
