import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvoiceGenerationRecoveryService } from './invoice-generation-recovery.service';

function harness(rows: Array<{ id: string }> = []) {
  const queries: any[] = [];
  const attempted: string[] = [];
  const prisma = { $queryRaw: async (query: unknown) => { queries.push(query); return rows; } };
  const generation = { generate: async (id: string) => {
    attempted.push(id);
    if (id === 'failed') return { outcome: 'FAILED', category: 'SAFE_CATEGORY' } as const;
    if (id === 'thrown') throw new Error('raw provider secret');
    return { outcome: 'ISSUED' } as const;
  } };
  return { service: new InvoiceGenerationRecoveryService(prisma as never, generation as never), queries, attempted };
}

function sql(query: { strings: string[]; values: unknown[] }) {
  return { text: query.strings.join('?').replace(/\s+/g, ' ').trim(), values: query.values };
}

describe('InvoiceGenerationRecoveryService', () => {
  it('uses exact durable authority predicates, an explicit id projection, and deterministic ordering', async () => {
    const h = harness([{ id: 'valid' }]);
    assert.deepEqual(await h.service.recoverDue(), { scanned: 1, succeeded: 1, failed: 0 });
    const query = sql(h.queries[0]);
    assert.match(query.text, /^SELECT payment\."id" FROM "Payment" payment/);
    for (const predicate of [
      `payment."purpose" = 'SUBSCRIPTION_ACTIVATION'`, `payment."status" = 'CAPTURED'`,
      `payment."capturedAt" IS NOT NULL`, `payment."capturedProviderPaymentId" IS NOT NULL`,
      `BTRIM(payment."capturedProviderPaymentId") <> ''`,
      `subscription."id" = payment."subscriptionId"`, `subscription."companyId" = payment."companyId"`,
      `subscription."activatedByPaymentId" = payment."id"`,
      `subscription."activationSource" = 'PAYMENT'`, `subscription."status" IN ('ACTIVE', 'SUSPENDED')`,
      `subscription."currentPeriodStart" IS NOT NULL`, `subscription."currentPeriodEnd" IS NOT NULL`,
      `subscription."currentPeriodStart" < subscription."currentPeriodEnd"`,
      `NOT EXISTS ( SELECT 1 FROM "Invoice" invoice WHERE invoice."sourcePaymentId" = payment."id" )`,
      `ORDER BY payment."createdAt" ASC, payment."id" ASC`,
    ]) assert.ok(query.text.includes(predicate), predicate);
    assert.doesNotMatch(query.text, /OFFSET|encryptedPayload|webhook|signature|credential|metadata/i);
    assert.deepEqual(query.values, [25]);
  });

  it('clamps the single bounded batch to 1 and 100 without offset traversal', async () => {
    for (const [limit, expected] of [
      [0, 1], [-10, 1], [1, 1], [25, 25], [100, 100], [101, 100], [1000, 100],
      [Number.NaN, 25], [Number.POSITIVE_INFINITY, 25], [1.5, 25],
    ] as const) {
      const h = harness();
      await h.service.recoverDue(limit);
      assert.deepEqual(sql(h.queries[0]).values, [expected]);
      assert.equal(h.queries.length, 1);
    }
  });

  it('isolates failures, continues later candidates, and attempts each Payment once per run', async () => {
    const h = harness([{ id: 'first' }, { id: 'failed' }, { id: 'failed' }, { id: 'thrown' }, { id: 'last' }]);
    assert.deepEqual(await h.service.recoverDue(), { scanned: 4, succeeded: 2, failed: 2 });
    assert.deepEqual(h.attempted, ['first', 'failed', 'thrown', 'last']);
  });

  it('propagates an infrastructure query failure without exposing a partial summary', async () => {
    const service = new InvoiceGenerationRecoveryService({
      $queryRaw: async () => { throw new Error('database unavailable'); },
    } as never, { generate: async () => ({ outcome: 'ISSUED' }) } as never);
    await assert.rejects(() => service.recoverDue(), /database unavailable/);
  });
});
