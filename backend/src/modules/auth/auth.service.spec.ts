import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JwtService } from '@nestjs/jwt';
import { RoleName, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

const secret = 'db-d5d-2b-2-unit-secret-at-least-32-characters';
const config = {
  getOrThrow: (key: string) => ({
    JWT_ACCESS_SECRET: `${secret}-access`,
    JWT_REFRESH_SECRET: `${secret}-refresh`,
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  })[key],
};

describe('AuthService refresh-session unit behavior', () => {
  it('persists login session, token, and audit in one transaction with matching sid', async () => {
    const events: string[] = [];
    const passwordHash = await bcrypt.hash('password', 4);
    const user = userFixture(passwordHash);
    let sessionData: Record<string, unknown> | undefined;
    let tokenData: Record<string, unknown> | undefined;
    const tx = {
      $queryRaw: async () => { events.push('lock-user'); return [{ id: user.id }]; },
      user: {
        findUnique: async () => user,
        update: async () => { events.push('update-user'); return user; },
      },
      refreshSession: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          events.push('create-session'); sessionData = data; return data;
        },
      },
      refreshToken: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          events.push('create-token'); tokenData = data; return data;
        },
      },
      auditLog: {
        create: async () => { events.push('audit'); return {}; },
      },
    };
    const prisma = {
      user: { findUnique: async () => user },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    };
    const jwt = new JwtService();
    const service = new AuthService(prisma as never, jwt, config as never);

    const result = await service.login({ email: user.email, password: 'password' }, {});
    const payload = jwt.decode(result.refreshToken) as JwtPayload;
    assert.ok(payload.sid);
    assert.ok(payload.jti);
    assert.equal(sessionData?.id, payload.sid);
    assert.equal(tokenData?.sessionId, payload.sid);
    assert.equal(tokenData?.id, payload.jti);
    assert.deepEqual(events, ['lock-user', 'update-user', 'create-session', 'create-token', 'audit']);
  });

  it('issues unique jti with stable supplied sid and never adds sid to access claims', async () => {
    const jwt = new JwtService();
    const service = new AuthService({} as never, jwt, config as never);
    const prepare = (service as unknown as {
      prepareTokenPair: (user: ReturnType<typeof userFixture>, sessionId: string) => Promise<{
        response: { accessToken: string; refreshToken: string };
      }>;
    }).prepareTokenPair.bind(service);
    const sessionId = '11111111-1111-4111-8111-111111111111';
    const first = await prepare(userFixture('hash'), sessionId);
    const second = await prepare(userFixture('hash'), sessionId);
    const firstRefresh = jwt.decode(first.response.refreshToken) as JwtPayload;
    const secondRefresh = jwt.decode(second.response.refreshToken) as JwtPayload;
    const access = jwt.decode(first.response.accessToken) as JwtPayload;
    assert.equal(firstRefresh.sid, sessionId);
    assert.equal(secondRefresh.sid, sessionId);
    assert.notEqual(firstRefresh.jti, secondRefresh.jti);
    assert.equal(access.sid, undefined);
  });

  it('accepts a valid legacy refresh JWT without sid during compatibility', async () => {
    const jwt = new JwtService();
    const service = new AuthService({} as never, jwt, config as never);
    const token = await jwt.signAsync({
      sub: '11111111-1111-4111-8111-111111111111',
      companyId: null,
      roles: [RoleName.SUPER_ADMIN],
      type: 'refresh',
      jti: '22222222-2222-4222-8222-222222222222',
    } satisfies JwtPayload, {
      secret: config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: '7d',
    });
    const verify = (service as unknown as {
      verifyRefreshToken: (value: string) => Promise<JwtPayload & { jti: string }>;
    }).verifyRefreshToken.bind(service);
    const payload = await verify(token);
    assert.equal(payload.sid, undefined);
    assert.equal(payload.jti, '22222222-2222-4222-8222-222222222222');
  });

  it('rejects wrong token type and invalid signatures generically', async () => {
    const jwt = new JwtService();
    const service = new AuthService({} as never, jwt, config as never);
    const verify = (service as unknown as {
      verifyRefreshToken: (value: string) => Promise<JwtPayload>;
    }).verifyRefreshToken.bind(service);
    const access = await jwt.signAsync({
      sub: '11111111-1111-4111-8111-111111111111',
      companyId: null,
      roles: [],
      type: 'access',
    } satisfies JwtPayload, { secret: config.getOrThrow('JWT_REFRESH_SECRET'), expiresIn: '15m' });
    await assert.rejects(() => verify(access), /Invalid or expired refresh token/);
    await assert.rejects(() => verify('not-a-token'), /Invalid or expired refresh token/);
  });

  it('rejects login when the normalized email changes before the locked recheck', async () => {
    const passwordHash = await bcrypt.hash('password', 4);
    const initial = userFixture(passwordHash);
    const tx = {
      $queryRaw: async () => [{ id: initial.id }],
      user: { findUnique: async () => ({ ...initial, email: 'changed@example.invalid' }) },
    };
    const prisma = {
      user: { findUnique: async () => initial },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    };
    const service = new AuthService(prisma as never, new JwtService(), config as never);
    await assert.rejects(
      () => service.login({ email: initial.email, password: 'password' }, {}),
      /Invalid email or password/,
    );
  });
});

function userFixture(passwordHash: string) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    companyId: null,
    branchId: null,
    departmentId: null,
    designationId: null,
    shiftId: null,
    email: 'auth-unit@example.invalid',
    emailRevision: 0,
    verifiedEmail: null,
    emailVerifiedAt: null,
    passwordHash,
    firstName: 'Auth',
    lastName: 'Unit',
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    company: null,
    roles: [{
      role: {
        id: '22222222-2222-4222-8222-222222222222',
        companyId: null,
        key: 'SUPER_ADMIN',
        name: 'Super Admin',
        systemName: RoleName.SUPER_ADMIN,
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    }],
  };
}
