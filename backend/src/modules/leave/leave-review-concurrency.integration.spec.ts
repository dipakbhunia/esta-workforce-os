import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EmploymentType,
  LeaveApprovalAction,
  LeaveRequestStatus,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { LeaveService } from './leave.service';

const enabled = process.env.RUN_LEAVE_REVIEW_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
const notifications = { createLeaveDecisionEmail: async () => ({ created: true }) };

type ReviewStatus = typeof LeaveRequestStatus.APPROVED | typeof LeaveRequestStatus.REJECTED;

class Barrier {
  private arrivals = 0;
  private release!: () => void;
  private readonly ready = new Promise<void>((resolve) => { this.release = resolve; });

  async arrive(): Promise<void> {
    this.arrivals += 1;
    if (this.arrivals === 2) this.release();
    await this.ready;
  }
}

describeDb('PC-G0 PostgreSQL leave decision concurrency', () => {
  const suffix = randomUUID();
  let companyId: string | null = null;
  let leaveTypeId: string;
  let applicantUserId: string;
  let applicantEmployeeId: string;
  let reviewerUserId: string;

  const reviewer = () => ({
    id: reviewerUserId,
    companyId,
    email: `pc-g0-reviewer-${suffix}@example.invalid`,
    firstName: 'PC-G0',
    lastName: 'Reviewer',
    status: UserStatus.ACTIVE,
    roles: [RoleName.HR],
  });

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: { name: `PC-G0 ${suffix}`, slug: `pc-g0-${suffix}` },
      select: { id: true },
    });
    companyId = company.id;
    const [applicant, reviewerUser] = await Promise.all([
      prisma.user.create({ data: {
        companyId,
        email: `pc-g0-applicant-${suffix}@example.invalid`,
        passwordHash: 'integration-only-hash',
        firstName: 'Leave',
        lastName: 'Applicant',
      }, select: { id: true } }),
      prisma.user.create({ data: {
        companyId,
        email: `pc-g0-reviewer-${suffix}@example.invalid`,
        passwordHash: 'integration-only-hash',
        firstName: 'PC-G0',
        lastName: 'Reviewer',
      }, select: { id: true } }),
    ]);
    applicantUserId = applicant.id;
    reviewerUserId = reviewerUser.id;
    const employee = await prisma.employee.create({ data: {
      companyId,
      userId: applicantUserId,
      employeeCode: `PCG0-${suffix.slice(0, 8)}`,
      joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentType: EmploymentType.FULL_TIME,
      workMode: WorkMode.REMOTE,
    }, select: { id: true } });
    applicantEmployeeId = employee.id;
    const leaveType = await prisma.leaveType.create({ data: {
      companyId,
      name: `PC-G0 Annual ${suffix}`,
      code: `PCG0-${suffix}`,
      defaultDays: 12,
      requiresApproval: true,
      managerCanApprove: true,
    }, select: { id: true } });
    leaveTypeId = leaveType.id;
  });

  after(async () => {
    const ownedCompanyId = companyId;
    try {
      if (!ownedCompanyId) return;
      await prisma.auditLog.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveApprovalHistory.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveBalance.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveRequest.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.employee.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveType.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.user.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.company.delete({ where: { id: ownedCompanyId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const [left, right] of [
    [LeaveRequestStatus.APPROVED, LeaveRequestStatus.APPROVED],
    [LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED],
    [LeaveRequestStatus.REJECTED, LeaveRequestStatus.REJECTED],
  ] as const) {
    it(`elects one durable winner for ${left} vs ${right}`, async () => {
      const requestId = await createPendingRequest();
      const usedBefore = (await currentBalance())?.used ?? 0;
      const barrier = new Barrier();
      const clients = [new PrismaClient(), new PrismaClient()];
      await Promise.all(clients.map((client) => client.$connect()));
      try {
        const services = clients.map((client) => new LeaveService(coordinatedPrisma(client, barrier) as never, notifications as never));
        const results = await Promise.allSettled([
          services[0].review(requestId, { status: left }, reviewer()),
          services[1].review(requestId, { status: right }, reviewer()),
        ]);
        const fulfilled = results.filter((result) => result.status === 'fulfilled');
        const rejected = results.filter((result) => result.status === 'rejected');
        assert.equal(fulfilled.length, 1);
        assert.equal(rejected.length, 1);
        assert.ok(rejected[0].status === 'rejected' && rejected[0].reason instanceof BadRequestException);
        assert.equal(rejected[0].reason.message, 'Only pending requests can be reviewed');

        const durable = await decisionEvidence(requestId);
        const winner = durable.request.status as ReviewStatus;
        assert.equal((fulfilled[0] as PromiseFulfilledResult<{ status: ReviewStatus }>).value.status, winner);
        assert.equal(durable.history.length, 1);
        assert.equal(durable.history[0].action, winner === LeaveRequestStatus.APPROVED
          ? LeaveApprovalAction.APPROVED
          : LeaveApprovalAction.REJECTED);
        assert.equal(durable.audits.length, 1);
        assert.equal(durable.audits[0].action, `LEAVE_${winner}`);
        assert.equal(
          (durable.balance?.used ?? 0) - usedBefore,
          winner === LeaveRequestStatus.APPROVED ? 2 : 0,
        );
      } finally {
        await Promise.all(clients.map((client) => client.$disconnect()));
      }
    });
  }

  it('preserves sequential approve/reject and existing stale-decision behavior', async () => {
    const service = new LeaveService(prisma as never, notifications as never);
    const approvedId = await createPendingRequest();
    const rejectedId = await createPendingRequest();
    assert.equal((await service.review(approvedId, { status: LeaveRequestStatus.APPROVED }, reviewer())).status,
      LeaveRequestStatus.APPROVED);
    assert.equal((await service.review(rejectedId, { status: LeaveRequestStatus.REJECTED }, reviewer())).status,
      LeaveRequestStatus.REJECTED);
    await assert.rejects(
      () => service.review(approvedId, { status: LeaveRequestStatus.REJECTED }, reviewer()),
      (error: unknown) => error instanceof BadRequestException && error.message === 'Only pending requests can be reviewed',
    );
  });

  it('rolls back the claim, balance, history, and audit when a later write fails', async () => {
    const requestId = await createPendingRequest();
    const balanceBefore = await currentBalance();
    const functionName = `pc_g0_reject_audit_${suffix.replaceAll('-', '_')}`;
    const triggerName = `${functionName}_trigger`;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
        BEGIN
          IF NEW."entityType" = 'LeaveRequest' AND NEW."entityId" = '${requestId}' THEN
            RAISE EXCEPTION 'PC-G0 audit rollback probe';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER "${triggerName}"
        BEFORE INSERT ON "AuditLog"
        FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
      `);
      const service = new LeaveService(prisma as never, notifications as never);
      await assert.rejects(() => service.review(requestId, { status: LeaveRequestStatus.APPROVED }, reviewer()));
      const durable = await decisionEvidence(requestId);
      assert.equal(durable.request.status, LeaveRequestStatus.PENDING);
      assert.equal(durable.balance?.used ?? 0, balanceBefore?.used ?? 0);
      assert.equal(durable.history.length, 0);
      assert.equal(durable.audits.length, 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
  });

  it('preserves tenant isolation and manager authority', async () => {
    const requestId = await createPendingRequest();
    const service = new LeaveService(prisma as never, notifications as never);
    await assert.rejects(
      () => service.review(requestId, { status: LeaveRequestStatus.APPROVED }, {
        ...reviewer(), companyId: randomUUID(),
      }),
      ForbiddenException,
    );

    const managerUser = await prisma.user.create({ data: {
      companyId,
      email: `pc-g0-manager-${randomUUID()}@example.invalid`,
      passwordHash: 'integration-only-hash', firstName: 'Line', lastName: 'Manager',
    }, select: { id: true, email: true } });
    const managerEmployee = await prisma.employee.create({ data: {
      companyId, userId: managerUser.id, employeeCode: `MGR-${randomUUID()}`,
      joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentType: EmploymentType.FULL_TIME, workMode: WorkMode.REMOTE,
    }, select: { id: true } });
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: managerEmployee.id } });
    const managerRequest = await createPendingRequest();
    try {
      const result = await service.review(managerRequest, { status: LeaveRequestStatus.REJECTED }, {
        id: managerUser.id, companyId, email: managerUser.email, firstName: 'Line', lastName: 'Manager',
        status: UserStatus.ACTIVE, roles: [RoleName.MANAGER],
      });
      assert.equal(result.status, LeaveRequestStatus.REJECTED);
    } finally {
      await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
      await prisma.employee.delete({ where: { id: managerEmployee.id } });
    }
  });

  async function createPendingRequest(): Promise<string> {
    const request = await prisma.leaveRequest.create({ data: {
      companyId,
      employeeId: applicantEmployeeId,
      leaveTypeId,
      startDate: new Date('2027-02-10T00:00:00.000Z'),
      endDate: new Date('2027-02-11T00:00:00.000Z'),
      totalDays: 2,
      status: LeaveRequestStatus.PENDING,
    }, select: { id: true } });
    return request.id;
  }

  async function decisionEvidence(requestId: string) {
    const request = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: requestId } });
    const [history, audits, balance] = await Promise.all([
      prisma.leaveApprovalHistory.findMany({
        where: { leaveRequestId: requestId, action: { in: [LeaveApprovalAction.APPROVED, LeaveApprovalAction.REJECTED] } },
      }),
      prisma.auditLog.findMany({
        where: { entityType: 'LeaveRequest', entityId: requestId, action: { in: ['LEAVE_APPROVED', 'LEAVE_REJECTED'] } },
      }),
      prisma.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: applicantEmployeeId, leaveTypeId, year: 2027 } },
      }),
    ]);
    return { request, history, audits, balance };
  }

  function currentBalance() {
    return prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId: applicantEmployeeId, leaveTypeId, year: 2027 } },
    });
  }
});

function coordinatedPrisma(client: PrismaClient, barrier: Barrier): PrismaClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === '$transaction') {
        return (callback: (tx: unknown) => Promise<unknown>, ...options: unknown[]) =>
          target.$transaction(async (tx) => {
            await barrier.arrive();
            return callback(tx);
          }, ...(options as []));
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
