import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { RoleName, UserStatus } from '@prisma/client';
import { UsersService } from './users.service';

const actor = {
  id: '11111111-1111-4111-8111-111111111111',
  companyId: null,
  email: 'actor@example.invalid',
  firstName: 'Platform',
  lastName: 'Actor',
  status: UserStatus.ACTIVE,
  roles: [RoleName.SUPER_ADMIN],
};

const target = {
  id: '22222222-2222-4222-8222-222222222222',
  companyId: null,
  email: 'target@example.invalid',
  firstName: 'Platform',
  lastName: 'Target',
  status: UserStatus.ACTIVE,
  deletedAt: null,
  branch: null,
  department: null,
  designation: null,
  shift: null,
  roles: [
    {
      assignedAt: new Date(),
      role: {
        id: '33333333-3333-4333-8333-333333333333',
        key: 'super-admin',
        name: 'Super Admin',
        systemName: RoleName.SUPER_ADMIN,
        companyId: null,
        deletedAt: null,
      },
    },
    {
      assignedAt: new Date(),
      role: {
        id: '44444444-4444-4444-8444-444444444444',
        key: 'platform-reader',
        name: 'Platform Reader',
        systemName: null,
        companyId: null,
        deletedAt: null,
      },
    },
  ],
};

function prismaForFinalAdmin(activeAdmins = 1) {
  let writes = 0;
  let audits = 0;
  const tx = {
    $queryRaw: () => Promise.resolve([{ pg_advisory_xact_lock: '' }]),
    user: {
      findUnique: () => Promise.resolve(target),
      count: () => Promise.resolve(activeAdmins),
      update: () => {
        writes += 1;
        return Promise.resolve(target);
      },
    },
    userRole: {
      deleteMany: () => {
        writes += 1;
        return Promise.resolve({ count: 1 });
      },
    },
    refreshToken: { updateMany: () => Promise.resolve({ count: 0 }) },
    auditLog: {
      create: () => {
        audits += 1;
        return Promise.resolve({});
      },
    },
  };
  const prisma = {
    user: { findFirst: () => Promise.resolve(target) },
    role: {
      findMany: () =>
        Promise.resolve([
          {
            id: target.roles[0].role.id,
            companyId: null,
            systemName: RoleName.SUPER_ADMIN,
          },
        ]),
    },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  return { prisma, writes: () => writes, audits: () => audits };
}

describe('UsersService platform authority invariants', () => {
  it('blocks disabling the final active SUPER_ADMIN before writes or audit', async () => {
    const state = prismaForFinalAdmin();
    const service = new UsersService(state.prisma as never, {} as never);
    await assert.rejects(
      () =>
        service.setStatus(
          target.id,
          { status: UserStatus.SUSPENDED },
          actor,
        ),
      ForbiddenException,
    );
    assert.equal(state.writes(), 0);
    assert.equal(state.audits(), 0);
  });

  it('blocks deleting the final active SUPER_ADMIN before writes or audit', async () => {
    const state = prismaForFinalAdmin();
    const service = new UsersService(state.prisma as never, {} as never);
    await assert.rejects(
      () => service.remove(target.id, actor),
      ForbiddenException,
    );
    assert.equal(state.writes(), 0);
    assert.equal(state.audits(), 0);
  });

  it('blocks removing the final SUPER_ADMIN role before writes or audit', async () => {
    const state = prismaForFinalAdmin();
    const service = new UsersService(state.prisma as never, {} as never);
    await assert.rejects(
      () => service.removeRole(target.id, target.roles[0].role.id, actor),
      ForbiddenException,
    );
    assert.equal(state.writes(), 0);
    assert.equal(state.audits(), 0);
  });

  it('allows deactivation when another active SUPER_ADMIN remains and audits it', async () => {
    const state = prismaForFinalAdmin(2);
    const service = new UsersService(state.prisma as never, {} as never);
    await service.setStatus(
      target.id,
      { status: UserStatus.SUSPENDED },
      actor,
    );
    assert.equal(state.writes(), 1);
    assert.equal(state.audits(), 1);
  });

  it('allows deletion when another active SUPER_ADMIN remains and audits it', async () => {
    const state = prismaForFinalAdmin(2);
    const service = new UsersService(state.prisma as never, {} as never);
    await service.remove(target.id, actor);
    assert.equal(state.writes(), 1);
    assert.equal(state.audits(), 1);
  });

  it('allows SUPER_ADMIN role removal when another active admin remains and audits it', async () => {
    const state = prismaForFinalAdmin(2);
    const service = new UsersService(state.prisma as never, {} as never);
    await service.removeRole(target.id, target.roles[0].role.id, actor);
    assert.equal(state.writes(), 1);
    assert.equal(state.audits(), 1);
  });
});
