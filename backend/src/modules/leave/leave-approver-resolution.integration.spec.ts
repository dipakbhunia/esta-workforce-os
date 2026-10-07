import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import {
  EmployeeStatus,
  EmploymentType,
  LeaveRequestStatus,
  Prisma,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { CompaniesService } from '../companies/companies.service';
import { LeaveService } from './leave.service';

const enabled = process.env.RUN_LEAVE_APPROVER_RESOLUTION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();
const notifications = { createLeaveDecisionEmail: async () => ({ created: true }) };

describeDb('PC-I0C PostgreSQL leave approver resolution', () => {
  const suffix = randomUUID();
  const companyIds: string[] = [];
  let companyId: string;
  let applicantUserId: string;
  let applicantEmployeeId: string;
  let managerUserId: string;
  let managerEmployeeId: string;
  let fallbackUserId: string;
  let secondFallbackUserId: string;
  let ineligibleUserId: string;
  let approvalTypeId: string;
  let fallbackOnlyTypeId: string;
  let autoTypeId: string;
  let dateOffset = 0;

  const actor = (roles = [RoleName.EMPLOYEE]) => ({
    id: applicantUserId,
    companyId,
    email: `pc-i0c-applicant-${suffix}@example.invalid`,
    firstName: 'PC-I0C',
    lastName: 'Applicant',
    status: UserStatus.ACTIVE,
    roles,
  });

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: { name: `PC-I0C ${suffix}`, slug: `pc-i0c-${suffix}` },
      select: { id: true },
    });
    companyId = company.id;
    companyIds.push(companyId);

    const managerRole = await role('manager', RoleName.MANAGER);
    const hrRole = await role('hr', RoleName.HR);
    const employeeRole = await role('employee', RoleName.EMPLOYEE);
    applicantUserId = await user('applicant', employeeRole);
    managerUserId = await user('manager', managerRole);
    fallbackUserId = await user('fallback', hrRole);
    secondFallbackUserId = await user('fallback-two', hrRole);
    ineligibleUserId = await user('ineligible', employeeRole);
    managerEmployeeId = await employee(managerUserId, 'MGR');
    applicantEmployeeId = await employee(applicantUserId, 'APP', managerEmployeeId);

    approvalTypeId = await leaveType('approval', true, true);
    fallbackOnlyTypeId = await leaveType('fallback', true, false);
    autoTypeId = await leaveType('auto', false, true);
    await prisma.company.update({
      where: { id: companyId },
      data: { designatedLeaveApproverUserId: fallbackUserId },
    });
  });

  after(async () => {
    try {
      if (companyIds.length) {
        await prisma.company.updateMany({
          where: { id: { in: companyIds } },
          data: { designatedLeaveApproverUserId: null },
        });
        await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.leaveApprovalHistory.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.leaveBalance.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.leaveRequest.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.employee.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.leaveType.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.userRole.deleteMany({ where: { user: { companyId: { in: companyIds } } } });
        await prisma.user.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.role.deleteMany({ where: { companyId: { in: companyIds } } });
        await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('resolves manager first, falls back for every invalid manager form, and persists versioned authority', async () => {
    const service = leaveService(prisma);
    const primary = await apply(service, approvalTypeId);
    assert.equal((await durable(primary.id)).assignedApproverUserId, managerUserId);
    assert.equal((await durable(primary.id)).approvalAuthorityVersion, 1);

    const fallbackOnly = await apply(service, fallbackOnlyTypeId);
    assert.equal((await durable(fallbackOnly.id)).assignedApproverUserId, fallbackUserId);

    await prisma.employee.update({ where: { id: managerEmployeeId }, data: { status: EmployeeStatus.INACTIVE } });
    assert.equal((await durable((await apply(service, approvalTypeId)).id)).assignedApproverUserId, fallbackUserId);
    await prisma.employee.update({ where: { id: managerEmployeeId }, data: { status: EmployeeStatus.ACTIVE } });

    await prisma.employee.update({ where: { id: managerEmployeeId }, data: { deletedAt: new Date() } });
    assert.equal((await durable((await apply(service, approvalTypeId)).id)).assignedApproverUserId, fallbackUserId);
    await prisma.employee.update({ where: { id: managerEmployeeId }, data: { deletedAt: null } });

    await prisma.user.update({ where: { id: managerUserId }, data: { status: UserStatus.INACTIVE } });
    assert.equal((await durable((await apply(service, approvalTypeId)).id)).assignedApproverUserId, fallbackUserId);
    await prisma.user.update({ where: { id: managerUserId }, data: { status: UserStatus.ACTIVE } });

    await prisma.user.update({ where: { id: managerUserId }, data: { deletedAt: new Date() } });
    assert.equal((await durable((await apply(service, approvalTypeId)).id)).assignedApproverUserId, fallbackUserId);
    await prisma.user.update({ where: { id: managerUserId }, data: { deletedAt: null } });

    const managerRole = await prisma.role.findFirstOrThrow({ where: { companyId, systemName: RoleName.MANAGER } });
    await prisma.userRole.delete({ where: { userId_roleId: { userId: managerUserId, roleId: managerRole.id } } });
    assert.equal((await durable((await apply(service, approvalTypeId)).id)).assignedApproverUserId, fallbackUserId);
    await prisma.userRole.create({ data: { userId: managerUserId, roleId: managerRole.id } });

    for (const roles of [[RoleName.HR], [RoleName.MANAGER], [RoleName.COMPANY_ADMIN]]) {
      const request = await apply(service, approvalTypeId, roles);
      assert.equal((await durable(request.id)).assignedApproverUserId, managerUserId);
    }
  });

  it('rejects stale, ineligible, and self fallback with no durable submission evidence', async () => {
    const service = leaveService(prisma);
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
    const before = await evidenceCounts();
    try {
      for (const fallback of [ineligibleUserId, applicantUserId, null]) {
        await prisma.company.update({ where: { id: companyId }, data: { designatedLeaveApproverUserId: fallback } });
        await assert.rejects(
          () => apply(service, approvalTypeId),
          (error: unknown) => error instanceof ConflictException &&
            error.message === 'No valid leave approver is configured for this employee',
        );
      }
      await prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.INACTIVE } });
      await prisma.company.update({ where: { id: companyId }, data: { designatedLeaveApproverUserId: fallbackUserId } });
      await assert.rejects(() => apply(service, approvalTypeId), ConflictException);
      await prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.ACTIVE, deletedAt: new Date() } });
      await assert.rejects(() => apply(service, approvalTypeId), ConflictException);
      assert.deepEqual(await evidenceCounts(), before);
    } finally {
      await prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.ACTIVE, deletedAt: null } });
      await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: managerEmployeeId } });
      await prisma.company.update({ where: { id: companyId }, data: { designatedLeaveApproverUserId: fallbackUserId } });
    }
  });

  it('never self-approves malformed manager relations and preserves auto-approved null authority', async () => {
    const service = leaveService(prisma);
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: applicantEmployeeId } });
    try {
      const fallback = await apply(service, approvalTypeId);
      assert.equal((await durable(fallback.id)).assignedApproverUserId, fallbackUserId);
      const automatic = await apply(service, autoTypeId);
      const row = await durable(automatic.id);
      assert.equal(row.status, LeaveRequestStatus.APPROVED);
      assert.equal(row.assignedApproverUserId, null);
      assert.equal(row.approvalAuthorityVersion, null);
    } finally {
      await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: managerEmployeeId } });
    }
  });

  it('keeps assignment immutable across later manager and fallback configuration changes', async () => {
    const service = leaveService(prisma);
    const request = await apply(service, approvalTypeId);
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
    await prisma.company.update({ where: { id: companyId }, data: { designatedLeaveApproverUserId: secondFallbackUserId } });
    try {
      const row = await durable(request.id);
      assert.equal(row.assignedApproverUserId, managerUserId);
      assert.equal(row.approvalAuthorityVersion, 1);
    } finally {
      await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: managerEmployeeId } });
      await prisma.company.update({ where: { id: companyId }, data: { designatedLeaveApproverUserId: fallbackUserId } });
    }
  });

  it('serializes designated fallback PATCH before Apply on the same Company row', async () => {
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
    const writerClient = new PrismaClient();
    const applyClient = new PrismaClient();
    let writerConnected = false;
    let applyConnected = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let reportWriterLock!: (pid: number) => void;
    const writerLockAcquired = new Promise<number>((resolve) => { reportWriterLock = resolve; });
    let reportApplyAttempt!: (pid: number) => void;
    const applyLockAttempted = new Promise<number>((resolve) => { reportApplyAttempt = resolve; });
    const companyActor = { ...actor([RoleName.COMPANY_ADMIN]), id: fallbackUserId };
    let patch: Promise<unknown> | undefined;
    let applying: ReturnType<typeof apply> | undefined;
    try {
      await writerClient.$connect();
      writerConnected = true;
      await applyClient.$connect();
      applyConnected = true;
      const companies = new CompaniesService(
        pausedCompanyPrisma(writerClient, reportWriterLock, held) as never,
      );
      patch = companies.updateDesignatedLeaveApprover(
        { designatedLeaveApproverUserId: secondFallbackUserId },
        companyActor,
      );
      const writerPid = await writerLockAcquired;
      applying = apply(
        leaveService(observedApplyPrisma(applyClient, reportApplyAttempt)),
        fallbackOnlyTypeId,
      );
      const applyPid = await applyLockAttempted;
      await observeBlockedBy(applyPid, writerPid);
      release();
      await patch;
      const request = await applying;
      const row = await durable(request.id);
      assert.equal(row.assignedApproverUserId, secondFallbackUserId);
      assert.equal(row.approvalAuthorityVersion, 1);
      assert.equal(row.status, LeaveRequestStatus.PENDING);
    } finally {
      release?.();
      const activeOperations: Promise<unknown>[] = [];
      if (patch) activeOperations.push(patch);
      if (applying) activeOperations.push(applying);
      await Promise.allSettled(activeOperations);
      await Promise.allSettled([
        ...(writerConnected ? [writerClient.$disconnect()] : []),
        ...(applyConnected ? [applyClient.$disconnect()] : []),
      ]);
      await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: managerEmployeeId } });
      await prisma.company.update({ where: { id: companyId }, data: { designatedLeaveApproverUserId: fallbackUserId } });
    }
  });

  async function role(label: string, systemName: RoleName) {
    return (await prisma.role.create({ data: {
      companyId, key: `pc-i0c-${label}-${suffix}`, name: `PC-I0C ${label}`, systemName,
    }, select: { id: true } })).id;
  }

  async function user(label: string, roleId: string) {
    return (await prisma.user.create({ data: {
      companyId, email: `pc-i0c-${label}-${suffix}@example.invalid`, passwordHash: 'integration-only-hash',
      firstName: 'PC-I0C', lastName: label, roles: { create: { roleId } },
    }, select: { id: true } })).id;
  }

  async function employee(userId: string, code: string, reportingManagerId?: string) {
    return (await prisma.employee.create({ data: {
      companyId, userId, reportingManagerId, employeeCode: `${code}-${suffix.slice(0, 8)}`,
      joiningDate: new Date('2026-01-01T00:00:00.000Z'), employmentType: EmploymentType.FULL_TIME,
      workMode: WorkMode.REMOTE,
    }, select: { id: true } })).id;
  }

  async function leaveType(label: string, requiresApproval: boolean, managerCanApprove: boolean) {
    return (await prisma.leaveType.create({ data: {
      companyId, name: `PC-I0C ${label}`, code: `PCI0C-${label}-${suffix}`,
      defaultDays: 12, requiresApproval, managerCanApprove,
    }, select: { id: true } })).id;
  }

  async function apply(service: LeaveService, leaveTypeId: string, roles?: RoleName[]) {
    const day = 1 + dateOffset++;
    const date = new Date(Date.UTC(2031, 0, day)).toISOString().slice(0, 10);
    return service.apply({ leaveTypeId, startDate: date, endDate: date }, actor(roles));
  }

  function durable(id: string) {
    return prisma.leaveRequest.findUniqueOrThrow({ where: { id } });
  }

  async function evidenceCounts() {
    const [requests, history, audits] = await Promise.all([
      prisma.leaveRequest.count({ where: { companyId } }),
      prisma.leaveApprovalHistory.count({ where: { companyId } }),
      prisma.auditLog.count({ where: { companyId, action: 'LEAVE_SUBMITTED' } }),
    ]);
    return { requests, history, audits };
  }

  async function observeBlockedBy(applyPid: number, writerPid: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [activity] = await prisma.$queryRaw<Array<{
        blockers: number[];
        waitEventType: string | null;
      }>>(Prisma.sql`
        SELECT pg_blocking_pids(${applyPid}::int) AS blockers,
               "wait_event_type" AS "waitEventType"
        FROM pg_stat_activity
        WHERE pid = ${applyPid}::int
      `);
      if (
        activity?.waitEventType === 'Lock' &&
        activity.blockers.includes(writerPid)
      ) {
        return;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
    assert.fail(
      `Apply backend ${applyPid} was not observed blocked by PATCH backend ${writerPid}`,
    );
  }
});

function leaveService(client: PrismaClient) {
  return new LeaveService(client as never, notifications as never);
}

function pausedCompanyPrisma(
  client: PrismaClient,
  locked: (pid: number) => void,
  held: Promise<void>,
): PrismaClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === '$transaction') {
        return (callback: (tx: PrismaClient) => Promise<unknown>, ...options: unknown[]) =>
          target.$transaction(async (tx) => {
            const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
              SELECT pg_backend_pid() AS pid
            `;
            let companyLockObserved = false;
            return callback(new Proxy(tx as never, {
              get(txTarget, txProperty, txReceiver) {
                const value = Reflect.get(txTarget, txProperty, txReceiver);
                if (txProperty === '$queryRaw') {
                  return async (...args: unknown[]) => {
                    const result = await value.apply(txTarget, args);
                    if (!companyLockObserved) {
                      companyLockObserved = true;
                      locked(pid);
                      await held;
                    }
                    return result;
                  };
                }
                return typeof value === 'function' ? value.bind(txTarget) : value;
              },
            }) as never);
          }, ...(options as []));
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function observedApplyPrisma(
  client: PrismaClient,
  attempted: (pid: number) => void,
): PrismaClient {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === '$transaction') {
        return (callback: (tx: PrismaClient) => Promise<unknown>, ...options: unknown[]) =>
          target.$transaction(async (tx) => {
            const [{ pid }] = await tx.$queryRaw<Array<{ pid: number }>>`
              SELECT pg_backend_pid() AS pid
            `;
            let companyLockAttempted = false;
            return callback(new Proxy(tx as never, {
              get(txTarget, txProperty, txReceiver) {
                const value = Reflect.get(txTarget, txProperty, txReceiver);
                if (txProperty === '$queryRaw') {
                  return async (...args: unknown[]) => {
                    if (!companyLockAttempted) {
                      companyLockAttempted = true;
                      attempted(pid);
                    }
                    return value.apply(txTarget, args);
                  };
                }
                return typeof value === 'function' ? value.bind(txTarget) : value;
              },
            }) as never);
          }, ...(options as []));
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
