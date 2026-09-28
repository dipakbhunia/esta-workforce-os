import assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, InternalServerErrorException, ParseUUIDPipe, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PaymentStatus, RoleName } from '@prisma/client';
import { describe, it } from 'node:test';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AppModule } from '../../app.module';
import { PlatformDunningController, mapDunningReadError } from './platform-dunning.controller';
import { PlatformDunningQueryDto } from './platform-dunning.dto';
import { PlatformDunningModule } from './platform-dunning.module';
import { DunningIntegrityError, DunningNotFoundError } from './platform-dunning.types';

describe('PlatformDunningController', () => {
  it('registers the minimal Dunning module in the application', () => {
    assert.ok(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule).includes(PlatformDunningModule));
    assert.deepEqual(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PlatformDunningModule), [PlatformDunningController]);
  });
  it('exposes exactly two SUPER_ADMIN guarded GET routes with UUID detail validation', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformDunningController), 'platform/dunning');
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PlatformDunningController), [RoleName.SUPER_ADMIN]);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlatformDunningController), [JwtAuthGuard, RolesGuard]);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, PlatformDunningController.prototype.findAll), RequestMethod.GET);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, PlatformDunningController.prototype.findOne), RequestMethod.GET);
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformDunningController.prototype.findOne), ':renewalId');
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, PlatformDunningController, 'findOne');
    assert.ok(Object.values(args).some((value: any) => value.pipes?.includes(ParseUUIDPipe)));
  });
  it('allows SUPER_ADMIN and denies every tenant role or missing identity', () => {
    const guard = new RolesGuard(new Reflector());
    const context = (roles?: RoleName[]) => ({ getHandler: () => PlatformDunningController.prototype.findAll,
      getClass: () => PlatformDunningController, switchToHttp: () => ({ getRequest: () => ({ user: roles ? { roles } : undefined }) }) }) as never;
    assert.equal(guard.canActivate(context([RoleName.SUPER_ADMIN])), true);
    for (const roles of [[RoleName.COMPANY_ADMIN], [RoleName.HR], [RoleName.MANAGER], [RoleName.EMPLOYEE], undefined]) assert.throws(() => guard.canActivate(context(roles)), ForbiddenException);
  });
  it('normalizes dates once and delegates list/detail without duplicating domain behavior', async () => {
    const calls: unknown[] = []; const expected = { evaluationTime: 'time', data: [], meta: {} };
    const controller = new PlatformDunningController({ findAll: async (query: unknown) => { calls.push(query); return expected; },
      findOne: async (id: string) => { calls.push(id); return { id }; } } as never);
    const query = Object.assign(new PlatformDunningQueryDto(), { paymentStatus: PaymentStatus.FAILED,
      from: '2035-06-01T05:30:00+05:30', to: '2035-07-01T00:00:00Z' });
    assert.equal(await controller.findAll(query), expected); assert.deepEqual(await controller.findOne('renewal'), { id: 'renewal' });
    const delegated = calls[0] as any; assert.equal(delegated.from.toISOString(), '2035-06-01T00:00:00.000Z');
    assert.equal(delegated.to.toISOString(), '2035-07-01T00:00:00.000Z'); assert.equal(delegated.paymentStatus, PaymentStatus.FAILED);
    await assert.rejects(() => new ParseUUIDPipe().transform('invalid', { type: 'param' }), BadRequestException);
  });
  it('passes through every coherent detail classification including non-active results', async () => {
    for (const classification of ['NOT_DUE', 'OPEN', 'RECOVERY_PENDING', 'RESOLVED', 'STOPPED'] as const) {
      const expected = { classification, active: classification === 'OPEN', reason: classification === 'OPEN' ? 'PAYMENT_PENDING' : null };
      const controller = new PlatformDunningController({ findOne: async () => expected } as never);
      assert.equal(await controller.findOne('id'), expected); assert.equal((await controller.findOne('id')).reason, expected.reason);
    }
  });
  it('maps not-found and sanitizes integrity and unexpected failures', () => {
    const missing: any = mapDunningReadError(new DunningNotFoundError()); assert.equal(missing.getStatus(), 404);
    const integrity: any = mapDunningReadError(new DunningIntegrityError('SQL credential raw provider secret'));
    assert.equal(integrity.getStatus(), 500); assert.match(JSON.stringify(integrity.getResponse()), /Dunning evidence is inconsistent/);
    const unexpected: any = mapDunningReadError(new Error('Prisma SQL provider credential secret'));
    assert.ok(unexpected instanceof InternalServerErrorException); assert.equal(unexpected.getStatus(), 500);
    const response = JSON.stringify(unexpected.getResponse()); assert.match(response, /Dunning records could not be loaded/);
    assert.doesNotMatch(JSON.stringify([integrity.getResponse(), unexpected.getResponse()]), /Prisma|SQL|provider|credential|secret|raw/i);
  });
});
