import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { BadRequestException, ForbiddenException, ParseUUIDPipe, RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PlatformPaymentsController } from './platform-payments.controller';

describe('PlatformPaymentsController', () => {
  it('is a GET-only Super Admin endpoint protected by authentication and role guards', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformPaymentsController), 'platform-payments');
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PlatformPaymentsController), [RoleName.SUPER_ADMIN]);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlatformPaymentsController), [JwtAuthGuard, RolesGuard]);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, PlatformPaymentsController.prototype.findAll), RequestMethod.GET);
    assert.deepEqual(Object.getOwnPropertyNames(PlatformPaymentsController.prototype).sort(), ['constructor', 'findAll', 'findOne']);
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformPaymentsController.prototype.findOne), ':id');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, PlatformPaymentsController.prototype.findOne), RequestMethod.GET);
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, PlatformPaymentsController, 'findOne');
    assert.ok(Object.values(args).some((value: any) => value.pipes?.some((pipe: unknown) => pipe === ParseUUIDPipe)));
  });

  it('delegates valid detail IDs and the route UUID pipe rejects invalid IDs', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const controller = new PlatformPaymentsController({ findOne: async (received: string) => ({ id: received }) } as never);
    assert.deepEqual(await controller.findOne(id), { id });
    await assert.rejects(() => new ParseUUIDPipe().transform('not-a-uuid', { type: 'param' }), BadRequestException);
  });

  it('delegates the validated query without exposing a mutation path', async () => {
    const query = { page: 1, limit: 20 };
    const expected = { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } };
    const controller = new PlatformPaymentsController({ findAll: async (received: unknown) => { assert.equal(received, query); return expected; } } as never);
    assert.equal(await controller.findAll(query as never), expected);
  });

  it('allows SUPER_ADMIN and denies company and tenant roles at the role boundary', () => {
    const guard = new RolesGuard(new Reflector());
    const context = (roles: RoleName[] | undefined) => ({
      getHandler: () => PlatformPaymentsController.prototype.findAll,
      getClass: () => PlatformPaymentsController,
      switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }),
    }) as never;
    assert.equal(guard.canActivate(context([RoleName.SUPER_ADMIN])), true);
    assert.throws(() => guard.canActivate(context([RoleName.COMPANY_ADMIN])), ForbiddenException);
    assert.throws(() => guard.canActivate(context([RoleName.HR, RoleName.EMPLOYEE])), ForbiddenException);
    assert.throws(() => guard.canActivate(context(undefined)), ForbiddenException);
  });
});
