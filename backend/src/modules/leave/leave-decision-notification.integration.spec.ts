import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  BadRequestException,
} from '@nestjs/common';
import {
  EmploymentType,
  LeaveRequestStatus,
  NotificationType,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { LeaveService } from './leave.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationRecipientResolver } from '../notifications/notification-recipient-resolver.service';
import { NotificationPreferenceService } from '../notifications/notification-preference.service';

const enabled = process.env.RUN_LEAVE_DECISION_EMAIL_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

class Barrier {
  private arrivals = 0;
  private release!: () => void;
  private readonly ready = new Promise<void>((resolve) => { this.release = resolve; });
  async arrive() {
    this.arrivals += 1;
    if (this.arrivals === 2) this.release();
    await this.ready;
  }
}

describeDb('PC-G PostgreSQL Leave decision email', () => {
  const suffix = randomUUID();
  let companyId: string | null = null;
  let applicantUserId: string;
  let applicantEmployeeId: string;
  let reviewerUserId: string;
  let leaveTypeId: string;

  const actor = () => ({
    id: reviewerUserId, companyId, email: `pc-g-reviewer-${suffix}@example.invalid`,
    firstName: 'PC-G', lastName: 'Reviewer', status: UserStatus.ACTIVE, roles: [RoleName.HR],
  });

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: { name: `PC-G ${suffix}`, slug: `pc-g-${suffix}` }, select: { id: true },
    });
    companyId = company.id;
    const applicant = await prisma.user.create({ data: {
      companyId, email: `pc-g-applicant-${suffix}@example.invalid`, passwordHash: 'integration-only-hash',
      firstName: 'Leave', lastName: 'Applicant',
    }, select: { id: true } });
    const reviewer = await prisma.user.create({ data: {
      companyId, email: `pc-g-reviewer-${suffix}@example.invalid`, passwordHash: 'integration-only-hash',
      firstName: 'PC-G', lastName: 'Reviewer',
    }, select: { id: true } });
    applicantUserId = applicant.id;
    reviewerUserId = reviewer.id;
    await prisma.role.create({ data: {
      companyId,
      key: `pc-g-hr-${suffix}`,
      name: `PC-G HR ${suffix}`,
      systemName: RoleName.HR,
      users: { create: { userId: reviewerUserId } },
    } });
    applicantEmployeeId = (await prisma.employee.create({ data: {
      companyId, userId: applicantUserId, employeeCode: `PCG-${suffix.slice(0, 8)}`,
      joiningDate: new Date('2026-01-01T00:00:00.000Z'), employmentType: EmploymentType.FULL_TIME,
      workMode: WorkMode.REMOTE,
    }, select: { id: true } })).id;
    leaveTypeId = (await prisma.leaveType.create({ data: {
      companyId, name: `PC-G Annual ${suffix}`, code: `PCG-${suffix}`,
      defaultDays: 12, requiresApproval: true, managerCanApprove: true,
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
      await prisma.user.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.company.delete({ where: { id: ownedCompanyId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const status of [LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED] as const) {
    it(`persists one ${status} applicant Notification and EMAIL Delivery`, async () => {
      const requestId = await pendingRequest();
      const result = await leaveService(prisma).review(requestId, { status }, actor());
      assert.equal(result.status, status);
      const rows = await prisma.notification.findMany({
        where: { userId: applicantUserId, type: status === LeaveRequestStatus.APPROVED
          ? NotificationType.LEAVE_APPROVED : NotificationType.LEAVE_REJECTED,
          detailsPath: `/leave/requests/${requestId}` }, include: { deliveries: true },
      });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].companyId, companyId);
      assert.equal(rows[0].deliveries.length, 1);
      assert.equal(rows[0].deliveries[0].recipient, `pc-g-applicant-${suffix}@example.invalid`);
    });
  }

  it('allows only the concurrent PC-G0 winner to create decision email', async () => {
    const requestId = await pendingRequest();
    const barrier = new Barrier();
    const clients = [new PrismaClient(), new PrismaClient()];
    await Promise.all(clients.map((client) => client.$connect()));
    try {
      const services = clients.map((client) => leaveService(coordinatedPrisma(client, barrier)));
      const results = await Promise.allSettled([
        services[0].review(requestId, { status: LeaveRequestStatus.APPROVED }, actor()),
        services[1].review(requestId, { status: LeaveRequestStatus.REJECTED }, actor()),
      ]);
      assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
      const rejected = results.filter((row) => row.status === 'rejected') as PromiseRejectedResult[];
      assert.equal(rejected.length, 1);
      assert.ok(rejected[0].reason instanceof BadRequestException);
      const notifications = await prisma.notification.findMany({
        where: { userId: applicantUserId, detailsPath: `/leave/requests/${requestId}` }, include: { deliveries: true },
      });
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0].deliveries.length, 1);
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
  });

  it('creates zero email when a post-claim transaction write rolls back', async () => {
    const requestId = await pendingRequest();
    const fn = `pc_g_email_rollback_${suffix.replaceAll('-', '_')}`;
    const trigger = `${fn}_trigger`;
    try {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger AS $$ BEGIN IF NEW."entityId" = '${requestId}' THEN RAISE EXCEPTION 'rollback'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
      await assert.rejects(() => leaveService(prisma).review(requestId, { status: LeaveRequestStatus.APPROVED }, actor()));
      assert.equal((await prisma.leaveRequest.findUniqueOrThrow({ where: { id: requestId } })).status, LeaveRequestStatus.PENDING);
      assert.equal(await prisma.notification.count({ where: { detailsPath: `/leave/requests/${requestId}` } }), 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
  });

  it('converges concurrent replay of one history identity to one Notification and Delivery', async () => {
    const requestId = randomUUID();
    const historyId = randomUUID();
    const input = {
      decisionHistoryId: historyId, type: NotificationType.LEAVE_APPROVED,
      applicantUserId, expectedCompanyId: companyId!,
      payload: { leaveRequestId: requestId, leaveTypeName: 'Annual Leave', startDate: '2026-10-10', endDate: '2026-10-11' },
    };
    const services = [notificationService(prisma), notificationService(prisma)];
    const results = await Promise.all(services.map((service) => service.createLeaveDecisionEmail(input)));
    assert.deepEqual(results.map((row) => row.created).sort(), [false, true]);
    const rows = await prisma.notification.findMany({ where: { idempotencyKey: `${historyId}:LEAVE_APPROVED:${applicantUserId}:EMAIL` }, include: { deliveries: true } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].deliveries.length, 1);
  });

  it('creates no workflow email when applicant email is disabled', async () => {
    await prisma.notificationPreference.upsert({
      where: { userId: applicantUserId }, update: { emailEnabled: false },
      create: { userId: applicantUserId, companyId, emailEnabled: false },
    });
    const requestId = await pendingRequest();
    assert.equal((await leaveService(prisma).review(requestId, { status: LeaveRequestStatus.REJECTED }, actor())).status,
      LeaveRequestStatus.REJECTED);
    assert.equal(await prisma.notification.count({ where: { detailsPath: `/leave/requests/${requestId}` } }), 0);
    await prisma.notificationPreference.update({ where: { userId: applicantUserId }, data: { emailEnabled: true } });
  });

  async function pendingRequest() {
    return (await prisma.leaveRequest.create({ data: {
      companyId: companyId!, employeeId: applicantEmployeeId, leaveTypeId,
      startDate: new Date('2027-03-10T00:00:00.000Z'), endDate: new Date('2027-03-11T00:00:00.000Z'),
      totalDays: 2, status: LeaveRequestStatus.PENDING,
      assignedApproverUserId: reviewerUserId,
      approvalAuthorityVersion: 1,
    }, select: { id: true } })).id;
  }
});

function notificationService(client: PrismaClient) {
  return new NotificationsService(
    client as never,
    new NotificationRecipientResolver(client as never),
    new NotificationPreferenceService(client as never),
    {} as never,
  );
}

function leaveService(client: PrismaClient) {
  return new LeaveService(client as never, notificationService(client));
}

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
