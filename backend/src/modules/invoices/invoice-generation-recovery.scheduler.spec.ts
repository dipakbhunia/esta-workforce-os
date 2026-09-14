import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvoiceGenerationRecoveryScheduler } from './invoice-generation-recovery.scheduler';

describe('InvoiceGenerationRecoveryScheduler', () => {
  it('prevents same-process overlap and releases its guard after completion', async () => {
    let calls = 0;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const scheduler = new InvoiceGenerationRecoveryScheduler({ recoverDue: async () => {
      calls += 1;
      if (calls === 1) await pending;
      return { scanned: 0, succeeded: 0, failed: 0 };
    } } as never);
    const first = scheduler.recoverMissingInvoices();
    await scheduler.recoverMissingInvoices();
    assert.equal(calls, 1);
    release();
    await first;
    await scheduler.recoverMissingInvoices();
    assert.equal(calls, 2);
  });

  it('sanitizes infrastructure failure logging and releases its guard', async () => {
    let calls = 0;
    const messages: string[] = [];
    const scheduler = new InvoiceGenerationRecoveryScheduler({ recoverDue: async () => {
      calls += 1;
      if (calls === 1) throw new Error('database password secret');
      return { scanned: 0, succeeded: 0, failed: 0 };
    } } as never);
    (scheduler as unknown as { logger: { warn(message: string): void } }).logger = {
      warn: (message) => messages.push(message),
    };
    await scheduler.recoverMissingInvoices();
    await scheduler.recoverMissingInvoices();
    assert.equal(calls, 2);
    assert.deepEqual(messages, ['Invoice generation recovery pass failed.']);
  });
});
