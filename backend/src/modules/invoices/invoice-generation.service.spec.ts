import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InvoiceGenerationService } from './invoice-generation.service';
import { InvoiceIssuanceError } from './invoice-issuance.service';

describe('InvoiceGenerationService', () => {
  it('uses the existing issuance authority without a human actor', async () => {
    const calls: unknown[][] = [];
    const service = new InvoiceGenerationService({
      issue: async (...args: unknown[]) => { calls.push(args); return { id: 'invoice' }; },
    } as never);

    assert.deepEqual(await service.generate('payment-1'), { outcome: 'ISSUED' });
    assert.deepEqual(calls, [['payment-1']]);
  });

  it('isolates failures and logs only a safe classification with the Payment id', async () => {
    const messages: string[] = [];
    const service = new InvoiceGenerationService({
      issue: async () => { throw new InvoiceIssuanceError('BILLING_PROFILE_INCOMPLETE', 'sensitive internal detail'); },
    } as never);
    (service as unknown as { logger: { error(message: string): void } }).logger = {
      error: (message) => messages.push(message),
    };

    assert.deepEqual(await service.generate('payment-2'), {
      outcome: 'FAILED', category: 'BILLING_PROFILE_INCOMPLETE',
    });
    assert.deepEqual(messages, [
      'Automatic invoice generation failed for Payment payment-2: BILLING_PROFILE_INCOMPLETE',
    ]);
    assert.doesNotMatch(messages[0], /sensitive internal detail/);
  });

  it('sanitizes unexpected failures', async () => {
    const messages: string[] = [];
    const service = new InvoiceGenerationService({
      issue: async () => { throw new Error('provider secret payload'); },
    } as never);
    (service as unknown as { logger: { error(message: string): void } }).logger = {
      error: (message) => messages.push(message),
    };

    assert.deepEqual(await service.generate('payment-3'), {
      outcome: 'FAILED', category: 'INTERNAL_ERROR',
    });
    assert.doesNotMatch(messages[0], /provider|secret|payload/i);
  });
});
