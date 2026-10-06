import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import {
  AttendanceCorrectionStatus,
  AttendanceCorrectionType,
  EmploymentType,
  NotificationType,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { NotificationPreferenceService } from '../notifications/notification-preference.service';
import { NotificationRecipientResolver } from '../notifications/notification-recipient-resolver.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

const enabled = process.env.RUN_ATTENDANCE_CORRECTION_EMAIL_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

class Barrier {
  private arrivals = 0;
  private release!: () => void;
  private readonly ready = new Promise<void>((resolve) => { this.release = resolve; });
  async arrive() { this.arrivals += 1; if (this.arrivals === 2) this.release(); await this.ready; }
}

describeDb('PC-H PostgreSQL Attendance correction decision email', () => {
  const suffix = randomUUID();
  let companyId: string | null = null;
  let employeeUserId: string;
  let employeeId: string;
  let reviewerUserId: string;
  let day = 1;

  const reviewer = () => ({ id: reviewerUserId, companyId, email: `pc-h-reviewer-${suffix}@example.invalid`,
    firstName: 'PC-H', lastName: 'Reviewer', status: UserStatus.ACTIVE, roles: [RoleName.HR] });

  before(async () => {
    await prisma.$connect();
    companyId = (await prisma.company.create({ data: { name: `PC-H ${suffix}`, slug: `pc-h-${suffix}` }, select: { id: true } })).id;
    const employee = await prisma.user.create({ data: { companyId, email: `pc-h-employee-${suffix}@example.invalid`,
      passwordHash: 'integration-only-hash', firstName: 'Attend', lastName: 'Employee' }, select: { id: true } });
    const reviewerUser = await prisma.user.create({ data: { companyId, email: reviewer().email,
      passwordHash: 'integration-only-hash', firstName: 'PC-H', lastName: 'Reviewer' }, select: { id: true } });
    employeeUserId = employee.id;
    reviewerUserId = reviewerUser.id;
    employeeId = (await prisma.employee.create({ data: { companyId, userId: employeeUserId,
      employeeCode: `PCH-${suffix.slice(0, 8)}`, joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentType: EmploymentType.FULL_TIME, workMode: WorkMode.REMOTE }, select: { id: true } })).id;
  });

  after(async () => {
    const owned = companyId;
    try {
      if (!owned) return;
      await prisma.notificationDelivery.deleteMany({ where: { notification: { companyId: owned } } });
      await prisma.notification.deleteMany({ where: { companyId: owned } });
      await prisma.notificationPreference.deleteMany({ where: { companyId: owned } });
      await prisma.auditLog.deleteMany({ where: { companyId: owned } });
      await prisma.attendanceCorrectionRequest.deleteMany({ where: { companyId: owned } });
      await prisma.attendance.deleteMany({ where: { companyId: owned } });
      await prisma.employee.deleteMany({ where: { companyId: owned } });
      await prisma.user.deleteMany({ where: { companyId: owned } });
      await prisma.company.delete({ where: { id: owned } });
    } finally { await prisma.$disconnect(); }
  });

  for (const [left, right] of [
    [AttendanceCorrectionStatus.APPROVED, AttendanceCorrectionStatus.APPROVED],
    [AttendanceCorrectionStatus.APPROVED, AttendanceCorrectionStatus.REJECTED],
    [AttendanceCorrectionStatus.REJECTED, AttendanceCorrectionStatus.REJECTED],
  ] as const) {
    it(`creates one winner email for ${left} vs ${right}`, async () => {
      const fixture = await pendingRequest();
      const results = await race(
        (service) => service.review(fixture.requestId, { status: left }, reviewer()),
        (service) => service.review(fixture.requestId, { status: right }, reviewer()),
      );
      assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
      assert.ok((results.find((row) => row.status === 'rejected') as PromiseRejectedResult).reason instanceof BadRequestException);
      const request = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: fixture.requestId } });
      const rows = await decisionNotifications(fixture.requestId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].type, request.status === AttendanceCorrectionStatus.APPROVED
        ? NotificationType.ATTENDANCE_CORRECTION_APPROVED : NotificationType.ATTENDANCE_CORRECTION_REJECTED);
      assert.equal(rows[0].userId, employeeUserId);
      assert.equal(rows[0].companyId, companyId);
      assert.equal(rows[0].deliveries.length, 1);
      assert.equal(rows[0].deliveries[0].recipient, `pc-h-employee-${suffix}@example.invalid`);
      assert.equal(await prisma.notification.count({ where: { userId: reviewerUserId, detailsPath: `/attendance/corrections/${fixture.requestId}` } }), 0);
    });
  }

  it('creates email iff review wins against cancellation', async () => {
    const fixture = await pendingRequest();
    const requester = { ...reviewer(), id: employeeUserId, email: `pc-h-employee-${suffix}@example.invalid`, roles: [RoleName.EMPLOYEE] };
    const results = await race(
      (service) => service.review(fixture.requestId, { status: AttendanceCorrectionStatus.APPROVED }, reviewer()),
      (service) => service.cancel(fixture.requestId, requester),
    );
    assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
    const request = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: fixture.requestId } });
    assert.equal((await decisionNotifications(fixture.requestId)).length,
      request.status === AttendanceCorrectionStatus.APPROVED ? 1 : 0);
  });

  it('creates zero email when the decision transaction rolls back', async () => {
    const fixture = await pendingRequest();
    const fn = `pc_h_email_rollback_${suffix.replaceAll('-', '_')}`;
    const trigger = `${fn}_trigger`;
    try {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger AS $$ BEGIN IF NEW."entityType" = 'AttendanceCorrectionRequest' AND NEW."entityId" = '${fixture.requestId}' THEN RAISE EXCEPTION 'rollback'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
      await assert.rejects(() => attendanceService(prisma).review(fixture.requestId,
        { status: AttendanceCorrectionStatus.APPROVED }, reviewer()));
      assert.equal((await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: fixture.requestId } })).status,
        AttendanceCorrectionStatus.PENDING);
      assert.equal((await decisionNotifications(fixture.requestId)).length, 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
  });

  it('honors disabled and missing preferences', async () => {
    await prisma.notificationPreference.upsert({ where: { userId: employeeUserId }, update: { emailEnabled: false },
      create: { userId: employeeUserId, companyId, emailEnabled: false } });
    const disabled = await pendingRequest();
    await attendanceService(prisma).review(disabled.requestId, { status: AttendanceCorrectionStatus.REJECTED }, reviewer());
    assert.equal((await decisionNotifications(disabled.requestId)).length, 0);
    await prisma.notificationPreference.delete({ where: { userId: employeeUserId } });
    const defaulted = await pendingRequest();
    await attendanceService(prisma).review(defaulted.requestId, { status: AttendanceCorrectionStatus.REJECTED }, reviewer());
    assert.equal((await decisionNotifications(defaulted.requestId)).length, 1);
  });

  it('converges repeated enqueue of the same decision audit to one Notification and Delivery', async () => {
    const fixture = await pendingRequest();
    await attendanceService(prisma).review(fixture.requestId, { status: AttendanceCorrectionStatus.APPROVED }, reviewer());
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityType: 'AttendanceCorrectionRequest', entityId: fixture.requestId,
      action: 'ATTENDANCE_CORRECTION_APPROVED' } });
    const input = { decisionAuditId: audit.id, type: NotificationType.ATTENDANCE_CORRECTION_APPROVED,
      employeeUserId, expectedCompanyId: companyId!, payload: { attendanceCorrectionRequestId: fixture.requestId, attendanceDate: fixture.date } };
    const results = await Promise.all([notificationService(prisma), notificationService(prisma)]
      .map((service) => service.createAttendanceCorrectionDecisionEmail(input)));
    assert.deepEqual(results.map((row) => row.created), [false, false]);
    const rows = await decisionNotifications(fixture.requestId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].deliveries.length, 1);
  });

  it('excludes soft-deleted, wrong-tenant, and platform users from recipient authority', async () => {
    const service = notificationService(prisma);
    const payload = { attendanceCorrectionRequestId: randomUUID(), attendanceDate: '2027-04-20' };
    const base = { decisionAuditId: randomUUID(), type: NotificationType.ATTENDANCE_CORRECTION_APPROVED,
      expectedCompanyId: companyId!, payload };
    await prisma.user.update({ where: { id: employeeUserId }, data: { deletedAt: new Date() } });
    try {
      await assert.rejects(() => service.createAttendanceCorrectionDecisionEmail({ ...base, employeeUserId }),
        /recipient was not found/);
    } finally {
      await prisma.user.update({ where: { id: employeeUserId }, data: { deletedAt: null } });
    }

    let otherCompany: { id: string } | null = null;
    let wrongTenant: { id: string } | null = null;
    let platform: { id: string } | null = null;
    try {
      otherCompany = await prisma.company.create({ data: { name: `PC-H other ${suffix}`, slug: `pc-h-other-${suffix}` }, select: { id: true } });
      wrongTenant = await prisma.user.create({ data: { companyId: otherCompany.id,
        email: `pc-h-other-${suffix}@example.invalid`, passwordHash: 'integration-only-hash', firstName: 'Wrong', lastName: 'Tenant' }, select: { id: true } });
      platform = await prisma.user.create({ data: { companyId: null,
        email: `pc-h-platform-${suffix}@example.invalid`, passwordHash: 'integration-only-hash', firstName: 'Platform', lastName: 'User' }, select: { id: true } });
      await assert.rejects(() => service.createAttendanceCorrectionDecisionEmail({ ...base,
        decisionAuditId: randomUUID(), employeeUserId: wrongTenant.id }), /recipient was not found/);
      await assert.rejects(() => service.createAttendanceCorrectionDecisionEmail({ ...base,
        decisionAuditId: randomUUID(), employeeUserId: platform.id }), /recipient was not found/);
    } finally {
      if (platform) await prisma.user.delete({ where: { id: platform.id } });
      if (wrongTenant) await prisma.user.delete({ where: { id: wrongTenant.id } });
      if (otherCompany) await prisma.company.delete({ where: { id: otherCompany.id } });
    }
  });

  async function pendingRequest() {
    const date = `2027-04-${String(day++).padStart(2, '0')}`;
    const attendance = await prisma.attendance.create({ data: { companyId: companyId!, employeeId,
      attendanceDate: new Date(`${date}T00:00:00.000Z`), workDate: new Date(`${date}T00:00:00.000Z`),
      punchInAt: new Date(`${date}T09:00:00.000Z`), punchOutAt: new Date(`${date}T17:00:00.000Z`),
      expectedMinutes: 480, workedMinutes: 480, shiftStartTime: '09:00', shiftEndTime: '17:00', shiftTimezone: 'UTC' }, select: { id: true } });
    const request = await prisma.attendanceCorrectionRequest.create({ data: { companyId: companyId!, attendanceId: attendance.id,
      employeeId, requestedByUserId: employeeUserId, type: AttendanceCorrectionType.TIME_CORRECTION,
      originalPunchInAt: new Date(`${date}T09:00:00.000Z`), originalPunchOutAt: new Date(`${date}T17:00:00.000Z`),
      requestedPunchOutAt: new Date(`${date}T18:00:00.000Z`), reason: 'Correct punch out' }, select: { id: true } });
    return { requestId: request.id, date };
  }

  async function decisionNotifications(requestId: string) {
    return prisma.notification.findMany({ where: { detailsPath: `/attendance/corrections/${requestId}` }, include: { deliveries: true } });
  }

  async function race<T>(left: (service: AttendanceCorrectionsService) => Promise<T>, right: (service: AttendanceCorrectionsService) => Promise<T>) {
    const barrier = new Barrier();
    const clients = [new PrismaClient(), new PrismaClient()];
    await Promise.all(clients.map((client) => client.$connect()));
    try {
      const services = clients.map((client) => attendanceService(coordinatedPrisma(client, barrier)));
      return await Promise.allSettled([left(services[0]), right(services[1])]);
    } finally { await Promise.all(clients.map((client) => client.$disconnect())); }
  }
});

function notificationService(client: PrismaClient) {
  return new NotificationsService(client as never, new NotificationRecipientResolver(client as never),
    new NotificationPreferenceService(client as never), {} as never);
}

function attendanceService(client: PrismaClient) {
  return new AttendanceCorrectionsService(client as never, notificationService(client));
}

function coordinatedPrisma(client: PrismaClient, barrier: Barrier): PrismaClient {
  return new Proxy(client, { get(target, property, receiver) {
    if (property === '$transaction') return (callback: (tx: unknown) => Promise<unknown>, ...options: unknown[]) =>
      target.$transaction(async (tx) => { await barrier.arrive(); return callback(tx); }, ...(options as []));
    const value = Reflect.get(target, property, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
