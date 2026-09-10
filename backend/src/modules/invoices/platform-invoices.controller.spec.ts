import assert from 'node:assert/strict';
import {
  BadRequestException, ConflictException, ForbiddenException, InternalServerErrorException, NotFoundException,
  ParseUUIDPipe, UnprocessableEntityException,
} from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { describe, it } from 'node:test';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { InvoiceIssuanceError } from './invoice-issuance.service';
import { mapInvoiceIssuanceError, PlatformInvoicesController } from './platform-invoices.controller';

describe('PlatformInvoicesController', () => {
  it('protects all three platform routes with JWT, roles, and SUPER_ADMIN', () => {
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformInvoicesController), 'platform/invoices');
    assert.deepEqual(Reflect.getMetadata(ROLES_KEY, PlatformInvoicesController), [RoleName.SUPER_ADMIN]);
    assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, PlatformInvoicesController), [JwtAuthGuard, RolesGuard]);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, PlatformInvoicesController.prototype.issue), 1);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, PlatformInvoicesController.prototype.findAll), 0);
    assert.equal(Reflect.getMetadata(PATH_METADATA, PlatformInvoicesController.prototype.findOne), ':invoiceId');
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, PlatformInvoicesController, 'findOne');
    assert.ok(Object.values(args).some((value: any) => value.pipes?.includes(ParseUUIDPipe)));
  });

  it('allows SUPER_ADMIN and denies tenant roles', () => {
    const guard = new RolesGuard(new Reflector());
    const context = (roles: RoleName[]) => ({
      getHandler: () => PlatformInvoicesController.prototype.findAll,
      getClass: () => PlatformInvoicesController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as never;
    assert.equal(guard.canActivate(context([RoleName.SUPER_ADMIN])), true);
    assert.throws(() => guard.canActivate(context([RoleName.COMPANY_ADMIN])), ForbiddenException);
    assert.throws(() => guard.canActivate(context([RoleName.HR, RoleName.MANAGER, RoleName.EMPLOYEE])), ForbiddenException);
  });

  it('delegates issuance, list, and details without duplicating domain behavior', async () => {
    const paymentId = '00000000-0000-4000-8000-000000000001';
    const actor = { id: 'actor' };
    const expected = { id: 'invoice' };
    const controller = new PlatformInvoicesController(
      { issue: async (id: string, actorId: string) => { assert.equal(id, paymentId); assert.equal(actorId, 'actor'); return expected; } } as never,
      { findAll: async (query: unknown) => query, findOne: async (id: string) => ({ id }) } as never,
    );
    assert.equal(await controller.issue({ paymentId }, actor as never), expected);
    assert.equal(await controller.issue({ paymentId }, actor as never), expected);
    assert.deepEqual(await controller.findAll({ page: 1, limit: 20 } as never), { page: 1, limit: 20 });
    assert.deepEqual(await controller.findOne('invoice'), { id: 'invoice' });
    await assert.rejects(
      () => new ParseUUIDPipe().transform('invalid', { type: 'param' }),
      BadRequestException,
    );
  });

  it('maps domain failures deterministically and redacts unexpected internals', () => {
    const cases: Array<[string, number]> = [
      ['PAYMENT_NOT_FOUND', 404],
      ['COMMERCIAL_MISMATCH', 409],
      ['OWNERSHIP_MISMATCH', 409],
      ['ACTIVATION_LINK_MISMATCH', 409],
      ['BILLING_PROFILE_INCOMPLETE', 422],
      ['BILLING_SETTINGS_MISSING', 422],
      ['SELLER_PROFILE_INCOMPLETE', 422],
      ['SERVICE_PERIOD_INVALID', 422],
    ];
    for (const [code, status] of cases) {
      const mapped = mapInvoiceIssuanceError(new InvoiceIssuanceError(code, `safe ${code}`)) as any;
      assert.equal(mapped.getStatus(), status, code);
    }

    for (const error of [
      new InvoiceIssuanceError('INVALID_ISSUED_AT', 'internal clock invariant leaked'),
      new InvoiceIssuanceError('INVOICE_EVIDENCE_INVALID', 'persisted evidence detail leaked'),
      new InvoiceIssuanceError('SEQUENCE_ALLOCATION_FAILED', 'sequence allocation detail leaked'),
      new InvoiceIssuanceError('FUTURE_UNKNOWN_CODE', 'unknown domain code leaked'),
      new Error('database provider secret stack leaked'),
    ]) {
      const mapped = mapInvoiceIssuanceError(error) as InternalServerErrorException;
      assert.ok(mapped instanceof InternalServerErrorException);
      assert.equal(mapped.getStatus(), 500);
      const response = JSON.stringify(mapped.getResponse());
      assert.match(response, /Invoice issuance failed/);
      assert.doesNotMatch(response, /clock|invariant|FUTURE|unknown|database|provider|secret|stack|leaked/i);
    }
  });
});
