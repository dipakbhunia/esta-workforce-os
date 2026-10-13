import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';
import { AccountActionTokenPurpose, PrismaClient } from '@prisma/client';

const enabled = process.env.RUN_POSTGRES_INTEGRATION_TESTS === '1';
const prisma = enabled ? new PrismaClient() : null;

after(async () => prisma?.$disconnect());

async function createUser(email: string) {
  assert.ok(prisma);
  return prisma.user.create({ data: { email, passwordHash: 'integration-only', firstName: 'Email', lastName: 'Verification' } });
}

describe('current-email verification PostgreSQL foundation', { skip: !enabled }, () => {
  it('leaves existing and newly created users unverified by default', async () => {
    assert.ok(prisma);
    const user = await createUser(`ev-d2-default-${randomUUID()}@example.test`);
    try {
      assert.equal(user.emailRevision, 0);
      assert.equal(user.verifiedEmail, null);
      assert.equal(user.emailVerifiedAt, null);
    } finally { await prisma.user.delete({ where: { id: user.id } }); }
  });

  it('enforces paired evidence and exact normalized current-email matching', async () => {
    assert.ok(prisma);
    const user = await createUser(`ev-d2-evidence-${randomUUID()}@example.test`);
    try {
      await assert.rejects(() => prisma.user.update({ where: { id: user.id }, data: { verifiedEmail: user.email } }));
      await assert.rejects(() => prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }));
      await assert.rejects(() => prisma.user.update({ where: { id: user.id }, data: {
        verifiedEmail: `wrong-${user.email}`, emailVerifiedAt: new Date(),
      } }));
      await assert.rejects(() => prisma.user.update({ where: { id: user.id }, data: {
        verifiedEmail: user.email.toUpperCase(), emailVerifiedAt: new Date(),
      } }));
      const verified = await prisma.user.update({ where: { id: user.id }, data: {
        verifiedEmail: user.email, emailVerifiedAt: new Date(),
      } });
      assert.equal(verified.verifiedEmail, user.email);
    } finally { await prisma.user.delete({ where: { id: user.id } }); }
  });

  it('invalidates only normalized address changes and prevents change-away/change-back revival', async () => {
    assert.ok(prisma);
    const original = `ev-d2-change-${randomUUID()}@example.test`;
    const user = await createUser(original);
    try {
      await prisma.user.update({ where: { id: user.id }, data: { verifiedEmail: original, emailVerifiedAt: new Date() } });
      const equivalent = await prisma.user.update({ where: { id: user.id }, data: { email: original.toUpperCase() } });
      assert.equal(equivalent.emailRevision, 0);
      assert.equal(equivalent.verifiedEmail, original);
      const away = await prisma.user.update({ where: { id: user.id }, data: { email: `away-${original}` } });
      assert.equal(away.emailRevision, 1); assert.equal(away.verifiedEmail, null); assert.equal(away.emailVerifiedAt, null);
      const back = await prisma.user.update({ where: { id: user.id }, data: { email: original } });
      assert.equal(back.emailRevision, 2); assert.equal(back.verifiedEmail, null); assert.equal(back.emailVerifiedAt, null);
    } finally { await prisma.user.delete({ where: { id: user.id } }); }
  });

  it('serializes concurrent email changes through row-level trigger execution', async () => {
    assert.ok(prisma);
    const original = `ev-d2-race-${randomUUID()}@example.test`;
    const user = await createUser(original);
    const first = new PrismaClient(); const second = new PrismaClient();
    try {
      await prisma.user.update({ where: { id: user.id }, data: { verifiedEmail: original, emailVerifiedAt: new Date() } });
      await Promise.all([
        first.user.update({ where: { id: user.id }, data: { email: `first-${original}` } }),
        second.user.update({ where: { id: user.id }, data: { email: `second-${original}` } }),
      ]);
      const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      assert.equal(current.emailRevision, 2);
      assert.equal(current.verifiedEmail, null);
      assert.equal(current.emailVerifiedAt, null);
    } finally {
      await first.$disconnect(); await second.$disconnect();
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('requires email-bound fields only for EMAIL_VERIFICATION tokens', async () => {
    assert.ok(prisma);
    const user = await createUser(`ev-d2-token-${randomUUID()}@example.test`);
    const base = { userId: user.id, companyId: null, tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
      expiresAt: new Date(Date.now() + 60_000) };
    const ids: string[] = [];
    try {
      for (const purpose of [AccountActionTokenPurpose.INVITATION, AccountActionTokenPurpose.PASSWORD_RESET]) {
        const token = await prisma.accountActionToken.create({ data: { ...base, tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'), purpose } });
        ids.push(token.id); assert.equal(token.targetEmail, null); assert.equal(token.emailRevision, null);
      }
      await assert.rejects(() => prisma.accountActionToken.create({ data: {
        ...base, purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
      } }));
      await assert.rejects(() => prisma.accountActionToken.create({ data: {
        ...base, tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'), purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
        targetEmail: user.email.toUpperCase(), emailRevision: 0,
      } }));
      const emailToken = await prisma.accountActionToken.create({ data: {
        ...base, tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'), purpose: AccountActionTokenPurpose.EMAIL_VERIFICATION,
        targetEmail: user.email, emailRevision: 0,
      } });
      ids.push(emailToken.id);
      await assert.rejects(() => prisma.accountActionToken.create({ data: {
        ...base, tokenHash: randomUUID().replaceAll('-', '').padEnd(64, '0'), purpose: AccountActionTokenPurpose.INVITATION,
        targetEmail: user.email, emailRevision: 0,
      } }));
    } finally {
      await prisma.accountActionToken.deleteMany({ where: { id: { in: ids } } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
