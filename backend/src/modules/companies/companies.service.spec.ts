import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CompanyStatus, RoleName, UserStatus } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CompanyQueryDto } from './dto/company-query.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const superAdmin = {
  id: 'user-super',
  companyId: null,
  email: 'super@example.com',
  firstName: 'Super',
  lastName: 'Admin',
  status: UserStatus.ACTIVE,
  roles: [RoleName.SUPER_ADMIN],
};

const companyAdmin = {
  ...superAdmin,
  id: 'user-company',
  companyId: 'company-1',
  roles: [RoleName.COMPANY_ADMIN],
};

const company = {
  id: 'company-1',
  name: 'Acme Corporation',
  slug: 'acme',
  primaryEmail: 'people@acme.example',
  phone: '+91 98765 43210',
  website: 'https://acme.example',
  country: 'India',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  address: 'Mumbai',
  status: CompanyStatus.ACTIVE,
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
  updatedAt: new Date('2026-08-11T00:00:00.000Z'),
  deletedAt: null,
  _count: { branches: 2, departments: 3, designations: 4, employees: 20, users: 21 },
};

function serviceWith(prisma: Record<string, unknown>) {
  return new CompaniesService(prisma as never);
}

function updateHarness() {
  let updateData: Record<string, unknown> | undefined;
  const tx = {
    company: {
      update: async (args: { data: Record<string, unknown> }) => {
        updateData = args.data;
        return { ...company, ...args.data };
      },
    },
    auditLog: { create: async () => ({ id: 'audit-1' }) },
  };
  const service = serviceWith({
    company: { findFirst: async () => company },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  });

  return {
    service,
    updateData: () => updateData,
  };
}

describe('CompaniesService', () => {
  it('applies search and status before pagination and uses the same filtered total', async () => {
    let findWhere: unknown;
    let countWhere: unknown;
    const service = serviceWith({
      company: {
        findMany: async (args: { where: unknown }) => { findWhere = args.where; return [company]; },
        count: async (args: { where: unknown }) => { countWhere = args.where; return 1; },
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    const result = await service.findAll({ page: 1, limit: 20, search: 'acme', status: CompanyStatus.ACTIVE }, superAdmin);

    assert.deepEqual(findWhere, countWhere);
    assert.equal((findWhere as { status: CompanyStatus }).status, CompanyStatus.ACTIVE);
    assert.equal(result.meta.total, 1);
    assert.equal(result.data[0].counts.employees, 20);
  });

  it('restricts permitted non-super list access to the actor company', async () => {
    let where: unknown;
    const service = serviceWith({
      company: {
        findMany: async (args: { where: unknown }) => { where = args.where; return [company]; },
        count: async () => 1,
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    await service.findAll({ page: 1, limit: 20 }, companyAdmin);
    assert.equal((where as { id: string }).id, 'company-1');
  });

  it('blocks cross-tenant detail access', async () => {
    const service = serviceWith({});
    await assert.rejects(() => service.findOne('company-2', companyAdmin), ForbiddenException);
  });

  it('persists trimmed profile metadata and writes create audit history', async () => {
    let createData: unknown;
    let auditData: unknown;
    const tx = {
      company: { create: async (args: { data: unknown }) => { createData = args.data; return company; } },
      auditLog: { create: async (args: { data: unknown }) => { auditData = args.data; return { id: 'audit-1' }; } },
    };
    const service = serviceWith({ $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx) });

    const result = await service.create({
      name: ' Acme Corporation ',
      slug: 'acme',
      primaryEmail: ' people@acme.example ',
      timezone: 'Asia/Kolkata',
      currency: 'inr',
    }, superAdmin);

    assert.equal((createData as { name: string }).name, 'Acme Corporation');
    assert.equal((createData as { primaryEmail: string }).primaryEmail, 'people@acme.example');
    assert.equal((createData as { currency: string }).currency, 'INR');
    assert.equal((auditData as { action: string }).action, 'COMPANY_CREATED');
    assert.equal(result.timezone, 'Asia/Kolkata');
  });

  it('writes update and status-change audit entries without storing field values', async () => {
    const audits: Array<{ data: Record<string, unknown> }> = [];
    const tx = {
      company: { update: async () => ({ ...company, status: CompanyStatus.SUSPENDED }) },
      auditLog: { create: async (args: { data: Record<string, unknown> }) => { audits.push(args); return { id: String(audits.length) }; } },
    };
    const service = serviceWith({
      company: { findFirst: async () => company },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await service.update('company-1', { status: CompanyStatus.SUSPENDED, address: ' New address ' }, companyAdmin);

    assert.deepEqual(audits.map((entry) => entry.data.action), ['COMPANY_UPDATED', 'COMPANY_STATUS_CHANGED']);
    assert.deepEqual((audits[0].data.metadata as { changedFields: string[] }).changedFields.sort(), ['address', 'status']);
    assert.equal(JSON.stringify(audits[0]).includes('New address'), false);
  });

  it('leaves name unchanged when it is omitted from an update', async () => {
    const harness = updateHarness();

    await harness.service.update('company-1', { address: 'Pune' }, companyAdmin);

    assert.equal(Object.hasOwn(harness.updateData() ?? {}, 'name'), false);
  });

  it('trims and persists a valid company name update', async () => {
    const harness = updateHarness();

    await harness.service.update('company-1', { name: ' Acme Global ' }, companyAdmin);

    assert.equal(harness.updateData()?.name, 'Acme Global');
  });

  it('rejects null and blank company names without a TypeError', async () => {
    for (const name of [null, '   ']) {
      const harness = updateHarness();
      await assert.rejects(
        () => harness.service.update(
          'company-1',
          { name } as unknown as UpdateCompanyDto,
          companyAdmin,
        ),
        BadRequestException,
      );
    }
  });

  it('leaves slug unchanged when it is omitted from an update', async () => {
    const harness = updateHarness();

    await harness.service.update('company-1', { address: 'Pune' }, companyAdmin);

    assert.equal(Object.hasOwn(harness.updateData() ?? {}, 'slug'), false);
  });

  it('trims and persists a valid company slug update', async () => {
    const harness = updateHarness();

    await harness.service.update('company-1', { slug: ' acme-global ' }, companyAdmin);

    assert.equal(harness.updateData()?.slug, 'acme-global');
  });

  it('rejects a null slug without a TypeError', async () => {
    const harness = updateHarness();

    await assert.rejects(
      () => harness.service.update(
        'company-1',
        { slug: null } as unknown as UpdateCompanyDto,
        companyAdmin,
      ),
      BadRequestException,
    );
  });

  it('leaves status unchanged when it is omitted from an update', async () => {
    const harness = updateHarness();

    await harness.service.update('company-1', { address: 'Pune' }, companyAdmin);

    assert.equal(Object.hasOwn(harness.updateData() ?? {}, 'status'), false);
  });

  it('persists a valid company status update', async () => {
    const harness = updateHarness();

    await harness.service.update(
      'company-1',
      { status: CompanyStatus.SUSPENDED },
      companyAdmin,
    );

    assert.equal(harness.updateData()?.status, CompanyStatus.SUSPENDED);
  });

  it('rejects null and invalid company statuses safely', async () => {
    for (const status of [null, 'DELETED']) {
      const harness = updateHarness();
      await assert.rejects(
        () => harness.service.update(
          'company-1',
          { status } as unknown as UpdateCompanyDto,
          companyAdmin,
        ),
        BadRequestException,
      );
    }
  });

  it('leaves timezone unchanged when it is omitted from an update', async () => {
    let updateData: Record<string, unknown> | undefined;
    const tx = {
      company: { update: async (args: { data: Record<string, unknown> }) => { updateData = args.data; return company; } },
      auditLog: { create: async () => ({ id: 'audit-1' }) },
    };
    const service = serviceWith({
      company: { findFirst: async () => company },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await service.update('company-1', { address: 'Pune' }, companyAdmin);

    assert.equal(Object.hasOwn(updateData ?? {}, 'timezone'), false);
  });

  it('trims and persists a valid timezone update', async () => {
    let updateData: Record<string, unknown> | undefined;
    const tx = {
      company: { update: async (args: { data: Record<string, unknown> }) => { updateData = args.data; return { ...company, timezone: String(args.data.timezone) }; } },
      auditLog: { create: async () => ({ id: 'audit-1' }) },
    };
    const service = serviceWith({
      company: { findFirst: async () => company },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await service.update('company-1', { timezone: ' Europe/London ' }, companyAdmin);

    assert.equal(updateData?.timezone, 'Europe/London');
  });

  it('preserves intentional null clearing for nullable profile fields', async () => {
    let updateData: Record<string, unknown> | undefined;
    const tx = {
      company: { update: async (args: { data: Record<string, unknown> }) => { updateData = args.data; return { ...company, address: null }; } },
      auditLog: { create: async () => ({ id: 'audit-1' }) },
    };
    const service = serviceWith({
      company: { findFirst: async () => company },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await service.update('company-1', { address: null }, companyAdmin);

    assert.equal(updateData?.address, null);
  });

  it('archives only the company, preserves tenant records, and writes audit history', async () => {
    let updateData: unknown;
    let auditAction: unknown;
    const tx = {
      company: { update: async (args: { data: unknown }) => { updateData = args.data; return { ...company, status: CompanyStatus.SUSPENDED }; } },
      auditLog: { create: async (args: { data: { action: string } }) => { auditAction = args.data.action; return { id: 'audit-1' }; } },
    };
    const service = serviceWith({
      company: { findFirst: async () => company },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await service.remove('company-1', superAdmin);

    assert.equal((updateData as { status: CompanyStatus }).status, CompanyStatus.SUSPENDED);
    assert.ok((updateData as { deletedAt: Date }).deletedAt instanceof Date);
    assert.equal(auditAction, 'COMPANY_ARCHIVED');
  });

  it('rejects invalid timezone and invalid status query values through DTO validation', async () => {
    const createDto = Object.assign(new CreateCompanyDto(), { name: 'Acme', slug: 'acme', timezone: 'Mars/Olympus' });
    const queryDto = Object.assign(new CompanyQueryDto(), { status: 'DELETED' });
    const [createErrors, queryErrors] = await Promise.all([validate(createDto), validate(queryDto)]);

    assert.equal(createErrors.some((error) => error.property === 'timezone'), true);
    assert.equal(queryErrors.some((error) => error.property === 'status'), true);
  });

  it('rejects null, empty, and invalid timezone updates through DTO validation', async () => {
    const values = [null, '', 'Mars/Olympus'];
    const errors = await Promise.all(values.map((timezone) => validate(
      plainToInstance(UpdateCompanyDto, { timezone }),
    )));

    assert.equal(errors.every((result) => result.some((error) => error.property === 'timezone')), true);
  });

  it('rejects null for every non-null Company update field', async () => {
    const dto = plainToInstance(UpdateCompanyDto, {
      name: null,
      slug: null,
      status: null,
      timezone: null,
    });
    const errors = await validate(dto);

    assert.deepEqual(
      errors.map((error) => error.property).sort(),
      ['name', 'slug', 'status', 'timezone'],
    );
  });

  it('rejects blank or invalid name, slug, and status update values', async () => {
    const blankDto = plainToInstance(UpdateCompanyDto, {
      name: '',
      slug: '',
      status: 'DELETED',
    });
    const errors = await validate(blankDto);

    assert.deepEqual(
      errors.map((error) => error.property).sort(),
      ['name', 'slug', 'status'],
    );
  });
});
