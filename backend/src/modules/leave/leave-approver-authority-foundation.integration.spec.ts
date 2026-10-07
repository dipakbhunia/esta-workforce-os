import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  EmploymentType,
  LeaveRequestStatus,
  Prisma,
  PrismaClient,
  WorkMode,
} from '@prisma/client';

const enabled = process.env.RUN_LEAVE_APPROVER_FOUNDATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-I0A PostgreSQL Leave approver authority foundation', () => {
  const suffix = randomUUID();
  let companyId: string | null = null;
  let employeeId: string | null = null;
  let leaveTypeId: string | null = null;
  const userIds: string[] = [];
  const requestIds: string[] = [];

  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    try {
      if (companyId) {
        await prisma.company.updateMany({
          where: { id: companyId },
          data: { designatedLeaveApproverUserId: null },
        });
      }
      if (requestIds.length) {
        await prisma.leaveRequest.deleteMany({ where: { id: { in: requestIds } } });
      }
      if (employeeId) {
        await prisma.employee.deleteMany({ where: { id: employeeId } });
      }
      if (leaveTypeId) {
        await prisma.leaveType.deleteMany({ where: { id: leaveTypeId } });
      }
      if (userIds.length) {
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      if (companyId) {
        await prisma.company.deleteMany({ where: { id: companyId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('enforces versioned authority, restrictive references, index order, and nullable legacy defaults', async () => {
    const company = await prisma.company.create({
      data: { name: `PC-I0A ${suffix}`, slug: `pc-i0a-${suffix}` },
      select: { id: true, designatedLeaveApproverUserId: true },
    });
    companyId = company.id;
    assert.equal(company.designatedLeaveApproverUserId, null);

    const applicant = await createOwnedUser('applicant');
    const designated = await createOwnedUser('designated');
    const assigned = await createOwnedUser('assigned');

    // These single-column FKs protect identity and deletion only. Same-tenant
    // ownership is intentionally revalidated by the future PC-I0B/PC-I0C services.

    employeeId = (await prisma.employee.create({
      data: {
        companyId,
        userId: applicant.id,
        employeeCode: `PCI0A-${suffix.slice(0, 8)}`,
        joiningDate: new Date('2026-01-01T00:00:00.000Z'),
        employmentType: EmploymentType.FULL_TIME,
        workMode: WorkMode.REMOTE,
      },
      select: { id: true },
    })).id;
    leaveTypeId = (await prisma.leaveType.create({
      data: {
        companyId,
        name: `PC-I0A Leave ${suffix}`,
        code: `PCI0A-${suffix.slice(0, 8)}`,
        requiresApproval: true,
      },
      select: { id: true },
    })).id;

    await prisma.company.update({
      where: { id: companyId },
      data: { designatedLeaveApproverUserId: designated.id },
    });
    await assert.rejects(
      () => prisma.user.delete({ where: { id: designated.id } }),
      isForeignKeyRestriction,
    );

    const legacy = await createRequest({});
    assert.equal(legacy.assignedApproverUserId, null);
    assert.equal(legacy.approvalAuthorityVersion, null);

    const versioned = await createRequest({
      assignedApproverUserId: assigned.id,
      approvalAuthorityVersion: 1,
    });
    assert.equal(versioned.assignedApproverUserId, assigned.id);
    assert.equal(versioned.approvalAuthorityVersion, 1);

    await assert.rejects(() => createRequest({ approvalAuthorityVersion: 1 }));
    await assert.rejects(() => createRequest({ assignedApproverUserId: assigned.id }));
    await assert.rejects(() => createRequest({
      assignedApproverUserId: assigned.id,
      approvalAuthorityVersion: 2,
    }));
    await assert.rejects(
      () => prisma.user.delete({ where: { id: assigned.id } }),
      isForeignKeyRestriction,
    );

    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'LeaveRequest'
        AND indexname = 'LeaveRequest_companyId_assignedApproverUserId_status_idx'
    `;
    assert.equal(indexes.length, 1);
    assert.match(
      indexes[0].indexdef,
      /\("companyId", "assignedApproverUserId", status\)$/,
    );

    const constraints = await prisma.$queryRaw<Array<{ conname: string; confdeltype: string }>>`
      SELECT conname, confdeltype::text
      FROM pg_constraint
      WHERE conname IN (
        'Company_designatedLeaveApproverUserId_fkey',
        'LeaveRequest_assignedApproverUserId_fkey',
        'LeaveRequest_approval_authority_consistency_check'
      )
    `;
    assert.equal(constraints.length, 3);
    assert.equal(
      constraints.find((row) => row.conname === 'Company_designatedLeaveApproverUserId_fkey')?.confdeltype,
      'r',
    );
    assert.equal(
      constraints.find((row) => row.conname === 'LeaveRequest_assignedApproverUserId_fkey')?.confdeltype,
      'r',
    );
    assert.ok(constraints.some((row) => row.conname === 'LeaveRequest_approval_authority_consistency_check'));
  });

  async function createOwnedUser(label: string) {
    const user = await prisma.user.create({
      data: {
        companyId: companyId!,
        email: `pc-i0a-${label}-${suffix}@example.invalid`,
        passwordHash: 'integration-only-hash',
        firstName: 'PC-I0A',
        lastName: label,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user;
  }

  async function createRequest(authority: {
    assignedApproverUserId?: string;
    approvalAuthorityVersion?: number;
  }) {
    const id = randomUUID();
    try {
      const request = await prisma.leaveRequest.create({
        data: {
          id,
          companyId: companyId!,
          employeeId: employeeId!,
          leaveTypeId: leaveTypeId!,
          startDate: new Date('2027-01-01T00:00:00.000Z'),
          endDate: new Date('2027-01-01T00:00:00.000Z'),
          totalDays: 1,
          status: LeaveRequestStatus.PENDING,
          ...authority,
        },
        select: {
          id: true,
          assignedApproverUserId: true,
          approvalAuthorityVersion: true,
        },
      });
      requestIds.push(request.id);
      return request;
    } catch (error) {
      const persisted = await prisma.leaveRequest.findUnique({
        where: { id },
        select: { id: true },
      });
      if (persisted) requestIds.push(persisted.id);
      throw error;
    }
  }
});

function isForeignKeyRestriction(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}
