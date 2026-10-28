import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CompanyStatus, PrismaClient, RoleName, UserStatus } from '@prisma/client';
import { CompaniesService } from './companies.service';

const expectedDatabase = 'esta_sac22_company_lifecycle';
const expectedUser = 'esta_sac22_runner';
const expectedHost = '127.0.0.1';
const expectedPort = '55442';
const databaseUrl = process.env.DATABASE_URL ?? '';
const expectedServerIp = process.env.SA_C22_EXPECTED_PG_SERVER_IP ?? '';
const integrationRequested = isIntegrationExplicitlyRequested(process.env.RUN_SA_C22_INTEGRATION);

const protectedDatabases = new Set([
  'esta_workforce',
  'esta_qa_p13b2a_20261023_131805',
  'esta_pc_l_20261008_a',
  'esta_low_d_integration_20261026',
]);

describe('SA-C2.2 disposable database URL fence', () => {
  it('requires the exact explicit integration opt-in value', () => {
    assert.equal(isIntegrationExplicitlyRequested('true'), true);
    for (const value of [undefined, '', '1', 'TRUE', 'false']) {
      assert.equal(isIntegrationExplicitlyRequested(value), false);
    }
  });

  it('accepts only the exact disposable PostgreSQL authority', () => {
    assert.doesNotThrow(() => validateDisposableDatabaseUrl(
      'postgresql://esta_sac22_runner@127.0.0.1:55442/esta_sac22_company_lifecycle?schema=public',
    ));
  });

  it('rejects protected, ambiguous, overridden, and malformed authorities', () => {
    for (const value of [
      'postgresql://esta_sac22_runner@127.0.0.1:55442/esta_workforce?schema=public',
      'postgresql://esta_sac22_runner@localhost:55442/esta_sac22_company_lifecycle?schema=public',
      'postgresql://wrong@127.0.0.1:55442/esta_sac22_company_lifecycle?schema=public',
      'postgresql://esta_sac22_runner@127.0.0.1:5432/esta_sac22_company_lifecycle?schema=public',
      'postgresql://esta_sac22_runner@127.0.0.1:55442/esta_sac22_company_lifecycle?host=esta-postgres&schema=public',
      'postgresql://esta_sac22_runner@127.0.0.1:55442/esta_sac22_company_lifecycle?schema=public&port=5432',
      'postgresql://esta_sac22_runner@127.0.0.1:55442/esta_sac22_company_lifecycle?schema=public&socket=/var/run/postgresql',
      'postgresql://esta_sac22_runner@127.0.0.1:55442/esta_sac22_company_lifecycle?schema=other',
      'postgres://esta_sac22_runner@127.0.0.1:55442/esta_sac22_company_lifecycle?schema=public',
      'not-a-url',
    ]) assert.throws(() => validateDisposableDatabaseUrl(value));
  });

  it('requires an explicit canonical private Docker IPv4 address', () => {
    for (const value of ['', 'not-an-ip', '127.0.0.1', '0.0.0.0', '224.0.0.1', '172.17.0.2/32', '172.017.0.2', '172.17.0.0', '172.17.0.255', '169.254.1.1', '8.8.8.8']) {
      assert.throws(() => validateExpectedServerIp(value));
    }
    for (const value of ['10.0.0.2', '172.17.0.2', '192.168.10.4']) {
      assert.equal(validateExpectedServerIp(value), value);
    }
  });

  it('normalizes only an optional PostgreSQL /32 host prefix and compares the exact attested IP', () => {
    assert.equal(normalizePostgresServerAddress('172.17.0.2'), '172.17.0.2');
    assert.equal(normalizePostgresServerAddress('172.17.0.2/32'), '172.17.0.2');
    for (const value of ['172.17.0.2/24', '172.17.0.2/31', '172.017.0.2/32', '::1', '0.0.0.0/32']) {
      assert.throws(() => normalizePostgresServerAddress(value));
    }
    assert.doesNotThrow(() => assertConnectedIdentity({
      databaseName: expectedDatabase, userName: expectedUser,
      serverAddress: '172.17.0.2/32', serverPort: 5432,
    }, '172.17.0.2'));
    assert.throws(() => assertConnectedIdentity({
      databaseName: expectedDatabase, userName: expectedUser,
      serverAddress: '172.17.0.3/32', serverPort: 5432,
    }, '172.17.0.2'));
  });
});

function isIntegrationExplicitlyRequested(value: string | undefined): boolean {
  return value === 'true';
}

describe('SA-C2.2 company lifecycle PostgreSQL serialization', { skip: !integrationRequested }, () => {
  it('serializes lifecycle operations, preserves authority, and rolls back failed audit transactions', async () => {
    validateDisposableDatabaseUrl(databaseUrl);
    const attestedServerIp = validateExpectedServerIp(expectedServerIp);
    const prisma = new PrismaClient();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      await verifyConnectedDatabaseIdentity(prisma, attestedServerIp);
    } catch (error) {
      await prisma.$disconnect().catch(() => undefined);
      throw error;
    }
    let actorId: string | undefined;
    let companyId: string | undefined;
    let otherCompanyId: string | undefined;
    let primaryError: unknown;

    try {
      const actor = await prisma.user.create({ data: {
        email: `sac22-super-${suffix}@example.invalid`, passwordHash: 'not-a-login-secret',
        firstName: 'SA-C2.2', lastName: 'Super Admin', status: UserStatus.ACTIVE,
      } });
      actorId = actor.id;
      const company = await prisma.company.create({ data: {
        name: `SA-C2.2 Company ${suffix}`, slug: `sac22-company-${suffix}`,
        status: CompanyStatus.ACTIVE,
      } });
      companyId = company.id;
      const otherCompany = await prisma.company.create({ data: {
        name: `SA-C2.2 Other ${suffix}`, slug: `sac22-other-${suffix}`,
        status: CompanyStatus.ACTIVE,
      } });
      otherCompanyId = otherCompany.id;
      const superAdmin = {
        id: actor.id, companyId: null, email: actor.email, firstName: actor.firstName,
        lastName: actor.lastName, status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN],
      };
      const companyAdmin = { ...superAdmin, id: crypto.randomUUID(), companyId: company.id, roles: [RoleName.COMPANY_ADMIN] };
      const service = new CompaniesService(prisma as never);
      await assert.rejects(
        () => service.update(company.id, { status: CompanyStatus.SUSPENDED }, companyAdmin),
        ForbiddenException,
      );
      await assert.rejects(
        () => service.update(otherCompany.id, { status: CompanyStatus.SUSPENDED }, companyAdmin),
        ForbiddenException,
      );

      await runStatusStatusRace(prisma, company.id, superAdmin);
      await resetCompany(prisma, company.id);
      await runStatusArchiveRace(prisma, company.id, superAdmin);
      await resetCompany(prisma, company.id);
      await runArchiveStatusRace(prisma, company.id, superAdmin);
      await resetCompany(prisma, company.id);
      await proveAuditRollback(prisma, company.id, superAdmin);
    } catch (error) {
      primaryError = error;
    }

    let cleanupError: unknown;
    try {
      const companyIds = [companyId, otherCompanyId].filter((id): id is string => Boolean(id));
      if (companyIds.length) {
        await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
      }
      if (actorId) await prisma.user.delete({ where: { id: actorId } });
    } catch (error) {
      cleanupError = error;
    } finally {
      await prisma.$disconnect().catch((error: unknown) => { cleanupError ??= error; });
    }

    if (primaryError) {
      if (cleanupError && primaryError instanceof Error && primaryError.cause === undefined) {
        primaryError.cause = cleanupError;
      }
      throw primaryError;
    }
    if (cleanupError) throw cleanupError;
  });
});

function validateDisposableDatabaseUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SA-C2.2 integration DATABASE_URL is malformed');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (protectedDatabases.has(databaseName)) throw new Error('Protected database identity is forbidden');
  if (parsed.protocol !== 'postgresql:') throw new Error('PostgreSQL protocol is required');
  if (parsed.hostname !== expectedHost) throw new Error('Disposable loopback hostname is required');
  if (parsed.port !== expectedPort) throw new Error('Disposable host port is required');
  if (databaseName !== expectedDatabase || parsed.pathname !== `/${expectedDatabase}`) {
    throw new Error('Exact disposable database pathname is required');
  }
  if (decodeURIComponent(parsed.username) !== expectedUser) throw new Error('Exact disposable database user is required');
  if (parsed.hash) throw new Error('DATABASE_URL fragments are not permitted');
  const allowedParameters = new Map([['schema', 'public']]);
  for (const [key, value] of parsed.searchParams) {
    if (allowedParameters.get(key) !== value || parsed.searchParams.getAll(key).length !== 1) {
      throw new Error(`DATABASE_URL parameter is not permitted: ${key}`);
    }
  }
  for (const key of allowedParameters.keys()) {
    if (!parsed.searchParams.has(key)) throw new Error(`Required DATABASE_URL parameter is missing: ${key}`);
  }
}

type ConnectedDatabaseIdentity = {
  databaseName: string;
  userName: string;
  serverAddress: string;
  serverPort: number;
};

// Operator requirement: inspect the exact labeled disposable container, its ID,
// default-bridge attachment, loopback port publication and approved volume, then
// pass that container's Docker-inspected IPv4 address as SA_C22_EXPECTED_PG_SERVER_IP.
// The harness never discovers or substitutes this independent expected authority.
function validateExpectedServerIp(value: string): string {
  return parseCanonicalPrivateUnicastIpv4(value, 'Expected PostgreSQL Docker server IP');
}

function normalizePostgresServerAddress(value: string): string {
  const parts = value.split('/');
  if (parts.length > 2 || (parts.length === 2 && parts[1] !== '32')) {
    throw new Error('PostgreSQL server address must be an IPv4 host or exact /32 host prefix');
  }
  return parseCanonicalPrivateUnicastIpv4(parts[0], 'Connected PostgreSQL server address');
}

function parseCanonicalPrivateUnicastIpv4(value: string, label: string): string {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9][0-9]{0,2})$/.test(part))) {
    throw new Error(`${label} must be canonical IPv4`);
  }
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) throw new Error(`${label} contains an invalid octet`);
  const [first, second] = octets;
  const privateAddress = first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
  if (!privateAddress || first === 127 || (first === 169 && second === 254) || octets[3] === 0 || octets[3] === 255) {
    throw new Error(`${label} must be a private, unicast, non-loopback Docker IPv4 address`);
  }
  return octets.join('.');
}

function assertConnectedIdentity(identity: ConnectedDatabaseIdentity | undefined, attestedServerIp: string): void {
  if (!identity
    || protectedDatabases.has(identity.databaseName)
    || identity.databaseName !== expectedDatabase
    || identity.userName !== expectedUser
    || normalizePostgresServerAddress(identity.serverAddress) !== attestedServerIp
    || identity.serverPort !== 5432) {
    throw new Error('Connected PostgreSQL identity does not match the disposable SA-C2.2 authority');
  }
}

async function verifyConnectedDatabaseIdentity(prisma: PrismaClient, attestedServerIp: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<ConnectedDatabaseIdentity>>`
    SELECT current_database() AS "databaseName",
           current_user AS "userName",
           inet_server_addr()::text AS "serverAddress",
           inet_server_port() AS "serverPort"
  `;
  assertConnectedIdentity(rows[0], attestedServerIp);
}

async function runStatusStatusRace(prisma: PrismaClient, companyId: string, actor: Actor) {
  const barrier = lockBarrier();
  const first = controlledService(prisma, barrier).update(companyId, { status: CompanyStatus.TRIAL }, actor);
  await barrier.locked;
  const second = new CompaniesService(prisma as never).update(companyId, { status: CompanyStatus.SUSPENDED }, actor);
  assert.equal(await remainsPending(second), true);
  barrier.release();
  await Promise.all([first, second]);

  const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const audits = await lifecycleAudits(prisma, companyId);
  assert.equal(row.status, CompanyStatus.SUSPENDED);
  assert.deepEqual(audits.map((entry) => entry.metadata), [
    { from: CompanyStatus.ACTIVE, to: CompanyStatus.TRIAL },
    { from: CompanyStatus.TRIAL, to: CompanyStatus.SUSPENDED },
  ]);
}

async function runStatusArchiveRace(prisma: PrismaClient, companyId: string, actor: Actor) {
  const barrier = lockBarrier();
  const update = controlledService(prisma, barrier).update(companyId, { status: CompanyStatus.TRIAL }, actor);
  await barrier.locked;
  const archive = new CompaniesService(prisma as never).remove(companyId, actor);
  assert.equal(await remainsPending(archive), true);
  barrier.release();
  await Promise.all([update, archive]);

  const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const audits = await prisma.auditLog.findMany({ where: { companyId }, orderBy: { createdAt: 'asc' } });
  assert.equal(row.status, CompanyStatus.SUSPENDED);
  assert.ok(row.deletedAt);
  assert.deepEqual(audits.map((entry) => [entry.action, entry.metadata]), [
    ['COMPANY_UPDATED', { changedFields: ['status'] }],
    ['COMPANY_STATUS_CHANGED', { from: CompanyStatus.ACTIVE, to: CompanyStatus.TRIAL }],
    ['COMPANY_ARCHIVED', { previousStatus: CompanyStatus.TRIAL }],
  ]);
}

async function runArchiveStatusRace(prisma: PrismaClient, companyId: string, actor: Actor) {
  const barrier = lockBarrier();
  const archive = controlledService(prisma, barrier).remove(companyId, actor);
  await barrier.locked;
  const update = new CompaniesService(prisma as never).update(companyId, { status: CompanyStatus.TRIAL }, actor);
  assert.equal(await remainsPending(update), true);
  barrier.release();
  await archive;
  await assert.rejects(() => update, NotFoundException);

  const row = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  assert.equal(row.status, CompanyStatus.SUSPENDED);
  assert.ok(row.deletedAt);
  assert.deepEqual((await prisma.auditLog.findMany({ where: { companyId } })).map((entry) => entry.action), ['COMPANY_ARCHIVED']);
}

async function proveAuditRollback(prisma: PrismaClient, companyId: string, actor: Actor) {
  const failingPrisma = {
    $transaction: (callback: (tx: never) => unknown) => prisma.$transaction(async (tx) => {
      let auditCount = 0;
      const proxy = new Proxy(tx, { get(target, property, receiver) {
        if (property !== 'auditLog') return Reflect.get(target, property, receiver);
        return new Proxy(tx.auditLog, { get(auditTarget, auditProperty, auditReceiver) {
          if (auditProperty !== 'create') return Reflect.get(auditTarget, auditProperty, auditReceiver);
          return async (...args: unknown[]) => {
            auditCount += 1;
            if (auditCount === 2) throw new Error('synthetic audit failure');
            return Reflect.apply(tx.auditLog.create, tx.auditLog, args);
          };
        } });
      } });
      return callback(proxy as never);
    }),
  };
  await assert.rejects(
    () => new CompaniesService(failingPrisma as never).update(companyId, { status: CompanyStatus.TRIAL }, actor),
    /synthetic audit failure/,
  );
  assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).status, CompanyStatus.ACTIVE);
  assert.equal(await prisma.auditLog.count({ where: { companyId } }), 0);
}

function controlledService(prisma: PrismaClient, barrier: ReturnType<typeof lockBarrier>) {
  return new CompaniesService({
    $transaction: (callback: (tx: never) => unknown) => prisma.$transaction(async (tx) => {
      const proxy = new Proxy(tx, { get(target, property, receiver) {
        if (property !== '$queryRaw') return Reflect.get(target, property, receiver);
        return async (...args: unknown[]) => {
          const value = await Reflect.apply(tx.$queryRaw, tx, args);
          barrier.markLocked();
          await barrier.waitForRelease;
          return value;
        };
      } });
      return callback(proxy as never);
    }),
  } as never);
}

function lockBarrier() {
  let markLocked!: () => void;
  let release!: () => void;
  const locked = new Promise<void>((resolve) => { markLocked = resolve; });
  const waitForRelease = new Promise<void>((resolve) => { release = resolve; });
  return { locked, waitForRelease, markLocked, release };
}

async function remainsPending(promise: Promise<unknown>) {
  return Promise.race([promise.then(() => false, () => false), new Promise<true>((resolve) => setTimeout(() => resolve(true), 150))]);
}

async function resetCompany(prisma: PrismaClient, companyId: string) {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.company.update({ where: { id: companyId }, data: { status: CompanyStatus.ACTIVE, deletedAt: null } });
}

async function lifecycleAudits(prisma: PrismaClient, companyId: string) {
  return prisma.auditLog.findMany({
    where: { companyId, action: 'COMPANY_STATUS_CHANGED' },
    orderBy: { createdAt: 'asc' },
  });
}

type Actor = {
  id: string;
  companyId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  roles: RoleName[];
};
