import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RoleName, UserStatus } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { CompaniesController } from './companies.controller';
import { UpdateDesignatedLeaveApproverDto } from './dto/update-designated-leave-approver.dto';
import { UpdateDesignatedAttendanceApproverDto } from './dto/update-designated-attendance-approver.dto';

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
