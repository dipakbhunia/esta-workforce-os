import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformGstController } from './platform-gst.controller';

describe('PlatformGstController', () => {
  it('is JWT and SUPER_ADMIN protected', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformGstController), 'platform/gst');
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlatformGstController), [JwtAuthGuard, RolesGuard]);
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PlatformGstController), [RoleName.SUPER_ADMIN]);
    assert.deepEqual(Object.getOwnPropertyNames(PlatformGstController.prototype).sort(), ['constructor', 'createPolicy', 'getPolicy', 'getTransaction', 'listPolicies', 'listTransactions']);
    const guard = new RolesGuard(new Reflector());
    const context = (roles?: RoleName[]) => ({ getHandler: () => PlatformGstController.prototype.listPolicies, getClass: () => PlatformGstController, switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }) }) as never;
    assert.equal(guard.canActivate(context([RoleName.SUPER_ADMIN])), true);
    assert.throws(() => guard.canActivate(context([RoleName.COMPANY_ADMIN])), ForbiddenException);
    assert.throws(() => guard.canActivate(context()), ForbiddenException);
  });
});
