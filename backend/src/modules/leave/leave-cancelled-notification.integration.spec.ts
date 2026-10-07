import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
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

const enabled = process.env.RUN_LEAVE_CANCELLED_EMAIL_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-J PostgreSQL Leave cancelled participant email', () => {
  const suffix = randomUUID();
  let companyId: string | null = null;
  let applicantUserId: string;
  let applicantEmployeeId: string;
  let approverUserId: string;
  let unrelatedHrUserId: string;
  let leaveTypeId: string;
  let day = 0;

  const applicant = () => ({
    id: applicantUserId, companyId, email: `pc-j-applicant-${suffix}@example.invalid`,
    firstName: 'Leave', lastName: 'Applicant', status: UserStatus.ACTIVE, roles: [RoleName.EMPLOYEE],
  });

  before(async () => {
    await prisma.$connect();
    companyId = (await prisma.company.create({ data: { name: `PC-J Email ${suffix}`, slug: `pc-j-email-${suffix}` }, select: { id: true } })).id;
    const employeeRole = await createRole('employee', RoleName.EMPLOYEE);
    const hrRole = await createRole('hr', RoleName.HR);
    applicantUserId = await createUser('applicant', employeeRole);
    approverUserId = await createUser('approver', hrRole);
    unrelatedHrUserId = await createUser('unrelated-hr', hrRole);
    applicantEmployeeId = await createEmployee(applicantUserId);
    leaveTypeId = (await prisma.leaveType.create({ data: {
      companyId, name: `PC-J Annual ${suffix}`, code: `PCJE-${suffix}`, defaultDays: 12,
      requiresApproval: true, managerCanApprove: false,
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
      await prisma.leaveRequest.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.employee.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.leaveType.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.userRole.deleteMany({ where: { user: { companyId: ownedCompanyId } } });
      await prisma.user.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.role.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.company.delete({ where: { id: ownedCompanyId } });
    } finally { await prisma.$disconnect(); }
  });

  it('notifies only applicant and persisted assigned approver with cancellation-history identity', async () => {
    const requestId = await createPending(approverUserId);
    await service().cancel(requestId, applicant());
    const history = await cancellationHistory(requestId);
    const rows = await notificationsFor(requestId);
    assert.deepEqual(new Set(rows.map((row) => row.userId)), new Set([applicantUserId, approverUserId]));
    assert.equal(rows.some((row) => row.userId === unrelatedHrUserId), false);
    assert.ok(rows.every((row) => row.deliveries.length === 1));
    assert.deepEqual(new Set(rows.map((row) => row.idempotencyKey)), new Set([
      `${history.id}:LEAVE_CANCELLED:${applicantUserId}:EMAIL`,
      `${history.id}:LEAVE_CANCELLED:${approverUserId}:EMAIL`,
    ]));

    const notificationService = notificationsService();
    const replay = await notificationService.createLeaveCancelledEmails({
      cancellationHistoryId: history.id,
      participantUserIds: [applicantUserId, approverUserId],
      expectedCompanyId: companyId!,
      payload: payload(requestId),
    });
    assert.deepEqual(replay, { created: 0 });
    assert.equal((await notificationsFor(requestId)).length, 2);
  });

  it('uses applicant only for legacy null assignment and deduplicates identical participants', async () => {
    const legacyId = await createPending(null);
    await service().cancel(legacyId, applicant());
    assert.deepEqual((await notificationsFor(legacyId)).map((row) => row.userId), [applicantUserId]);

    const selfAssignedId = await createPending(applicantUserId);
    await service().cancel(selfAssignedId, applicant());
    const selfRows = await notificationsFor(selfAssignedId);
    assert.equal(selfRows.length, 1);
    assert.equal(selfRows[0].userId, applicantUserId);
  });

  it('suppresses only the disabled participant without substituting a role recipient', async () => {
    await prisma.notificationPreference.create({ data: { companyId, userId: approverUserId, emailEnabled: false } });
    try {
      const requestId = await createPending(approverUserId);
      await service().cancel(requestId, applicant());
      const rows = await notificationsFor(requestId);
      assert.deepEqual(rows.map((row) => row.userId), [applicantUserId]);
      assert.equal(rows.some((row) => row.userId === unrelatedHrUserId), false);
    } finally {
      await prisma.notificationPreference.deleteMany({ where: { companyId, userId: approverUserId } });
    }
  });

  it('creates no cancellation email when the business transaction rolls back', async () => {
    const requestId = await createPending(approverUserId);
    const functionName = `pc_j_email_reject_${suffix.replaceAll('-', '_')}`;
    const triggerName = `${functionName}_trigger`;
    try {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$ BEGIN IF NEW."entityId" = '${requestId}' AND NEW."action" = 'LEAVE_CANCELLED' THEN RAISE EXCEPTION 'PC-J email rollback probe'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
      await assert.rejects(() => service().cancel(requestId, applicant()));
      assert.equal((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: requestId } })).status, LeaveRequestStatus.PENDING);
      assert.equal((await notificationsFor(requestId)).length, 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
  });

  function notificationsService() {
    return new NotificationsService(
      prisma as never,
      new NotificationRecipientResolver(prisma as never),
      new NotificationPreferenceService(prisma as never),
      {} as never,
    );
  }
  function service() { return new LeaveService(prisma as never, notificationsService()); }

  async function createPending(assignedApproverUserId: string | null) {
    const date = new Date(Date.UTC(2034, 0, 1 + day++)).toISOString().slice(0, 10);
    return (await prisma.leaveRequest.create({ data: {
      companyId, employeeId: applicantEmployeeId, leaveTypeId,
      startDate: new Date(`${date}T00:00:00.000Z`), endDate: new Date(`${date}T00:00:00.000Z`),
      totalDays: 1, status: LeaveRequestStatus.PENDING,
      ...(assignedApproverUserId ? { assignedApproverUserId, approvalAuthorityVersion: 1 } : {}),
    }, select: { id: true } })).id;
  }

  function cancellationHistory(requestId: string) {
    return prisma.leaveApprovalHistory.findFirstOrThrow({ where: { leaveRequestId: requestId, action: LeaveApprovalAction.CANCELLED } });
  }
  function notificationsFor(requestId: string) {
    return prisma.notification.findMany({
      where: { companyId, type: NotificationType.LEAVE_CANCELLED, detailsPath: `/leave/requests/${requestId}` },
      include: { deliveries: true }, orderBy: { userId: 'asc' },
    });
  }
  function payload(requestId: string) {
    return {
      leaveRequestId: requestId, applicantDisplayName: 'Leave Applicant', leaveTypeName: `PC-J Annual ${suffix}`,
      startDate: '2034-01-01', endDate: '2034-01-01', cancelledByDisplayName: 'Leave Applicant',
    };
  }
  async function createRole(label: string, systemName: RoleName) {
    return (await prisma.role.create({ data: { companyId, key: `pc-je-${label}-${suffix}`, name: `PC-J ${label}`, systemName }, select: { id: true } })).id;
  }
  async function createUser(label: string, roleId: string) {
    return (await prisma.user.create({ data: {
      companyId, email: `pc-je-${label}-${suffix}@example.invalid`, passwordHash: 'integration-only-hash',
      firstName: label === 'applicant' ? 'Leave' : 'PC-J', lastName: label, roles: { create: { roleId } },
    }, select: { id: true } })).id;
  }
  async function createEmployee(userId: string) {
    return (await prisma.employee.create({ data: {
      companyId, userId, employeeCode: `PCJE-${suffix.slice(0, 8)}`, joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentType: EmploymentType.FULL_TIME, workMode: WorkMode.REMOTE, status: EmployeeStatus.ACTIVE,
    }, select: { id: true } })).id;
  }
});
