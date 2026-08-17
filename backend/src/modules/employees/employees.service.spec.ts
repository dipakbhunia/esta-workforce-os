import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import {
  EmployeeStatus,
  EmploymentType,
  RoleName,
  SubscriptionStatus,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { SeatUsageService } from '../usage-seats/seat-usage.service';
import { CommercialSeatSource } from '../usage-seats/usage-seats.types';
import { EmployeesService } from './employees.service';

const actor = {
  id: 'admin-1',
  companyId: 'company-1',
  email: 'admin@example.com',
  firstName: 'Company',
  lastName: 'Admin',
  status: UserStatus.ACTIVE,
  roles: [RoleName.COMPANY_ADMIN],
};
const dto = {
  userId: 'user-1',
  employeeCode: 'EMP-1',
  joiningDate: '2027-01-01',
  employmentType: EmploymentType.FULL_TIME,
  workMode: WorkMode.HYBRID,
  status: EmployeeStatus.ACTIVE,
};
const employee = {
  id: 'employee-1',
  userId: dto.userId,
  companyId: actor.companyId,
  branchId: null,
  departmentId: null,
  designationId: null,
  shiftId: null,
  reportingManagerId: null,
  employeeCode: dto.employeeCode,
  joiningDate: new Date('2027-01-01'),
  employmentType: dto.employmentType,
  workMode: dto.workMode,
  status: EmployeeStatus.ACTIVE,
  deletedAt: null,
};

function harness(options: { currentStatus?: EmployeeStatus; used?: number; capacity?: number | null; commercialStatus?: SubscriptionStatus } = {}) {
  const events: string[] = [];
  let current = { ...employee, status: options.currentStatus ?? EmployeeStatus.ACTIVE };
  const tx = {
    user: {
      findFirst: async () => ({ id: dto.userId }),
      update: async () => ({}),
    },
    employee: {
      count: async () => options.used ?? 0,
      findFirst: async () => current,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push('create');
        current = { ...current, ...data } as typeof current;
        return current;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(`update:${String(data.status ?? 'metadata')}`);
        current = { ...current, ...data } as typeof current;
        return current;
      },
      updateMany: async () => ({ count: 0 }),
    },
  };
  const prisma = {
    user: { findFirst: async () => ({ id: dto.userId }) },
    employee: { findFirst: async () => current },
    branch: { findFirst: async () => null },
    department: { findFirst: async () => null },
    designation: { findFirst: async () => null },
    shift: { findFirst: async () => null },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  };
  const access = {
    source: options.capacity === null ? CommercialSeatSource.NONE : CommercialSeatSource.SUBSCRIPTION,
    referenceId: options.capacity === null ? null : 'subscription-1',
    commercialStatus: options.capacity === null ? null : options.commercialStatus ?? SubscriptionStatus.ACTIVE,
    plan: options.capacity === null ? null : { id: 'plan-1', code: 'GROWTH', name: 'Growth' },
    capacity: options.capacity === undefined ? 10 : options.capacity,
    allocationAllowed: options.capacity !== null && options.commercialStatus !== SubscriptionStatus.SUSPENDED,
  };
  const policy = new SeatUsageService({} as never);
  const seatUsage = {
    lockCompany: async () => { events.push('lock'); },
    countUsedSeats: async () => { events.push('count'); return options.used ?? 0; },
    assertPositiveAllocation: policy.assertPositiveAllocation.bind(policy),
  };
  const commercial = { resolve: async () => { events.push('resolve'); return access; } };
  return { service: new EmployeesService(prisma as never, commercial as never, seatUsage as never), events, employee: () => current };
}

describe('EmployeesService seat enforcement', () => {
  it('locks, counts, and validates before creating an ACTIVE future-dated Employee', async () => {
    const h = harness({ used: 9, capacity: 10 });
    await h.service.create(dto, actor);
    assert.deepEqual(h.events.slice(0, 5), ['lock', 'resolve', 'count', 'create']);
  });

  it('rejects ACTIVE creation at capacity and does not mutate', async () => {
    const h = harness({ used: 10, capacity: 10 });
    await assert.rejects(() => h.service.create(dto, actor), ConflictException);
    assert.ok(!h.events.includes('create'));
  });

  it('rejects ACTIVE creation when over limit, suspended, or without commercial access', async () => {
    for (const options of [
      { used: 11, capacity: 10 },
      { used: 1, capacity: 10, commercialStatus: SubscriptionStatus.SUSPENDED },
      { used: 0, capacity: null },
    ]) {
      const h = harness(options);
      await assert.rejects(() => h.service.create(dto, actor), ConflictException);
      assert.ok(!h.events.includes('create'));
    }
  });

  it('allows INACTIVE creation without commercial capacity checks', async () => {
    const h = harness({ capacity: null });
    await h.service.create({ ...dto, status: EmployeeStatus.INACTIVE }, actor);
    assert.deepEqual(h.events, ['create']);
  });

  it('checks capacity for INACTIVE to ACTIVE and orders the lock before the count', async () => {
    const h = harness({ currentStatus: EmployeeStatus.INACTIVE, used: 9, capacity: 10 });
    await h.service.update(employee.id, { status: EmployeeStatus.ACTIVE }, actor);
    assert.deepEqual(h.events.slice(0, 4), ['lock', 'resolve', 'count', 'update:ACTIVE']);
  });

  it('always allows ACTIVE reclamation and metadata updates without a positive allocation check', async () => {
    const reclaim = harness({ currentStatus: EmployeeStatus.ACTIVE, used: 12, capacity: 10 });
    await reclaim.service.update(employee.id, { status: EmployeeStatus.INACTIVE }, actor);
    assert.deepEqual(reclaim.events, ['lock', 'update:INACTIVE']);

    const terminate = harness({ currentStatus: EmployeeStatus.ACTIVE, used: 12, capacity: 10 });
    await terminate.service.update(employee.id, { status: EmployeeStatus.TERMINATED }, actor);
    assert.deepEqual(terminate.events, ['lock', 'update:TERMINATED']);

    const metadata = harness({ currentStatus: EmployeeStatus.ACTIVE, used: 12, capacity: 10 });
    await metadata.service.update(employee.id, { phone: '+91 98765 43210' }, actor);
    assert.deepEqual(metadata.events, ['lock', 'update:metadata']);
  });

  it('allows soft-delete as reclamation without allocation validation', async () => {
    const h = harness({ currentStatus: EmployeeStatus.ACTIVE, used: 12, capacity: 10 });
    await h.service.remove(employee.id, actor);
    assert.deepEqual(h.events, ['lock', 'update:TERMINATED']);
    assert.equal(h.employee().status, EmployeeStatus.TERMINATED);
    assert.ok(h.employee().deletedAt instanceof Date);
  });
});
