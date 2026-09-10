import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';
import { PaymentPurpose, InvoiceNumberResetPolicy } from '@prisma/client';
import { describe, it } from 'node:test';
import { PlatformInvoicesService } from './platform-invoices.service';

const instant = new Date('2026-09-08T12:00:00.000Z');
const summary = {
  id: 'invoice-id', invoiceNumber: 'INV/000001', companyId: 'company-id',
  sourcePaymentId: 'payment-id', sourceSubscriptionId: 'subscription-id', issuedAt: instant,
  dueAt: null, servicePeriodStart: instant, servicePeriodEnd: new Date('2026-10-08T12:00:00.000Z'),
  currency: 'INR', subtotalMinor: 9_007_199_254_740_991n, totalMinor: 9_007_199_254_740_991n,
};

describe('PlatformInvoicesService', () => {
  it('uses two bounded repeatable-read list queries, exact filters, half-open dates, and stable ordering', async () => {
    let findArgs: any;
    let countWhere: any;
    let isolation: unknown;
    const prisma = {
      $transaction: async (callback: (tx: any) => unknown, options: any) => {
        isolation = options.isolationLevel;
        return callback({
          invoice: {
            findMany: async (args: any) => { findArgs = args; return [summary]; },
            count: async ({ where }: any) => { countWhere = where; return 1; },
          },
        });
      },
    };
    const query = {
      page: 2, limit: 10, companyId: 'company-id', subscriptionId: 'subscription-id',
      sourcePaymentId: 'payment-id', invoiceNumber: 'INV/000001',
      from: '2026-09-01T00:00:00Z', to: '2026-10-01T00:00:00+05:30',
    };
    const result = await new PlatformInvoicesService(prisma as never).findAll(query);
    assert.equal(isolation, 'RepeatableRead');
    assert.deepEqual(findArgs.orderBy, [{ issuedAt: 'desc' }, { id: 'desc' }]);
    assert.equal(findArgs.skip, 10);
    assert.equal(findArgs.take, 10);
    assert.deepEqual(findArgs.where, countWhere);
    assert.deepEqual(findArgs.where.issuedAt, {
      gte: new Date(query.from), lt: new Date(query.to),
    });
    assert.deepEqual(result.meta, { page: 2, limit: 10, total: 1, totalPages: 1 });
    assert.equal(result.data[0].totalMinor, '9007199254740991');
  });

  it('returns empty list metadata without related reads', async () => {
    const prisma = { $transaction: async (callback: (tx: any) => unknown) => callback({ invoice: {
      findMany: async () => [], count: async () => 0,
    } }) };
    const result = await new PlatformInvoicesService(prisma as never).findAll({ page: 1, limit: 20 });
    assert.deepEqual(result, { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it('maps immutable persisted details and lines with exact decimal strings', async () => {
    const row = {
      ...summary,
      sourcePaymentPurpose: PaymentPurpose.SUBSCRIPTION_ACTIVATION,
      sourceCapturedAt: instant,
      numberPrefix: 'INV', numberResetPolicy: InvoiceNumberResetPolicy.NEVER,
      numberResetBucket: 'NEVER', numberSequence: 1n,
      sellerLegalName: 'Seller', sellerBillingEmail: null, sellerAddressLine1: 'Seller Road',
      sellerAddressLine2: null, sellerCity: 'Pune', sellerState: 'MH', sellerStateCode: '27',
      sellerPostalCode: '411001', sellerCountry: 'IN', billToName: 'Customer',
      billToBillingEmail: null, billToAddressLine1: 'Customer Road', billToAddressLine2: null,
      billToCity: 'Pune', billToState: 'MH', billToPostalCode: '411001', billToCountry: 'IN',
      billToPhone: null,
      lines: [{ id: 'line-id', sourcePlanId: 'plan-id', planCodeSnapshot: 'STARTER',
        planNameSnapshot: 'Starter', lineSequence: 1, description: 'Starter subscription', quantity: 1,
        unitAmountMinor: 9_007_199_254_740_991n, lineSubtotalMinor: 9_007_199_254_740_991n, currency: 'INR' }],
    };
    let select: unknown;
    const prisma = { invoice: { findUnique: async (args: any) => { select = args.select; return row; } } };
    const result = await new PlatformInvoicesService(prisma as never).findOne('invoice-id');
    assert.ok(select);
    assert.equal(result.seller.legalName, 'Seller');
    assert.equal(result.billTo.name, 'Customer');
    assert.equal(result.lines[0].planNameSnapshot, 'Starter');
    assert.equal(result.lines[0].unitAmountMinor, '9007199254740991');
    assert.equal(result.numbering.sequence, '1');
    assert.equal(JSON.stringify(result).match(/secret|signature|token|payload|credential|authorization/gi), null);
  });

  it('returns established not-found semantics', async () => {
    const prisma = { invoice: { findUnique: async () => null } };
    await assert.rejects(
      () => new PlatformInvoicesService(prisma as never).findOne('missing'),
      NotFoundException,
    );
  });
});
