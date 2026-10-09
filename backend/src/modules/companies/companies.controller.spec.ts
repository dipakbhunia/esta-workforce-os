import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RoleName, UserStatus } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { CompaniesController } from './companies.controller';
import { UpdateDesignatedLeaveApproverDto } from './dto/update-designated-leave-approver.dto';
import { UpdateDesignatedAttendanceApproverDto } from './dto/update-designated-attendance-approver.dto';
import { UpdateBillingContactDto } from './dto/billing-contact.dto';

const actor = {
  id: '10000000-0000-4000-8000-000000000001',
  companyId: '20000000-0000-4000-8000-000000000001',
  email: 'admin@example.invalid',
  firstName: 'Company',
  lastName: 'Admin',
  status: UserStatus.ACTIVE,
  roles: [RoleName.COMPANY_ADMIN],
};

describe('CompaniesController designated leave approver settings', () => {
  it('delegates GET and PATCH with authenticated authority only', async () => {
    const calls: unknown[][] = [];
    const response = {
      designatedLeaveApproverUserId: null,
      designatedLeaveApprover: null,
    };
    const controller = new CompaniesController({
      getDesignatedLeaveApprover: async (...args: unknown[]) => { calls.push(args); return response; },
      updateDesignatedLeaveApprover: async (...args: unknown[]) => { calls.push(args); return response; },
    } as never);
    const dto = { designatedLeaveApproverUserId: null };

    assert.deepEqual(await controller.getDesignatedLeaveApprover(actor), response);
    assert.deepEqual(await controller.updateDesignatedLeaveApprover(dto, actor), response);
    assert.deepEqual(calls, [[actor], [dto, actor]]);
  });

  it('declares COMPANY_ADMIN as the exact endpoint role authority', () => {
    for (const method of ['getDesignatedLeaveApprover', 'updateDesignatedLeaveApprover'] as const) {
      assert.deepEqual(
        Reflect.getMetadata(ROLES_KEY, CompaniesController.prototype[method]),
        [RoleName.COMPANY_ADMIN],
      );
    }
  });

  it('requires a present null or UUID value and rejects unrelated fields', async () => {
    const valid = [
      { designatedLeaveApproverUserId: null },
      { designatedLeaveApproverUserId: '10000000-0000-4000-8000-000000000001' },
    ];
    for (const input of valid) {
      assert.deepEqual(await validate(plainToInstance(UpdateDesignatedLeaveApproverDto, input)), []);
    }
    for (const input of [{}, { designatedLeaveApproverUserId: 'not-a-uuid' }]) {
      assert.ok((await validate(plainToInstance(UpdateDesignatedLeaveApproverDto, input))).length > 0);
    }
  });

  it('exposes no client-controlled company identifier in the PATCH DTO', () => {
    const dto = plainToInstance(UpdateDesignatedLeaveApproverDto, {
      designatedLeaveApproverUserId: null,
      companyId: '30000000-0000-4000-8000-000000000001',
    });
    return validate(dto, { whitelist: true, forbidNonWhitelisted: true }).then((errors) => {
      assert.deepEqual(errors.map((error) => error.property), ['companyId']);
    });
  });
});

describe('CompaniesController designated attendance approver settings', () => {
  it('delegates GET and PATCH and declares COMPANY_ADMIN authority', async () => {
    const calls: unknown[][] = [];
    const response = { designatedAttendanceApproverUserId: null, designatedAttendanceApprover: null };
    const controller = new CompaniesController({
      getDesignatedAttendanceApprover: async (...args: unknown[]) => { calls.push(args); return response; },
      updateDesignatedAttendanceApprover: async (...args: unknown[]) => { calls.push(args); return response; },
    } as never);
    const dto = { designatedAttendanceApproverUserId: null };
    assert.deepEqual(await controller.getDesignatedAttendanceApprover(actor), response);
    assert.deepEqual(await controller.updateDesignatedAttendanceApprover(dto, actor), response);
    assert.deepEqual(calls, [[actor], [dto, actor]]);
    for (const method of ['getDesignatedAttendanceApprover', 'updateDesignatedAttendanceApprover'] as const) {
      assert.deepEqual(Reflect.getMetadata(ROLES_KEY, CompaniesController.prototype[method]), [RoleName.COMPANY_ADMIN]);
    }
  });

  it('accepts only a present null or UUID attendance approver value', async () => {
    for (const input of [
      { designatedAttendanceApproverUserId: null },
      { designatedAttendanceApproverUserId: '10000000-0000-4000-8000-000000000001' },
    ]) assert.deepEqual(await validate(plainToInstance(UpdateDesignatedAttendanceApproverDto, input)), []);
    for (const input of [{}, { designatedAttendanceApproverUserId: 'invalid' }]) {
      assert.ok((await validate(plainToInstance(UpdateDesignatedAttendanceApproverDto, input))).length > 0);
    }
  });
});

describe('CompaniesController Billing Contact settings', () => {
  it('delegates tenant-scoped endpoints and declares exact role authority', async () => {
    const calls: unknown[][] = [];
    const response = { companyId: actor.companyId, billingProfileExists: true, billingContactUserId: null, billingContact: null };
    const controller = new CompaniesController({
      getBillingContact: async (...args: unknown[]) => { calls.push(args); return response; },
      listEligibleBillingContacts: async (...args: unknown[]) => { calls.push(args); return []; },
      updateBillingContact: async (...args: unknown[]) => { calls.push(args); return response; },
    } as never);
    const query = { search: 'Alice' };
    const dto = { billingContactUserId: null };

    assert.deepEqual(await controller.getBillingContact(actor.companyId, actor), response);
    assert.deepEqual(await controller.listEligibleBillingContacts(actor.companyId, query, actor), []);
    assert.deepEqual(await controller.updateBillingContact(actor.companyId, dto, actor), response);
    assert.deepEqual(calls, [[actor.companyId, actor], [actor.companyId, query, actor], [actor.companyId, dto, actor]]);
    for (const method of ['getBillingContact', 'listEligibleBillingContacts', 'updateBillingContact'] as const) {
      assert.deepEqual(
        Reflect.getMetadata(ROLES_KEY, CompaniesController.prototype[method]),
        [RoleName.SUPER_ADMIN, RoleName.COMPANY_ADMIN],
      );
    }
  });

  it('requires a present null or UUID and rejects client-controlled company identifiers', async () => {
    for (const input of [
      { billingContactUserId: null },
      { billingContactUserId: '10000000-0000-4000-8000-000000000001' },
    ]) assert.deepEqual(await validate(plainToInstance(UpdateBillingContactDto, input)), []);
    for (const input of [{}, { billingContactUserId: 'invalid' }]) {
      assert.ok((await validate(plainToInstance(UpdateBillingContactDto, input))).length > 0);
    }
    const errors = await validate(plainToInstance(UpdateBillingContactDto, {
      billingContactUserId: null,
      companyId: actor.companyId,
    }), { whitelist: true, forbidNonWhitelisted: true });
    assert.deepEqual(errors.map((error) => error.property), ['companyId']);
  });
});
