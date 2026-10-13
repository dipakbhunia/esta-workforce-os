import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, ForbiddenException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { RoleName, SmtpConfigurationLifecycle, SmtpSecurityMode, UserStatus } from '@prisma/client';
import { SmtpTestEmailService } from './smtp-test-email.service';

const actorId = '00000000-0000-4000-8000-000000000001';
const configurationId = '00000000-0000-4000-8000-000000000002';
const authenticated = { id: actorId, companyId: null, email: 'admin@example.test', firstName: 'A', lastName: 'B',
  status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
const actor = (overrides: Record<string, unknown> = {}) => ({ id: actorId, email: 'admin@example.test', emailRevision: 3,
  verifiedEmail: 'admin@example.test', emailVerifiedAt: new Date(), companyId: null, status: UserStatus.ACTIVE, deletedAt: null,
  roles: [{ role: { companyId: null, systemName: RoleName.SUPER_ADMIN, deletedAt: null } }], ...overrides });
const configuration = (overrides: Record<string, unknown> = {}) => ({ id: configurationId, version: 7, revision: 4,
  lifecycle: SmtpConfigurationLifecycle.TESTED, host: 'smtp.example.test', port: 587, securityMode: SmtpSecurityMode.STARTTLS,
  username: 'mailer', encryptedPassword: Uint8Array.from([1]), encryptionKeyId: 'key', senderEmail: 'sender@example.test',
  senderDisplayName: 'Sender', structurallyValidatedAt: new Date(), connectionTestedAt: new Date(),
  connectionTestSucceeded: true, connectionTestResultCode: 'SUCCESS', revokedAt: null, ...overrides });

function harness(options: { actorRows?: Array<ReturnType<typeof actor> | null>; configRows?: Array<ReturnType<typeof configuration> | null>;
  attempts?: number; accepted?: boolean; auditFails?: boolean } = {}) {
  const actorRows = options.actorRows ?? [actor(), actor(), actor()];
  const configRows = options.configRows ?? [configuration(), configuration(), configuration()];
  const audits: Array<Record<string, unknown>> = []; let actorIndex = 0; let configIndex = 0;
  let inTransaction = 0; let networkDuringTransaction = false; let sent: Record<string, unknown> | undefined;
  const tx = {
    $queryRaw: async () => [],
    auditLog: {
      deleteMany: async () => ({ count: 0 }), count: async () => options.attempts ?? 0,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.auditFails) throw new Error('PERSISTENCE_UNAVAILABLE'); audits.push(data); return data;
      },
    },
    user: { findUnique: async () => actorRows[Math.min(actorIndex++, actorRows.length - 1)] },
    smtpConfigurationVersion: {
      findUnique: async () => configRows[Math.min(configIndex++, configRows.length - 1)],
      updateMany: async () => ({ count: 1 }),
    },
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => {
    inTransaction += 1; try { return await callback(tx); } finally { inTransaction -= 1; }
  } };
  const adapter = { sendTestEmail: async (_snapshot: unknown, password: string, message: Record<string, unknown>) => {
    networkDuringTransaction = inTransaction > 0; assert.equal(password, 'decrypted-secret'); sent = message;
    return options.accepted === false ? { accepted: false, category: 'AUTH_FAILED' } : { accepted: true, category: 'ACCEPTED' };
  } };
  const service = new SmtpTestEmailService(prisma as never, { decrypt: () => 'decrypted-secret' } as never, adapter as never);
  return { service, audits, sent: () => sent, networkDuringTransaction: () => networkDuringTransaction };
}

describe('SmtpTestEmailService', () => {
  it('binds a fixed message to the authoritative current verified platform administrator and sends outside transactions', async () => {
    const value = harness();
    const result = await value.service.send(configurationId, { revision: 4 }, authenticated);
    assert.equal(result.acceptedByProvider, true); assert.equal(result.inboxDeliveryConfirmed, false);
    assert.equal(value.networkDuringTransaction(), false);
    assert.deepEqual(value.sent(), {
      recipient: 'admin@example.test', senderEmail: 'sender@example.test', senderDisplayName: 'Sender',
      subject: 'Esta Workforce OS SMTP configuration test',
      text: 'This is a restricted SMTP configuration test from Esta Workforce OS.\n\nThe SMTP provider accepted a test message for the currently verified email address of the acting platform administrator.\nAcceptance by the SMTP provider does not confirm inbox delivery.',
    });
    assert.equal(JSON.stringify(value.audits).includes('decrypted-secret'), false);
  });

  it('rejects unverified, inactive, deleted, tenant-scoped, and non-SUPER_ADMIN actors', async () => {
    for (const changed of [
      { verifiedEmail: null, emailVerifiedAt: null }, { verifiedEmail: 'old@example.test' },
      { status: UserStatus.INACTIVE }, { deletedAt: new Date() }, { companyId: configurationId },
      { roles: [{ role: { companyId: null, systemName: RoleName.COMPANY_ADMIN, deletedAt: null } }] },
      { roles: [{ role: { companyId: configurationId, systemName: RoleName.SUPER_ADMIN, deletedAt: null } }] },
    ]) {
      const value = harness({ actorRows: [actor(changed)] });
      await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated), ForbiddenException);
      assert.equal(value.sent(), undefined);
    }
  });

  it('fences email changes, role removal, and deactivation at the final pre-send authority boundary', async () => {
    for (const changed of [actor({ email: 'changed@example.test', emailRevision: 4, verifiedEmail: null, emailVerifiedAt: null }),
      actor({ roles: [] }), actor({ status: UserStatus.INACTIVE })]) {
      const value = harness({ actorRows: [actor(), changed] });
      await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated));
      assert.equal(value.sent(), undefined);
    }
  });

  it('fences an SMTP material edit at the final pre-send authority boundary', async () => {
    const value = harness({ configRows: [configuration(), configuration({ revision: 5, lifecycle: SmtpConfigurationLifecycle.DRAFT })] });
    await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated), ConflictException);
    assert.equal(value.sent(), undefined);
  });

  it('rejects stale, untested, revoked, and invalid test-evidence configurations', async () => {
    for (const changed of [configuration({ revision: 5 }), configuration({ lifecycle: SmtpConfigurationLifecycle.VALIDATED }),
      configuration({ lifecycle: SmtpConfigurationLifecycle.REVOKED, revokedAt: new Date() }),
      configuration({ connectionTestSucceeded: false }), configuration({ connectionTestResultCode: 'AUTH_FAILED' })]) {
      const value = harness({ configRows: [changed] });
      await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated), ConflictException);
      assert.equal(value.sent(), undefined);
    }
  });

  it('counts durable attempts before I/O and enforces the separate three-attempt limit', async () => {
    const value = harness({ attempts: 3 });
    await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 429);
    assert.equal(value.sent(), undefined); assert.equal(value.audits.length, 0);
  });

  it('returns bounded provider failure without claiming inbox delivery or exposing secrets', async () => {
    const value = harness({ accepted: false });
    await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated), ServiceUnavailableException);
    assert.equal(JSON.stringify(value.audits).includes('decrypted-secret'), false);
    assert.ok(value.audits.some((entry) => entry.action === 'SMTP_TEST_EMAIL_ATTEMPT_COMPLETED'));
  });

  it('fails closed before SMTP when durable attempt persistence fails', async () => {
    const value = harness({ auditFails: true });
    await assert.rejects(() => value.service.send(configurationId, { revision: 4 }, authenticated), /PERSISTENCE_UNAVAILABLE/);
    assert.equal(value.sent(), undefined);
  });
});
