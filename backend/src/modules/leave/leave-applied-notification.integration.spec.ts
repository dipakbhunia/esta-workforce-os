import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import {
  EmployeeStatus,
  EmploymentType,
  LeaveApprovalAction,
  LeaveRequestStatus,
  NotificationType,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { NotificationPreferenceService } from '../notifications/notification-preference.service';
import { NotificationRecipientResolver } from '../notifications/notification-recipient-resolver.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LeaveService } from './leave.service';

const enabled = process.env.RUN_LEAVE_APPLIED_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-I PostgreSQL Leave applied assigned-approver email', () => {
  const suffix = randomUUID();
  const companyIds: string[] = [];
  let companyId: string;
  let applicantUserId: string;
  let applicantEmployeeId: string;
  let managerUserId: string;
  let managerEmployeeId: string;
  let fallbackUserId: string;
  let unrelatedHrUserId: string;
  let approvalTypeId: string;
  let fallbackTypeId: string;
  let autoTypeId: string;
  let day = 0;

  const actor = (id: string, roles: RoleName[]) => ({
    id,
    companyId,
    email: `${id}@example.invalid`,
    firstName: 'PC-I',
    lastName: 'Actor',
    status: UserStatus.ACTIVE,
    roles,
  });

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: { name: `PC-I ${suffix}`, slug: `pc-i-${suffix}` },
      select: { id: true },
    });
    companyId = company.id;
    companyIds.push(companyId);

    const managerRole = await createRole('manager', RoleName.MANAGER);
    const hrRole = await createRole('hr', RoleName.HR);
    const employeeRole = await createRole('employee', RoleName.EMPLOYEE);
    applicantUserId = await createUser('applicant', employeeRole);
    managerUserId = await createUser('manager', managerRole);
    fallbackUserId = await createUser('fallback', hrRole);
    unrelatedHrUserId = await createUser('unrelated-hr', hrRole);
    managerEmployeeId = await createEmployee(managerUserId, 'MGR');
    applicantEmployeeId = await createEmployee(applicantUserId, 'APP', managerEmployeeId);
    approvalTypeId = await createLeaveType('manager', true, true);
    fallbackTypeId = await createLeaveType('fallback', true, false);
    autoTypeId = await createLeaveType('auto', false, true);
    await prisma.company.update({
      where: { id: companyId },
      data: { designatedLeaveApproverUserId: fallbackUserId },
    });
  });

  after(async () => {
    try {
      if (!companyIds.length) return;
      const where = { companyId: { in: companyIds } };
      await prisma.company.updateMany({
        where: { id: { in: companyIds } },
        data: { designatedLeaveApproverUserId: null },
      });
      await prisma.notificationDelivery.deleteMany({ where: { notification: where } });
      await prisma.notification.deleteMany({ where });
      await prisma.notificationPreference.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where });
      await prisma.leaveApprovalHistory.deleteMany({ where });
      await prisma.leaveBalance.deleteMany({ where });
      await prisma.leaveRequest.deleteMany({ where });
      await prisma.employee.deleteMany({ where });
      await prisma.leaveType.deleteMany({ where });
      await prisma.userRole.deleteMany({ where: { user: where } });
      await prisma.user.deleteMany({ where });
      await prisma.role.deleteMany({ where });
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('emails only the persisted manager and keeps PC-G decision recipient separate', async () => {
    const service = leaveService(notificationsService());
    const request = await apply(service, approvalTypeId);
    const applied = await notificationsFor(request.id, NotificationType.LEAVE_APPLIED);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].userId, managerUserId);
    assert.equal(applied[0].deliveries.length, 1);
    assert.equal(applied[0].deliveries[0].recipient.includes('manager'), true);
    assert.equal(applied.some((row) => [fallbackUserId, unrelatedHrUserId].includes(row.userId)), false);

    await service.review(
      request.id,
      { status: LeaveRequestStatus.REJECTED },
      actor(managerUserId, [RoleName.MANAGER]),
    );
    const decision = await notificationsFor(request.id, NotificationType.LEAVE_REJECTED);
    assert.equal(decision.length, 1);
    assert.equal(decision[0].userId, applicantUserId);
  });

  it('emails only the persisted fallback and replay converges to one Notification and Delivery', async () => {
    const notifications = notificationsService();
    const service = leaveService(notifications);
    const request = await apply(service, fallbackTypeId);
    const row = await prisma.leaveRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(row.assignedApproverUserId, fallbackUserId);
    const history = await prisma.leaveApprovalHistory.findFirstOrThrow({
      where: { leaveRequestId: request.id, action: LeaveApprovalAction.SUBMITTED },
    });
    const replay = {
      submittedHistoryId: history.id,
      assignedApproverUserId: fallbackUserId,
      expectedCompanyId: companyId,
      payload: {
        leaveRequestId: request.id,
        applicantDisplayName: 'PC-I applicant',
        leaveTypeName: 'PC-I fallback',
        startDate: request.startDate,
        endDate: request.endDate,
      },
    };
    const results = await Promise.all([notifications.createLeaveAppliedEmail(replay), notifications.createLeaveAppliedEmail(replay)]);
    assert.equal(results.filter((result) => result.created).length, 0);
    const applied = await notificationsFor(request.id, NotificationType.LEAVE_APPLIED);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].userId, fallbackUserId);
    assert.equal(applied[0].deliveries.length, 1);
    assert.equal(applied.some((notification) => notification.userId === unrelatedHrUserId), false);
  });

  it('respects email preference and skips auto-approved Leave', async () => {
    await prisma.notificationPreference.create({
      data: { companyId, userId: managerUserId, emailEnabled: false },
    });
    try {
      const service = leaveService(notificationsService());
      const pending = await apply(service, approvalTypeId);
      assert.equal((await notificationsFor(pending.id, NotificationType.LEAVE_APPLIED)).length, 0);
      const automatic = await apply(service, autoTypeId);
      assert.equal(automatic.status, LeaveRequestStatus.APPROVED);
      assert.equal((await notificationsFor(automatic.id, NotificationType.LEAVE_APPLIED)).length, 0);
    } finally {
      await prisma.notificationPreference.deleteMany({ where: { companyId, userId: managerUserId } });
    }
  });

  it('creates no business or communication evidence when approval authority is unavailable', async () => {
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
    await prisma.company.update({ where: { id: companyId }, data: { designatedLeaveApproverUserId: null } });
    const before = await evidenceCounts();
    try {
      await assert.rejects(() => apply(leaveService(notificationsService()), approvalTypeId), ConflictException);
      assert.deepEqual(await evidenceCounts(), before);
    } finally {
      await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: managerEmployeeId } });
      await prisma.company.update({ where: { id: companyId }, data: { designatedLeaveApproverUserId: fallbackUserId } });
    }
  });

  it('does not enqueue on transaction rollback and preserves Leave on post-commit enqueue failure', async () => {
    const functionName = `pc_i_reject_audit_${suffix.replaceAll('-', '_')}`;
    const triggerName = `${functionName}_trigger`;
    const before = await evidenceCounts();
    try {
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
        BEGIN
          IF NEW."companyId" = '${companyId}'::uuid AND NEW."action" = 'LEAVE_SUBMITTED' THEN
            RAISE EXCEPTION 'PC-I audit rollback probe';
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
      let enqueueCalls = 0;
      const failingTransactionService = leaveService({
        createLeaveAppliedEmail: async () => { enqueueCalls += 1; return { created: true }; },
        createLeaveDecisionEmail: async () => ({ created: true }),
      } as never);
      await assert.rejects(() => apply(failingTransactionService, approvalTypeId));
      assert.equal(enqueueCalls, 0);
      assert.deepEqual(await evidenceCounts(), before);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    const bestEffort = leaveService({
      createLeaveAppliedEmail: async () => { throw new Error('enqueue unavailable'); },
      createLeaveDecisionEmail: async () => ({ created: true }),
    } as never);
    const committed = await apply(bestEffort, approvalTypeId);
    assert.equal(committed.status, LeaveRequestStatus.PENDING);
    assert.ok(await prisma.leaveRequest.findUnique({ where: { id: committed.id } }));
  });

  function notificationsService() {
    return new NotificationsService(
      prisma as never,
      new NotificationRecipientResolver(prisma as never),
      new NotificationPreferenceService(prisma as never),
      {} as never,
    );
  }

  function leaveService(notifications: NotificationsService) {
    return new LeaveService(prisma as never, notifications);
  }

  async function apply(service: LeaveService, leaveTypeId: string) {
    const date = new Date(Date.UTC(2032, 0, 1 + day++)).toISOString().slice(0, 10);
    return service.apply(
      { leaveTypeId, startDate: date, endDate: date },
      actor(applicantUserId, [RoleName.EMPLOYEE]),
    );
  }

  async function notificationsFor(requestId: string, type: NotificationType) {
    return prisma.notification.findMany({
      where: { companyId, type, detailsPath: `/leave/requests/${requestId}` },
      include: { deliveries: true },
    });
  }

  async function evidenceCounts() {
    const [requests, histories, audits, notifications, deliveries] = await Promise.all([
      prisma.leaveRequest.count({ where: { companyId } }),
      prisma.leaveApprovalHistory.count({ where: { companyId } }),
      prisma.auditLog.count({ where: { companyId, action: 'LEAVE_SUBMITTED' } }),
      prisma.notification.count({ where: { companyId } }),
      prisma.notificationDelivery.count({ where: { notification: { companyId } } }),
    ]);
    return { requests, histories, audits, notifications, deliveries };
  }

  async function createRole(label: string, systemName: RoleName) {
    return (await prisma.role.create({
      data: { companyId, key: `pc-i-${label}-${suffix}`, name: `PC-I ${label}`, systemName },
      select: { id: true },
    })).id;
  }

  async function createUser(label: string, roleId: string) {
    return (await prisma.user.create({
      data: {
        companyId,
        email: `pc-i-${label}-${suffix}@example.invalid`,
        passwordHash: 'integration-only-hash',
        firstName: 'PC-I',
        lastName: label,
        roles: { create: { roleId } },
      },
      select: { id: true },
    })).id;
  }

  async function createEmployee(userId: string, code: string, reportingManagerId?: string) {
    return (await prisma.employee.create({
      data: {
        companyId,
        userId,
        reportingManagerId,
        employeeCode: `${code}-${suffix.slice(0, 8)}`,
        joiningDate: new Date('2026-01-01T00:00:00.000Z'),
        employmentType: EmploymentType.FULL_TIME,
        workMode: WorkMode.REMOTE,
        status: EmployeeStatus.ACTIVE,
      },
      select: { id: true },
    })).id;
  }

  async function createLeaveType(label: string, requiresApproval: boolean, managerCanApprove: boolean) {
    return (await prisma.leaveType.create({
      data: {
        companyId,
        name: `PC-I ${label}`,
        code: `PCI-${label}-${suffix}`,
        defaultDays: 12,
        requiresApproval,
        managerCanApprove,
      },
      select: { id: true },
    })).id;
  }
});
