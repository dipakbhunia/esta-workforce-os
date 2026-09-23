import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformRenewalsController } from './platform-renewals.controller';

describe('PlatformRenewalsController', () => {
  it('exposes only the locked guarded platform routes', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformRenewalsController), 'platform/renewals');
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PlatformRenewalsController), [RoleName.SUPER_ADMIN]);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlatformRenewalsController), [JwtAuthGuard, RolesGuard]);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, PlatformRenewalsController.prototype.findAll), RequestMethod.GET);
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformRenewalsController.prototype.findOne), ':id');
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformRenewalsController.prototype.prepare), 'subscriptions/:subscriptionId/prepare');
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformRenewalsController.prototype.recover), ':id/recover');
  });

  it('allows SUPER_ADMIN and denies tenant or missing identities', () => {
    const guard = new RolesGuard(new Reflector());
    const context = (roles?: RoleName[]) => ({ getHandler: () => PlatformRenewalsController.prototype.findAll,
      getClass: () => PlatformRenewalsController, switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }) }) as never;
    assert.equal(guard.canActivate(context([RoleName.SUPER_ADMIN])), true);
    assert.throws(() => guard.canActivate(context([RoleName.COMPANY_ADMIN])), ForbiddenException);
    assert.throws(() => guard.canActivate(context()), ForbiddenException);
  });

  it('propagates the authenticated actor and delegates recover by renewal id', async () => {
    const calls: unknown[] = [];
    const controller = new PlatformRenewalsController({ prepare: async (...args: unknown[]) => { calls.push(args); return { created: true }; },
      recover: async (id: string) => { calls.push(id); return { outcome: 'APPLIED' }; } } as never);
    await controller.prepare('subscription', { id: 'actor' } as never); await controller.recover('renewal');
    assert.deepEqual(calls, [['subscription', 'actor'], 'renewal']);
  });
});
