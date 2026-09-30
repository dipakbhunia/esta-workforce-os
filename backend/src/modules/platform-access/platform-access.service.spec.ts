import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { PlatformAccessService } from './platform-access.service';

describe('PlatformAccessService', () => {
  it('scopes platform user reads to companyId null with explicit projections', async () => {
    let findArgs: Record<string, unknown> | undefined;
    const prisma = {
      user: {
        findMany: (args: Record<string, unknown>) => {
          findArgs = args;
          return Promise.resolve([]);
        },
        count: () => Promise.resolve(0),
      },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const service = new PlatformAccessService(prisma as never, {} as never);
    await service.listUsers({ page: 1, limit: 20 });
    assert.deepEqual(findArgs?.where, { companyId: null, deletedAt: null });
    assert.ok(findArgs?.select);
    assert.equal('include' in (findArgs ?? {}), false);
  });

  it('uses bounded safe projections for platform audit reads', async () => {
    let findArgs: Record<string, unknown> | undefined;
    const prisma = {
      auditLog: {
        findMany: (args: Record<string, unknown>) => {
          findArgs = args;
          return Promise.resolve([]);
        },
        count: () => Promise.resolve(0),
      },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const service = new PlatformAccessService(prisma as never, {} as never);
    await service.listAuditLogs({ page: 2, limit: 25 });
    assert.deepEqual(findArgs?.where, { companyId: null });
    assert.equal(findArgs?.skip, 25);
    assert.equal(findArgs?.take, 25);
    const serialized = JSON.stringify(findArgs?.select);
    for (const forbidden of [
      'passwordHash',
      'tokenHash',
      'refreshToken',
      'keySecret',
      'webhookSecret',
      'metadata',
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it('cannot read or mutate a tenant user through the platform contract', async () => {
    let delegated = false;
    const prisma = {
      user: { findFirst: () => Promise.resolve(null) },
    };
    const users = {
      update: () => {
        delegated = true;
      },
    };
    const service = new PlatformAccessService(prisma as never, users as never);
    await assert.rejects(
      () => service.getUser('tenant-user'),
      NotFoundException,
    );
    await assert.rejects(
      () =>
        service.updateUser(
          'tenant-user',
          { firstName: 'Blocked' },
          {} as never,
        ),
      NotFoundException,
    );
    assert.equal(delegated, false);
  });

  it('scopes role reads to global roles and explicit permission metadata', async () => {
    let findArgs: Record<string, unknown> | undefined;
    const prisma = {
      role: {
        findMany: (args: Record<string, unknown>) => {
          findArgs = args;
          return Promise.resolve([]);
        },
        count: () => Promise.resolve(0),
      },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const service = new PlatformAccessService(prisma as never, {} as never);
    await service.listRoles({ page: 1, limit: 20 });
    assert.deepEqual(findArgs?.where, { companyId: null, deletedAt: null });
    assert.ok(findArgs?.select);
    assert.equal('include' in (findArgs ?? {}), false);
  });
});
