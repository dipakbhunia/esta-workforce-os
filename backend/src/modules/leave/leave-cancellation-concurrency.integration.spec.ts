import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  EmployeeStatus,
  EmploymentType,
  LeaveApprovalAction,
  LeaveRequestStatus,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { LeaveService } from './leave.service';

const enabled = process.env.RUN_LEAVE_CANCELLATION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
const notifications = {
  createLeaveDecisionEmail: async () => ({ created: true }),
  createLeaveCancelledEmails: async () => ({ created: 2 }),
};

class Barrier {
  private arrivals = 0;
  private release!: () => void;
  private readonly ready = new Promise<void>((resolve) => { this.release = resolve; });
  async arrive() { this.arrivals += 1; if (this.arrivals === 2) this.release(); await this.ready; }
}

describeDb('PC-J PostgreSQL Leave cancellation correctness', () => {
  const suffix = randomUUID();
  let companyId: string | null = null;
  let applicantUserId: string;
  let applicantEmployeeId: string;
  let reviewerUserId: string;
  let adminUserId: string;
  let managerUserId: string;
  let managerEmployeeId: string;
  let assignedOnlyUserId: string;
  let leaveTypeId: string;

  const actor = (id: string, role: RoleName, actorCompanyId = companyId) => ({
    id, companyId: actorCompanyId, email: `${id}@example.invalid`, firstName: 'PC-J', lastName: role,
    status: UserStatus.ACTIVE, roles: [role],
  });

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({ data: { name: `PC-J ${suffix}`, slug: `pc-j-${suffix}` }, select: { id: true } });
    companyId = company.id;
    const employeeRole = await createRole('employee', RoleName.EMPLOYEE);
    const hrRole = await createRole('hr', RoleName.HR);
    const adminRole = await createRole('admin', RoleName.COMPANY_ADMIN);
    const managerRole = await createRole('manager', RoleName.MANAGER);
    applicantUserId = await createUser('applicant', employeeRole);
    reviewerUserId = await createUser('reviewer', hrRole);
    adminUserId = await createUser('admin', adminRole);
    managerUserId = await createUser('manager', managerRole);
    assignedOnlyUserId = await createUser('assigned-only', employeeRole);
    managerEmployeeId = await createEmployee(managerUserId, 'MGR');
    applicantEmployeeId = await createEmployee(applicantUserId, 'APP', managerEmployeeId);
    await createEmployee(assignedOnlyUserId, 'ASN');
    leaveTypeId = (await prisma.leaveType.create({ data: {
      companyId, name: `PC-J Annual ${suffix}`, code: `PCJ-${suffix}`, defaultDays: 20,
      requiresApproval: true, managerCanApprove: true,
    }, select: { id: true } })).id;
  });

  after(async () => {
    const ownedCompanyId = companyId;
    try {
      if (!ownedCompanyId) return;
      await prisma.notificationDelivery.deleteMany({ where: { notification: { companyId: ownedCompanyId } } });
      await prisma.notification.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.notificationPreference.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.auditLog.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveApprovalHistory.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveBalance.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveRequest.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.employee.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveType.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.userRole.deleteMany({ where: { user: { companyId: ownedCompanyId } } });
      await prisma.user.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.role.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.company.delete({ where: { id: ownedCompanyId } });
    } finally { await prisma.$disconnect(); }
  });

  it('cancels normally with one durable history and audit and no balance mutation', async () => {
    const id = await createPending(reviewerUserId);
    const before = await used();
    const result = await service(prisma).cancel(id, actor(applicantUserId, RoleName.EMPLOYEE));
    assert.equal(result.status, LeaveRequestStatus.CANCELLED);
    const evidence = await terminalEvidence(id);
    assert.equal(evidence.cancelHistory.length, 1);
    assert.equal(evidence.cancelAudits.length, 1);
    assert.equal(await used(), before);
    assert.equal(evidence.request.assignedApproverUserId, reviewerUserId);
    assert.equal(evidence.request.approvalAuthorityVersion, 1);
  });

  for (const [label, id, role] of [
    ['applicant', () => applicantUserId, RoleName.EMPLOYEE],
    ['company admin', () => adminUserId, RoleName.COMPANY_ADMIN],
    ['HR', () => reviewerUserId, RoleName.HR],
    ['qualifying manager', () => managerUserId, RoleName.MANAGER],
  ] as const) {
    it(`preserves ${label} cancellation authority`, async () => {
      const requestId = await createPending(reviewerUserId);
      assert.equal((await service(prisma).cancel(requestId, actor(id(), role))).status, LeaveRequestStatus.CANCELLED);
    });
  }

  it('denies cross-tenant, unrelated employee, and assigned-approver-only authority', async () => {
    const crossTenant = await createPending(reviewerUserId);
    await assert.rejects(
      () => service(prisma).cancel(crossTenant, actor(adminUserId, RoleName.COMPANY_ADMIN, randomUUID())),
      (error) => error instanceof ForbiddenException || error instanceof NotFoundException,
    );
    const unrelated = await createPending(reviewerUserId);
    await assert.rejects(() => service(prisma).cancel(unrelated, actor(assignedOnlyUserId, RoleName.EMPLOYEE)), ForbiddenException);
    const assignedOnly = await createPending(assignedOnlyUserId);
    await assert.rejects(() => service(prisma).cancel(assignedOnly, actor(assignedOnlyUserId, RoleName.EMPLOYEE)), ForbiddenException);
  });

  for (const decision of [LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED] as const) {
    it(`elects exactly one winner for ${decision} vs cancellation`, async () => {
      const requestId = await createPending(reviewerUserId);
      const usedBefore = await used();
      const barrier = new Barrier();
      const clients = [new PrismaClient(), new PrismaClient()];
      await Promise.all(clients.map((client) => client.$connect()));
      try {
        const results = await Promise.allSettled([
          service(coordinatedPrisma(clients[0], barrier)).review(requestId, { status: decision }, actor(reviewerUserId, RoleName.HR)),
          service(coordinatedPrisma(clients[1], barrier)).cancel(requestId, actor(applicantUserId, RoleName.EMPLOYEE)),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
        assert.ok(rejected.reason instanceof BadRequestException);
        const evidence = await terminalEvidence(requestId);
        assert.equal(evidence.decisionHistory.length + evidence.cancelHistory.length, 1);
        assert.equal(evidence.decisionAudits.length + evidence.cancelAudits.length, 1);
        const expectedIncrement = evidence.request.status === LeaveRequestStatus.APPROVED ? 2 : 0;
        assert.equal((await used()) - usedBefore, expectedIncrement);
      } finally { await Promise.all(clients.map((client) => client.$disconnect())); }
    });
  }

  it('elects exactly one cancellation winner for cancel vs cancel', async () => {
    const requestId = await createPending(reviewerUserId);
    const barrier = new Barrier();
    const clients = [new PrismaClient(), new PrismaClient()];
    await Promise.all(clients.map((client) => client.$connect()));
    try {
      const results = await Promise.allSettled(clients.map((client) =>
        service(coordinatedPrisma(client, barrier)).cancel(requestId, actor(applicantUserId, RoleName.EMPLOYEE))));
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
      const evidence = await terminalEvidence(requestId);
      assert.equal(evidence.request.status, LeaveRequestStatus.CANCELLED);
      assert.equal(evidence.cancelHistory.length, 1);
      assert.equal(evidence.cancelAudits.length, 1);
    } finally { await Promise.all(clients.map((client) => client.$disconnect())); }
  });

  it('rolls back claim and winner evidence when cancellation audit fails', async () => {
    const requestId = await createPending(reviewerUserId);
    const functionName = `pc_j_reject_audit_${suffix.replaceAll('-', '_')}`;
    const triggerName = `${functionName}_trigger`;
    try {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$ BEGIN IF NEW."entityId" = '${requestId}' AND NEW."action" = 'LEAVE_CANCELLED' THEN RAISE EXCEPTION 'PC-J rollback probe'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
      await assert.rejects(() => service(prisma).cancel(requestId, actor(applicantUserId, RoleName.EMPLOYEE)));
      const evidence = await terminalEvidence(requestId);
      assert.equal(evidence.request.status, LeaveRequestStatus.PENDING);
      assert.equal(evidence.cancelHistory.length, 0);
      assert.equal(evidence.cancelAudits.length, 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
  });

  function service(client: PrismaClient) { return new LeaveService(client as never, notifications as never); }

  async function createPending(assignedApproverUserId: string | null) {
    return (await prisma.leaveRequest.create({ data: {
      companyId, employeeId: applicantEmployeeId, leaveTypeId,
      startDate: new Date('2033-01-10T00:00:00.000Z'), endDate: new Date('2033-01-11T00:00:00.000Z'),
      totalDays: 2, status: LeaveRequestStatus.PENDING,
      ...(assignedApproverUserId ? { assignedApproverUserId, approvalAuthorityVersion: 1 } : {}),
    }, select: { id: true } })).id;
  }

  async function terminalEvidence(requestId: string) {
    const request = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: requestId } });
    const [cancelHistory, decisionHistory, cancelAudits, decisionAudits] = await Promise.all([
      prisma.leaveApprovalHistory.findMany({ where: { leaveRequestId: requestId, action: LeaveApprovalAction.CANCELLED } }),
      prisma.leaveApprovalHistory.findMany({ where: { leaveRequestId: requestId, action: { in: [LeaveApprovalAction.APPROVED, LeaveApprovalAction.REJECTED] } } }),
      prisma.auditLog.findMany({ where: { entityType: 'LeaveRequest', entityId: requestId, action: 'LEAVE_CANCELLED' } }),
      prisma.auditLog.findMany({ where: { entityType: 'LeaveRequest', entityId: requestId, action: { in: ['LEAVE_APPROVED', 'LEAVE_REJECTED'] } } }),
    ]);
    return { request, cancelHistory, decisionHistory, cancelAudits, decisionAudits };
  }

  async function used() {
    return (await prisma.leaveBalance.findUnique({ where: {
      employeeId_leaveTypeId_year: { employeeId: applicantEmployeeId, leaveTypeId, year: 2033 },
    } }))?.used ?? 0;
  }

  async function createRole(label: string, systemName: RoleName) {
    return (await prisma.role.create({ data: { companyId, key: `pc-j-${label}-${suffix}`, name: `PC-J ${label}`, systemName }, select: { id: true } })).id;
  }
  async function createUser(label: string, roleId: string) {
    return (await prisma.user.create({ data: {
      companyId, email: `pc-j-${label}-${suffix}@example.invalid`, passwordHash: 'integration-only-hash',
      firstName: 'PC-J', lastName: label, roles: { create: { roleId } },
    }, select: { id: true } })).id;
  }
  async function createEmployee(userId: string, code: string, reportingManagerId?: string) {
    return (await prisma.employee.create({ data: {
      companyId, userId, reportingManagerId, employeeCode: `${code}-${suffix.slice(0, 8)}`,
      joiningDate: new Date('2026-01-01T00:00:00.000Z'), employmentType: EmploymentType.FULL_TIME,
      workMode: WorkMode.REMOTE, status: EmployeeStatus.ACTIVE,
    }, select: { id: true } })).id;
  }
});

function coordinatedPrisma(client: PrismaClient, barrier: Barrier): PrismaClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === '$transaction') {
        return (callback: (tx: unknown) => Promise<unknown>, ...options: unknown[]) =>
          target.$transaction(async (tx) => { await barrier.arrive(); return callback(tx); }, ...(options as []));
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
