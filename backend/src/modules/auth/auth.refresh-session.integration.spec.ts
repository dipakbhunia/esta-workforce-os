import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { JwtService } from '@nestjs/jwt';
import {
  CompanyStatus,
  PrismaClient,
  RoleName,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { revokeAllUserSessions } from './refresh-session-revocation';

const enabled = process.env.RUN_AUTH_REFRESH_SESSION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const secret = 'db-d5d-2b-2-refresh-session-secret-at-least-32-characters';
const prisma = new PrismaClient();
const jwt = new JwtService();
const config = {
  getOrThrow: (key: string) => ({
    JWT_ACCESS_SECRET: `${secret}-access`,
    JWT_REFRESH_SECRET: `${secret}-refresh`,
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  })[key],
};
const auth = new AuthService(prisma as never, jwt, config as never);

describeDb('DB-D5D.2B.2 PostgreSQL refresh-session lifecycle', () => {
  const suffix = randomUUID();
  const password = 'integration-password';
  const userIds: string[] = [];
  const companyIds: string[] = [];
  let firstUser: Awaited<ReturnType<typeof createTenantUser>>;
  let secondUser: Awaited<ReturnType<typeof createTenantUser>>;

  before(async () => {
    await prisma.$connect();
    firstUser = await createTenantUser('first');
    secondUser = await createTenantUser('second');
  });

  after(async () => {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.$disconnect();
  });

  it('creates independent sessions and issues stable sid with unique token jti', async () => {
    const first = await login(firstUser.email);
    const second = await login(firstUser.email);
    const firstPayload = decode(first.refreshToken);
    const secondPayload = decode(second.refreshToken);

    assert.ok(firstPayload.sid);
    assert.ok(secondPayload.sid);
    assert.notEqual(firstPayload.sid, secondPayload.sid);
    assert.notEqual(firstPayload.jti, secondPayload.jti);
    assert.equal(await prisma.refreshSession.count({
      where: { userId: firstUser.id, revokedAt: null },
    }), 2);
    assert.equal(await prisma.refreshToken.count({
      where: { userId: firstUser.id, sessionId: firstPayload.sid, revokedAt: null },
    }), 1);

    await auth.logout(first.refreshToken, {});
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: firstPayload.sid, revokedAt: null },
    }), 0);
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: secondPayload.sid, revokedAt: null },
    }), 1, 'logout must preserve another device session');
    await auth.refresh(second.refreshToken, {});
  });

  it('rotates once, detects ancestor replay, and revokes the session family', async () => {
    const first = await login(firstUser.email);
    const r1 = decode(first.refreshToken);
    const rotated = await auth.refresh(first.refreshToken, {});
    const r2 = decode(rotated.refreshToken);
    assert.equal(r2.sid, r1.sid);
    assert.notEqual(r2.jti, r1.jti);
    assert.ok((await prisma.refreshToken.findUniqueOrThrow({ where: { id: r1.jti } })).revokedAt);
    assert.equal((await prisma.refreshToken.findUniqueOrThrow({ where: { id: r2.jti } })).revokedAt, null);

    await assert.rejects(() => auth.refresh(first.refreshToken, {}), /invalid or revoked/i);
    assert.ok((await prisma.refreshSession.findUniqueOrThrow({ where: { id: r1.sid! } })).revokedAt);
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: r1.sid, revokedAt: null },
    }), 0);
    await assert.rejects(() => auth.refresh(rotated.refreshToken, {}), /invalid or revoked/i);
    assert.equal(await prisma.auditLog.count({
      where: { actorUserId: firstUser.id, action: 'AUTH_REFRESH_REPLAY' },
    }) > 0, true);
  });

  it('allows rotated-token logout, is idempotent, and revokes no other device', async () => {
    const target = await login(firstUser.email);
    const other = await login(firstUser.email);
    const targetPayload = decode(target.refreshToken);
    const otherPayload = decode(other.refreshToken);
    const rotated = await auth.refresh(target.refreshToken, {});

    const concurrentLogouts = await Promise.all([
      auth.logout(target.refreshToken, {}),
      auth.logout(target.refreshToken, {}),
    ]);
    assert.deepEqual(concurrentLogouts, [{ success: true }, { success: true }]);
    await assert.rejects(() => auth.refresh(rotated.refreshToken, {}), /invalid or revoked/i);
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: targetPayload.sid, revokedAt: null },
    }), 0);
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: otherPayload.sid, revokedAt: null },
    }), 1);

    assert.deepEqual(await auth.logout(other.refreshToken, {}), { success: true });
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: otherPayload.sid, revokedAt: null },
    }), 0);

    const currentTokenLogout = await login(firstUser.email);
    const currentRotated = await auth.refresh(currentTokenLogout.refreshToken, {});
    const currentSid = decode(currentRotated.refreshToken).sid!;
    assert.deepEqual(await auth.logout(currentRotated.refreshToken, {}), { success: true });
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: currentSid, revokedAt: null },
    }), 0, 'logout with R2 must revoke the current session family');
  });

  it('serializes two concurrent refresh requests and revokes the replayed family', async () => {
    const concurrent = await login(firstUser.email);
    const concurrentSid = decode(concurrent.refreshToken).sid!;
    const refreshResults = await Promise.allSettled([
      auth.refresh(concurrent.refreshToken, {}),
      auth.refresh(concurrent.refreshToken, {}),
    ]);
    assert.equal(refreshResults.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(refreshResults.filter(({ status }) => status === 'rejected').length, 1);
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: concurrentSid, revokedAt: null },
    }), 0, 'replay detection must revoke the replacement created by the winning refresh');

  });

  it('proves logout winning the session lock prevents a concurrent refresh', async () => {
    const race = await login(firstUser.email);
    const sid = decode(race.refreshToken).sid!;
    const paused = createSessionLockPause();
    const logoutPromise = paused.service.logout(race.refreshToken, {});
    await paused.locked;
    const refreshPromise = auth.refresh(race.refreshToken, {});
    paused.release();
    assert.deepEqual(await logoutPromise, { success: true });
    await assert.rejects(() => refreshPromise, /invalid or revoked/i);
    assert.equal(await prisma.refreshToken.count({ where: { sessionId: sid, revokedAt: null } }), 0);
  });

  it('proves refresh winning the session lock is followed by family revocation from R1 logout', async () => {
    const race = await login(firstUser.email);
    const sid = decode(race.refreshToken).sid!;
    const paused = createSessionLockPause();
    const refreshPromise = paused.service.refresh(race.refreshToken, {});
    await paused.locked;
    const logoutPromise = auth.logout(race.refreshToken, {});
    paused.release();
    const rotated = await refreshPromise;
    assert.deepEqual(await logoutPromise, { success: true });
    await assert.rejects(() => auth.refresh(rotated.refreshToken, {}), /invalid or revoked/i);
    assert.equal(await prisma.refreshToken.count({ where: { sessionId: sid, revokedAt: null } }), 0);
  });

  it('associates a legacy token exactly once and rejects cross-user or sid mismatch', async () => {
    const legacyId = randomUUID();
    const legacyToken = await jwt.signAsync({
      sub: firstUser.id,
      companyId: firstUser.companyId,
      roles: [RoleName.COMPANY_ADMIN],
      type: 'refresh',
      jti: legacyId,
    } satisfies JwtPayload, {
      secret: config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
    const legacyPayload = decode(legacyToken);
    await prisma.refreshToken.create({
      data: {
        id: legacyId,
        userId: firstUser.id,
        tokenHash: hash(legacyToken),
        expiresAt: new Date(legacyPayload.exp! * 1000),
      },
    });
    const outcomes = await Promise.allSettled([
      auth.refresh(legacyToken, {}),
      auth.refresh(legacyToken, {}),
    ]);
    assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(await prisma.refreshSession.count({ where: { id: legacyId } }), 1);
    assert.equal((await prisma.refreshToken.findUniqueOrThrow({ where: { id: legacyId } })).sessionId, legacyId);
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: legacyId, revokedAt: null },
    }), 0, 'concurrent legacy replay must revoke the associated family');

    const valid = await login(firstUser.email);
    const validPayload = decode(valid.refreshToken);
    const wrongUserToken = await jwt.signAsync({
      ...validPayload,
      sub: secondUser.id,
      companyId: secondUser.companyId,
    }, { secret: config.getOrThrow('JWT_REFRESH_SECRET') });
    await assert.rejects(() => auth.refresh(wrongUserToken, {}), /invalid or revoked/i);
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: validPayload.sid, revokedAt: null },
    }), 1);

    const wrongSidToken = await jwt.signAsync({
      ...validPayload,
      sid: randomUUID(),
    }, { secret: config.getOrThrow('JWT_REFRESH_SECRET') });
    await prisma.refreshToken.update({
      where: { id: validPayload.jti },
      data: { tokenHash: hash(wrongSidToken) },
    });
    await assert.rejects(() => auth.refresh(wrongSidToken, {}), /invalid or revoked/i);
    assert.equal(await prisma.refreshToken.count({
      where: { sessionId: validPayload.sid, revokedAt: null },
    }), 1, 'sid mismatch must not consume or revoke the authoritative session');
  });

  it('rejects revoked, expired, and newly unauthorized sessions without consuming active tokens', async () => {
    const revoked = await login(firstUser.email);
    const revokedPayload = decode(revoked.refreshToken);
    await prisma.refreshSession.update({
      where: { id: revokedPayload.sid! },
      data: { revokedAt: new Date() },
    });
    await assert.rejects(() => auth.refresh(revoked.refreshToken, {}), /invalid or revoked/i);

    const expired = await login(firstUser.email);
    const expiredPayload = decode(expired.refreshToken);
    await prisma.refreshSession.update({
      where: { id: expiredPayload.sid! },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await assert.rejects(() => auth.refresh(expired.refreshToken, {}), /invalid or revoked/i);

    const unauthorized = await login(firstUser.email);
    const unauthorizedPayload = decode(unauthorized.refreshToken);
    await prisma.company.update({
      where: { id: firstUser.companyId! },
      data: { status: CompanyStatus.SUSPENDED },
    });
    await assert.rejects(() => auth.refresh(unauthorized.refreshToken, {}), /Company account is not active/);
    assert.equal((await prisma.refreshToken.findUniqueOrThrow({
      where: { id: unauthorizedPayload.jti },
    })).revokedAt, null, 'authority rejection must roll back token consumption');
    await prisma.company.update({
      where: { id: firstUser.companyId! },
      data: { status: CompanyStatus.ACTIVE },
    });

    const roleChange = await login(secondUser.email);
    await prisma.userRole.delete({
      where: { userId_roleId: { userId: secondUser.id, roleId: secondUser.roleId } },
    });
    const refreshedAfterRoleChange = await auth.refresh(roleChange.refreshToken, {});
    assert.deepEqual(decode(refreshedAfterRoleChange.refreshToken).roles, []);
    await prisma.userRole.create({
      data: { userId: secondUser.id, roleId: secondUser.roleId },
    });
  });

  it('rolls back token consumption when replacement or audit persistence fails', async () => {
    const replacementFailure = await login(firstUser.email);
    const replacementPayload = decode(replacementFailure.refreshToken);
    await installFailureTrigger('RefreshToken', 'db_d5d_reject_refresh_token_insert', `
      IF NEW."sessionId" = '${replacementPayload.sid}'::uuid
        AND NEW."id" <> '${replacementPayload.jti}'::uuid THEN
        RAISE EXCEPTION 'replacement rollback probe';
      END IF;
    `);
    try {
      await assert.rejects(() => auth.refresh(replacementFailure.refreshToken, {}));
      assert.equal((await prisma.refreshToken.findUniqueOrThrow({
        where: { id: replacementPayload.jti },
      })).revokedAt, null);
    } finally {
      await dropFailureTrigger('RefreshToken', 'db_d5d_reject_refresh_token_insert');
    }

    const auditFailure = await login(firstUser.email);
    const auditPayload = decode(auditFailure.refreshToken);
    await installFailureTrigger('AuditLog', 'db_d5d_reject_refresh_audit', `
      IF NEW."action" = 'AUTH_REFRESH' AND NEW."actorUserId" = '${firstUser.id}'::uuid THEN
        RAISE EXCEPTION 'audit rollback probe';
      END IF;
    `);
    try {
      await assert.rejects(() => auth.refresh(auditFailure.refreshToken, {}));
      assert.equal((await prisma.refreshToken.findUniqueOrThrow({
        where: { id: auditPayload.jti },
      })).revokedAt, null);
      assert.equal(await prisma.refreshToken.count({
        where: { sessionId: auditPayload.sid },
      }), 1);
    } finally {
      await dropFailureTrigger('AuditLog', 'db_d5d_reject_refresh_audit');
    }
  });

  it('serializes all-session revocation behind refresh and revokes its replacement only for the target user', async () => {
    const target = await login(firstUser.email);
    const other = await login(secondUser.email);
    const targetSid = decode(target.refreshToken).sid!;
    const otherSid = decode(other.refreshToken).sid!;
    const paused = createSessionLockPause();
    const refreshPromise = paused.service.refresh(target.refreshToken, {});
    await paused.locked;
    const revokePromise = prisma.$transaction((tx) =>
      revokeAllUserSessions(tx, firstUser.id, new Date()),
    );
    paused.release();
    const replacement = await refreshPromise;
    await revokePromise;

    await assert.rejects(() => auth.refresh(replacement.refreshToken, {}), /invalid or revoked/i);
    assert.ok((await prisma.refreshSession.findUniqueOrThrow({ where: { id: targetSid } })).revokedAt);
    assert.equal(await prisma.refreshToken.count({ where: { sessionId: targetSid, revokedAt: null } }), 0);
    assert.equal((await prisma.refreshSession.findUniqueOrThrow({ where: { id: otherSid } })).revokedAt, null);
    assert.equal(await prisma.refreshToken.count({ where: { sessionId: otherSid, revokedAt: null } }), 1);
  });

  it('rolls back session revocation when token revocation persistence fails', async () => {
    const target = await login(firstUser.email);
    const sid = decode(target.refreshToken).sid!;
    await installUpdateFailureTrigger('RefreshToken', 'db_d5d_reject_token_revoke', `
      IF NEW."sessionId" = '${sid}'::uuid AND NEW."revokedAt" IS NOT NULL THEN
        RAISE EXCEPTION 'global revocation rollback probe';
      END IF;
    `);
    try {
      await assert.rejects(() => prisma.$transaction((tx) =>
        revokeAllUserSessions(tx, firstUser.id, new Date()),
      ));
      assert.equal((await prisma.refreshSession.findUniqueOrThrow({ where: { id: sid } })).revokedAt, null);
      assert.equal(await prisma.refreshToken.count({ where: { sessionId: sid, revokedAt: null } }), 1);
    } finally {
      await dropFailureTrigger('RefreshToken', 'db_d5d_reject_token_revoke');
    }
  });

  it('serializes legacy association before all-session revocation without leaving active authority', async () => {
    const legacyId = randomUUID();
    const legacyToken = await jwt.signAsync({
      sub: firstUser.id,
      companyId: firstUser.companyId,
      roles: [RoleName.COMPANY_ADMIN],
      type: 'refresh',
      jti: legacyId,
    } satisfies JwtPayload, {
      secret: config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
    const payload = decode(legacyToken);
    await prisma.refreshToken.create({
      data: {
        id: legacyId,
        userId: firstUser.id,
        tokenHash: hash(legacyToken),
        expiresAt: new Date(payload.exp! * 1000),
      },
    });

    const paused = createSessionLockPause();
    const refreshPromise = paused.service.refresh(legacyToken, {});
    await paused.locked;
    const revokePromise = prisma.$transaction((tx) =>
      revokeAllUserSessions(tx, firstUser.id, new Date()),
    );
    paused.release();
    const replacement = await refreshPromise;
    await revokePromise;

    await assert.rejects(() => auth.refresh(replacement.refreshToken, {}), /invalid or revoked/i);
    assert.ok((await prisma.refreshSession.findUniqueOrThrow({ where: { id: legacyId } })).revokedAt);
    assert.equal(await prisma.refreshToken.count({ where: { sessionId: legacyId, revokedAt: null } }), 0);
  });

  async function createTenantUser(label: string) {
    const company = await prisma.company.create({
      data: { name: `Refresh ${label} ${suffix}`, slug: `refresh-${label}-${suffix}` },
      select: { id: true },
    });
    companyIds.push(company.id);
    const role = await prisma.role.create({
      data: {
        companyId: company.id,
        key: `COMPANY_ADMIN_${label}_${suffix}`,
        name: `Company Admin ${label}`,
        systemName: RoleName.COMPANY_ADMIN,
      },
      select: { id: true },
    });
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        email: `refresh-${label}-${suffix}@example.invalid`,
        passwordHash: await bcrypt.hash(password, 4),
        firstName: 'Refresh',
        lastName: label,
        status: UserStatus.ACTIVE,
        roles: { create: { roleId: role.id } },
      },
      select: { id: true, email: true, companyId: true },
    });
    userIds.push(user.id);
    return { ...user, roleId: role.id };
  }

  function login(email: string) {
    return auth.login({ email, password }, {});
  }

  function decode(token: string): JwtPayload & { jti: string } {
    return jwt.decode(token) as JwtPayload & { jti: string };
  }

  function hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  function createSessionLockPause() {
    let signalLocked!: () => void;
    let releaseLock!: () => void;
    const locked = new Promise<void>((resolve) => { signalLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseLock = resolve; });
    let paused = false;
    const wrappedPrisma = new Proxy(prisma, {
      get(target, property) {
        if (property !== '$transaction') {
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        }
        return async (callback: (tx: object) => Promise<unknown>, options?: object) =>
          target.$transaction(async (tx) => callback(new Proxy(tx, {
            get(txTarget, txProperty) {
              if (txProperty !== '$queryRaw') return Reflect.get(txTarget, txProperty, txTarget);
              return async (...args: unknown[]) => {
                const result = await (txTarget.$queryRaw as (...input: unknown[]) => Promise<unknown>)(...args);
                const text = String((args[0] as { strings?: string[] } | undefined)?.strings?.join(' ') ?? '');
                if (!paused && text.includes('FROM "RefreshSession"') && text.includes('FOR UPDATE')) {
                  paused = true;
                  signalLocked();
                  await release;
                }
                return result;
              };
            },
          }) as never), options as never);
      },
    });
    return {
      service: new AuthService(wrappedPrisma as never, jwt, config as never),
      locked,
      release: releaseLock,
    };
  }

  async function installFailureTrigger(table: string, name: string, body: string) {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "${name}_fn"() RETURNS trigger AS $$
      BEGIN ${body} RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${name}" BEFORE INSERT ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION "${name}_fn"()
    `);
  }

  async function installUpdateFailureTrigger(table: string, name: string, body: string) {
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION "${name}_fn"() RETURNS trigger AS $$
      BEGIN ${body} RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${name}" BEFORE UPDATE ON "${table}"
      FOR EACH ROW EXECUTE FUNCTION "${name}_fn"()
    `);
  }

  async function dropFailureTrigger(table: string, name: string) {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${name}" ON "${table}"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${name}_fn"()`);
  }
});
