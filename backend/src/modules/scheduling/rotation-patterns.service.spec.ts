import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { RoleName, RosterDayType } from '@prisma/client';
import { RotationPatternsService } from './rotation-patterns.service';

const actor = {
  id: 'user-1',
  companyId: 'company-1',
  email: 'hr@example.com',
  firstName: 'HR',
  lastName: 'User',
  status: 'ACTIVE',
  roles: [RoleName.HR],
} as const;

function serviceWith(prisma: Record<string, unknown>) {
  return new RotationPatternsService(prisma as never);
}

const pattern = {
  id: 'pattern-1',
  companyId: 'company-1',
  branchId: null,
  departmentId: null,
  name: 'Four On Two Off',
  code: 'FOUR_ON_TWO_OFF',
  description: null,
  timezone: 'Asia/Kolkata',
  cycleLengthDays: 4,
  anchorDate: new Date('2026-08-10T00:00:00.000Z'),
  enabled: true,
  version: 1,
  notes: null,
  createdById: 'user-1',
  updatedById: 'user-1',
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  deletedAt: null,
  branch: null,
  department: null,
  days: [
    { id: 'day-1', patternId: 'pattern-1', companyId: 'company-1', sequence: 1, dayType: RosterDayType.WORKING, shiftId: 'shift-1', shiftName: 'Morning', shiftCode: 'MOR', shiftStartTime: '09:00', shiftEndTime: '18:00', shiftTimezone: 'Asia/Kolkata', label: null, notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdById: 'user-1', updatedById: 'user-1', shift: { id: 'shift-1', name: 'Morning', code: 'MOR', startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata' } },
    { id: 'day-2', patternId: 'pattern-1', companyId: 'company-1', sequence: 2, dayType: RosterDayType.WORKING, shiftId: 'shift-1', shiftName: 'Morning', shiftCode: 'MOR', shiftStartTime: '09:00', shiftEndTime: '18:00', shiftTimezone: 'Asia/Kolkata', label: null, notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdById: 'user-1', updatedById: 'user-1', shift: { id: 'shift-1', name: 'Morning', code: 'MOR', startTime: '09:00', endTime: '18:00', timezone: 'Asia/Kolkata' } },
    { id: 'day-3', patternId: 'pattern-1', companyId: 'company-1', sequence: 3, dayType: RosterDayType.WEEKLY_OFF, shiftId: null, shiftName: null, shiftCode: null, shiftStartTime: null, shiftEndTime: null, shiftTimezone: null, label: 'Off', notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdById: 'user-1', updatedById: 'user-1', shift: null },
    { id: 'day-4', patternId: 'pattern-1', companyId: 'company-1', sequence: 4, dayType: RosterDayType.NO_SHIFT, shiftId: null, shiftName: null, shiftCode: null, shiftStartTime: null, shiftEndTime: null, shiftTimezone: null, label: 'No Shift', notes: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null, createdById: 'user-1', updatedById: 'user-1', shift: null },
  ],
};

describe('RotationPatternsService', () => {
  it('rejects non-contiguous rotation sequences before writing data', async () => {
    const service = serviceWith({});
    await assert.rejects(
      () => service.create({ name: 'Broken', code: 'BROKEN', timezone: 'UTC', cycleLengthDays: 3, enabled: true, days: [
        { sequence: 1, dayType: 'NO_SHIFT' },
        { sequence: 2, dayType: 'NO_SHIFT' },
        { sequence: 4, dayType: 'NO_SHIFT' },
      ] }, actor as never),
      BadRequestException,
    );
  });

  it('uses positive modulo so dates before the anchor resolve deterministically', async () => {
    const service = serviceWith({ rotationPattern: { findFirst: async () => pattern } });
    const result = await service.preview('pattern-1', { dateFrom: '2026-08-09', numberOfDays: 3 }, actor as never);
    assert.deepEqual(result.data.map((item) => item.sequence), [4, 1, 2]);
    assert.equal(result.data[0].dayType, RosterDayType.NO_SHIFT);
  });

  it('rejects preview ranges over the safe 180 day limit', async () => {
    const service = serviceWith({ rotationPattern: { findFirst: async () => pattern } });
    await assert.rejects(() => service.preview('pattern-1', { dateFrom: '2026-08-01', dateTo: '2027-02-01' }, actor as never), BadRequestException);
  });
});