import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, HttpException, ServiceUnavailableException } from '@nestjs/common';
import { RoleName, SmtpConfigurationLifecycle, SmtpSecurityMode, UserStatus } from '@prisma/client';
import { SmtpConfigurationLifecycleService } from './smtp-configuration-lifecycle.service';

const actor = { id: '00000000-0000-4000-8000-000000000001', companyId: null, email: 'admin@example.test',
  firstName: 'Super', lastName: 'Admin', status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
const dto = { host: ' SMTP.EXAMPLE.TEST. ', port: 587, securityMode: SmtpSecurityMode.STARTTLS,
  username: ' mailer ', password: 'strong-password', senderEmail: ' Sender@Example.TEST ', senderDisplayName: ' Sender ' };
const row = (overrides: Record<string, unknown> = {}) => ({ id: '00000000-0000-4000-8000-000000000002', version: 7,
  lifecycle: SmtpConfigurationLifecycle.DRAFT, host: 'smtp.example.test', port: 587, securityMode: SmtpSecurityMode.STARTTLS,
  username: 'mailer', senderEmail: 'sender@example.test', senderDisplayName: 'Sender', revision: 1,
  structurallyValidatedAt: null, connectionTestedAt: null, connectionTestSucceeded: null,
  restrictedTestEmailSentAt: null, firstActivatedAt: null, lastActivatedAt: null, revokedAt: null,
  createdByUserId: actor.id, activatedByUserId: null, revokedByUserId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), ...overrides });

describe('SmtpConfigurationLifecycleService', () => {
  it('creates an encrypted draft and writes only secret-safe audit metadata atomically', async () => {
    let createData: Record<string, unknown> | undefined; let auditData: Record<string, unknown> | undefined;
    const tx = { smtpConfigurationVersion: { create: async ({ data }: { data: Record<string, unknown> }) => { createData = data; return row(); } },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { auditData = data; } } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const encryption = { encrypt: (password: string) => { assert.equal(password, dto.password); return { encryptedPassword: Uint8Array.from([1, 2, 3]), encryptionKeyId: 'key-1' }; } };
    const result = await new SmtpConfigurationLifecycleService(prisma as never, encryption as never).createDraft(dto, actor);
    assert.equal(createData?.host, 'smtp.example.test'); assert.notEqual(createData?.encryptedPassword, dto.password);
    assert.deepEqual(auditData?.metadata, { version: 7, revision: 1, passwordChanged: true });
    assert.equal(JSON.stringify(auditData).includes(dto.password), false);
    assert.equal('encryptedPassword' in result, false); assert.equal(result.passwordConfigured, true);
  });

  it('retains the encrypted password when omitted and invalidates all mutable evidence', async () => {
    let updateData: Record<string, unknown> | undefined;
    const existing = { ...row(), encryptedPassword: Uint8Array.from([9]), encryptionKeyId: 'old-key', connectionTestResultCode: 'SUCCESS', restrictedTestEmailAddress: 'safe@example.test' };
    const tx = { smtpConfigurationVersion: {
      findUnique: async () => existing, updateMany: async ({ data }: { data: Record<string, unknown> }) => { updateData = data; return { count: 1 }; },
      findUniqueOrThrow: async () => row({ host: 'new.example.test', revision: 2 }),
    }, auditLog: { create: async () => undefined } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const encryption = { encrypt: () => { throw new Error('must not encrypt'); } };
    const result = await new SmtpConfigurationLifecycleService(prisma as never, encryption as never)
      .updateDraft(existing.id, { revision: 1, host: 'new.example.test' }, actor);
    assert.equal('encryptedPassword' in (updateData ?? {}), false); assert.equal('encryptionKeyId' in (updateData ?? {}), false);
    for (const field of ['structurallyValidatedAt', 'connectionTestedAt', 'connectionTestSucceeded', 'connectionTestResultCode', 'restrictedTestEmailSentAt', 'restrictedTestEmailAddress']) {
      assert.equal(updateData?.[field], null);
    }
    assert.equal(result.revision, 2);
  });

  it('returns validated or tested material edits to draft while rejecting activated and revoked versions', async () => {
    const editable = { ...row({ lifecycle: SmtpConfigurationLifecycle.TESTED, structurallyValidatedAt: new Date(), connectionTestedAt: new Date(), connectionTestSucceeded: true }),
      encryptedPassword: Uint8Array.from([9]), encryptionKeyId: 'old-key', connectionTestResultCode: 'SUCCESS', restrictedTestEmailAddress: null };
    let updateData: Record<string, unknown> | undefined;
    const tx = { smtpConfigurationVersion: { findUnique: async () => editable,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { updateData = data; return { count: 1 }; },
      findUniqueOrThrow: async () => row({ revision: 2 }) }, auditLog: { create: async () => undefined } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new SmtpConfigurationLifecycleService(prisma as never, { encrypt: () => { throw new Error('not expected'); } } as never);
    await service.updateDraft(editable.id, { revision: 1, senderDisplayName: 'Changed' }, actor);
    assert.equal(updateData?.lifecycle, SmtpConfigurationLifecycle.DRAFT);
    for (const blocked of [
      { ...editable, lifecycle: SmtpConfigurationLifecycle.REVOKED, revokedAt: new Date() },
      { ...editable, firstActivatedAt: new Date(), lastActivatedAt: new Date() },
    ]) {
      tx.smtpConfigurationVersion.findUnique = async () => blocked;
      await assert.rejects(() => service.updateDraft(editable.id, { revision: 1, senderDisplayName: 'Blocked' }, actor), ConflictException);
    }
  });

  it('replaces a password only through encryption and rejects stale revisions', async () => {
    let updateData: Record<string, unknown> | undefined;
    const existing = { ...row(), encryptedPassword: Uint8Array.from([9]), encryptionKeyId: 'old-key', connectionTestResultCode: null, restrictedTestEmailAddress: null };
    const tx = { smtpConfigurationVersion: { findUnique: async () => existing,
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { updateData = data; return { count: 0 }; },
      findUniqueOrThrow: async () => row() }, auditLog: { create: async () => undefined } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const encryption = { encrypt: () => ({ encryptedPassword: Uint8Array.from([4]), encryptionKeyId: 'new-key' }) };
    const service = new SmtpConfigurationLifecycleService(prisma as never, encryption as never);
    await assert.rejects(() => service.updateDraft(existing.id, { revision: 99, password: 'replacement-password' }, actor), ConflictException);
    assert.deepEqual(updateData?.encryptedPassword, Uint8Array.from([4])); assert.equal(updateData?.encryptionKeyId, 'new-key');
  });

  it('moves only an exact draft revision to structurally validated without network evidence', async () => {
    let data: Record<string, unknown> | undefined;
    const existing = { ...row(), encryptedPassword: Uint8Array.from([9]), encryptionKeyId: 'key', connectionTestResultCode: null, restrictedTestEmailAddress: null };
    const tx = { smtpConfigurationVersion: { findUnique: async () => existing,
      updateMany: async (args: { data: Record<string, unknown> }) => { data = args.data; return { count: 1 }; },
      findUniqueOrThrow: async () => row({ lifecycle: SmtpConfigurationLifecycle.VALIDATED, revision: 2, structurallyValidatedAt: new Date() }) },
      auditLog: { create: async () => undefined } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const result = await new SmtpConfigurationLifecycleService(prisma as never, {} as never).validateDraft(existing.id, { revision: 1 }, actor);
    assert.equal(data?.lifecycle, SmtpConfigurationLifecycle.VALIDATED); assert.equal('connectionTestedAt' in (data ?? {}), false);
    assert.equal(result.lifecycle, SmtpConfigurationLifecycle.VALIDATED);
  });

  it('propagates encryption failure before persistence begins', async () => {
    let transactionStarted = false;
    const prisma = { $transaction: async () => { transactionStarted = true; } };
    const encryption = { encrypt: () => { throw new ServiceUnavailableException('SMTP credential encryption is unavailable'); } };
    await assert.rejects(() => new SmtpConfigurationLifecycleService(prisma as never, encryption as never).createDraft(dto, actor), ServiceUnavailableException);
    assert.equal(transactionStarted, false);
  });

  it('tests outside transactions and persists only safe success evidence for the unchanged revision', async () => {
    let transactions = 0; let networkDuringTransaction = false; let updateData: Record<string, unknown> | undefined;
    const validated = { ...row({ lifecycle: SmtpConfigurationLifecycle.VALIDATED, structurallyValidatedAt: new Date() }),
      encryptedPassword: Uint8Array.from([1]), encryptionKeyId: 'key-1', connectionTestResultCode: null, restrictedTestEmailAddress: null };
    const tx = { $queryRaw: async () => [{ acquired: false }], auditLog: { deleteMany: async () => ({ count: 0 }), count: async () => 0, create: async () => undefined },
      smtpConfigurationVersion: { findUnique: async () => validated,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => { updateData = data; return { count: 1 }; } } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => { transactions += 1; const result = await callback(tx); transactions -= 1; return result; } };
    const encryption = { decrypt: () => 'plain-secret' };
    const connection = { verify: async (_snapshot: unknown, password: string) => { networkDuringTransaction = transactions > 0; assert.equal(password, 'plain-secret'); return { success: true, category: 'SUCCESS' }; } };
    const result = await new SmtpConfigurationLifecycleService(prisma as never, encryption as never, connection as never)
      .testConnection(validated.id, { revision: 1 }, actor);
    assert.equal(networkDuringTransaction, false); assert.equal(result.lifecycle, SmtpConfigurationLifecycle.TESTED);
    assert.equal(updateData?.connectionTestResultCode, 'SUCCESS'); assert.equal(updateData?.connectionTestSucceeded, true);
    assert.equal(JSON.stringify(updateData).includes('plain-secret'), false);
  });

  it('retains VALIDATED with safe failure evidence and rejects stale network results', async () => {
    const validated = { ...row({ lifecycle: SmtpConfigurationLifecycle.VALIDATED, structurallyValidatedAt: new Date() }),
      encryptedPassword: Uint8Array.from([1]), encryptionKeyId: 'key-1', connectionTestResultCode: null, restrictedTestEmailAddress: null };
    let finalCount = 1; const audits: Array<Record<string, unknown>> = [];
    const tx = { $queryRaw: async () => [], auditLog: { deleteMany: async () => ({ count: 0 }), count: async () => 0, create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); } },
      smtpConfigurationVersion: { findUnique: async () => validated, updateMany: async () => ({ count: finalCount }) } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new SmtpConfigurationLifecycleService(prisma as never, { decrypt: () => 'password' } as never,
      { verify: async () => ({ success: false, category: 'AUTH_FAILED' }) } as never);
    const failed = await service.testConnection(validated.id, { revision: 1 }, actor);
    assert.equal(failed.lifecycle, SmtpConfigurationLifecycle.VALIDATED); assert.equal(failed.category, 'AUTH_FAILED');
    finalCount = 0;
    await assert.rejects(() => service.testConnection(validated.id, { revision: 1 }, actor), ConflictException);
    assert.ok(audits.some((entry) => entry.action === 'SMTP_CONNECTION_TEST_DISCARDED'));
    assert.equal(JSON.stringify(audits).includes('password'), false);
  });

  it('enforces the durable rate limit before decryption or network access', async () => {
    let decrypted = false;
    const tx = { $queryRaw: async () => [], auditLog: { deleteMany: async () => ({ count: 0 }), count: async () => 5, create: async () => undefined }, smtpConfigurationVersion: { findUnique: async () => null } };
    const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
    const service = new SmtpConfigurationLifecycleService(prisma as never, { decrypt: () => { decrypted = true; } } as never, {} as never);
    await assert.rejects(() => service.testConnection(row().id, { revision: 1 }, actor), (error: unknown) => error instanceof HttpException && error.getStatus() === 429);
    assert.equal(decrypted, false);
  });
});
