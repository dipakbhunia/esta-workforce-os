import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SmtpRuntimeResolverService } from './smtp-runtime-resolver.service';

const databaseRow = { id: '00000000-0000-4000-8000-000000000001', lifecycle: 'TESTED', revokedAt: null,
  firstActivatedAt: new Date(), host: 'smtp.example.test', port: 587, securityMode: 'STARTTLS', username: 'mailer',
  encryptedPassword: Buffer.from('encrypted'), encryptionKeyId: 'key', senderEmail: 'sender@example.test', senderDisplayName: 'Sender' };

function harness(settings: Record<string, unknown> | null, row: Record<string, unknown> | null = databaseRow, decrypt = () => 'password') {
  const calls: string[] = [];
  const tx = { $queryRaw: async () => { calls.push('lock'); return []; }, platformEmailSettings: { findUnique: async () => { calls.push('settings'); return settings; } },
    smtpConfigurationVersion: { findUnique: async () => { calls.push('configuration'); return row; } } };
  const config = { get: (key: string) => ({ EMAIL_NOTIFICATIONS_ENABLED: true, SMTP_HOST: 'legacy.example.test', SMTP_PORT: 587,
    SMTP_SECURE: false, SMTP_USER: 'legacy', SMTP_PASSWORD: 'legacy-password', SMTP_FROM_EMAIL: 'legacy@example.test', SMTP_FROM_NAME: 'Legacy' } as Record<string, unknown>)[key] };
  return { service: new SmtpRuntimeResolverService(config as never, { decrypt } as never), tx, calls };
}

describe('SmtpRuntimeResolverService', () => {
  it('uses an immutable environment snapshot only before permanent authority', async () => {
    const h = harness(null); const result = await h.service.resolveForClaim(h.tx as never);
    assert.equal(result.state, 'USABLE'); if (result.state === 'USABLE') { assert.equal(result.snapshot.authority, 'ENVIRONMENT'); assert.ok(Object.isFrozen(result.snapshot)); }
    assert.deepEqual(h.calls, ['lock', 'lock', 'settings']);
  });
  it('pauses disabled database authority without environment fallback', async () => {
    const h = harness({ databaseAuthorityEstablishedAt: new Date(), enabled: false, activeConfigurationVersionId: databaseRow.id });
    assert.deepEqual(await h.service.resolveForClaim(h.tx as never), { state: 'PAUSED', authority: 'DATABASE', code: 'DATABASE_SMTP_DISABLED' });
  });
  it('fails closed for invalid or undecryptable database authority', async () => {
    const settings = { databaseAuthorityEstablishedAt: new Date(), enabled: true, activeConfigurationVersionId: databaseRow.id };
    const invalid = harness(settings, { ...databaseRow, revokedAt: new Date() });
    assert.equal((await invalid.service.resolveForClaim(invalid.tx as never)).state, 'UNAVAILABLE');
    const missing = harness(settings, databaseRow, () => { throw new Error('secret detail'); });
    assert.deepEqual(await missing.service.resolveForClaim(missing.tx as never), { state: 'UNAVAILABLE', authority: 'DATABASE', code: 'DATABASE_SMTP_CREDENTIAL_UNAVAILABLE' });
  });
});
