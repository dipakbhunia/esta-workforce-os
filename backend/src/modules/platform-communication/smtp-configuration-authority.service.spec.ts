import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { SmtpConfigurationAuthorityService } from './smtp-configuration-authority.service';

describe('SmtpConfigurationAuthorityService deployment gate', () => {
  it('fails closed before persistence for every management operation by default', async () => {
    let transactionStarted = false;
    const service = new SmtpConfigurationAuthorityService({ $transaction: async () => { transactionStarted = true; } } as never,
      {} as never, { get: () => false } as never);
    const actor = { id: '00000000-0000-4000-8000-000000000001' } as never;
    for (const operation of [
      () => service.activate('00000000-0000-4000-8000-000000000002', { settingsRevision: 0, targetRevision: 1 }, actor),
      () => service.rollback('00000000-0000-4000-8000-000000000002', { settingsRevision: 1, targetRevision: 1 }, actor),
      () => service.disable({ settingsRevision: 1 }, actor), () => service.enable({ settingsRevision: 1 }, actor),
    ]) await assert.rejects(operation, ServiceUnavailableException);
    assert.equal(transactionStarted, false);
  });
});
