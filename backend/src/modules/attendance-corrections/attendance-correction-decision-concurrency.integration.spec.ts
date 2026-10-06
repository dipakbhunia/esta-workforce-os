import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AttendanceCorrectionStatus,
  AttendanceCorrectionType,
  EmploymentType,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { AttendanceCorrectionsService } from './attendance-corrections.service';

const enabled = process.env.RUN_ATTENDANCE_CORRECTION_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

class Barrier {
  private arrivals = 0;
  private release!: () => void;
  private readonly ready = new Promise<void>((resolve) => { this.release = resolve; });
  async arrive() { this.arrivals += 1; if (this.arrivals === 2) this.release(); await this.ready; }
}

describeDb('PC-H0 PostgreSQL Attendance correction decision concurrency', () => {
  const suffix = randomUUID();
  let companyId: string;
  let employeeUserId: string;
  let employeeId: string;
  let reviewerUserId: string;
  let day = 1;

  const reviewer = () => ({
    id: reviewerUserId, companyId, email: `pc-h0-reviewer-${suffix}@example.invalid`,
    firstName: 'PC-H0', lastName: 'Reviewer', status: UserStatus.ACTIVE, roles: [RoleName.HR],
  });
  const requester = () => ({
    id: employeeUserId, companyId, email: `pc-h0-employee-${suffix}@example.invalid`,
    firstName: 'Attend', lastName: 'Employee', status: UserStatus.ACTIVE, roles: [RoleName.EMPLOYEE],
  });

  before(async () => {
    await prisma.$connect();
    companyId = (await prisma.company.create({ data: { name: `PC-H0 ${suffix}`, slug: `pc-h0-${suffix}` }, select: { id: true } })).id;
    const [employeeUser, reviewerUser] = await Promise.all([
      prisma.user.create({ data: { companyId, email: requester().email, passwordHash: 'integration-only-hash', firstName: 'Attend', lastName: 'Employee' }, select: { id: true } }),
      prisma.user.create({ data: { companyId, email: reviewer().email, passwordHash: 'integration-only-hash', firstName: 'PC-H0', lastName: 'Reviewer' }, select: { id: true } }),
    ]);
    employeeUserId = employeeUser.id;
    reviewerUserId = reviewerUser.id;
    employeeId = (await prisma.employee.create({ data: {
      companyId, userId: employeeUserId, employeeCode: `PCH0-${suffix.slice(0, 8)}`,
      joiningDate: new Date('2026-01-01T00:00:00.000Z'), employmentType: EmploymentType.FULL_TIME, workMode: WorkMode.REMOTE,
    }, select: { id: true } })).id;
  });

  after(async () => {
    const ownedCompanyId = companyId;
    try {
      if (!ownedCompanyId) return;
      await prisma.auditLog.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.attendanceCorrectionRequest.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.attendance.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.employee.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.user.deleteMany({ where: { companyId: ownedCompanyId } });
      await prisma.company.delete({ where: { id: ownedCompanyId } });
    } finally { await prisma.$disconnect(); }
  });

  for (const [left, right] of [
    [AttendanceCorrectionStatus.APPROVED, AttendanceCorrectionStatus.APPROVED],
    [AttendanceCorrectionStatus.APPROVED, AttendanceCorrectionStatus.REJECTED],
    [AttendanceCorrectionStatus.REJECTED, AttendanceCorrectionStatus.REJECTED],
  ] as const) {
    it(`elects one durable winner for ${left} vs ${right}`, async () => {
      const fixture = await pendingRequest();
      const results = await race(
        (service) => service.review(fixture.requestId, { status: left }, reviewer()),
        (service) => service.review(fixture.requestId, { status: right }, reviewer()),
      );
      assertOneWinner(results, 'Only pending requests can be reviewed');
      const evidence = await durableEvidence(fixture.requestId, fixture.attendanceId);
      const winner = evidence.request.status;
      assert.equal((results.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<{ status: string }>).value.status, winner);
      assert.equal(evidence.decisionAudits.length, 1);
      assert.equal(evidence.decisionAudits[0].action, `ATTENDANCE_CORRECTION_${winner}`);
      assert.equal(evidence.appliedAudits.length, winner === AttendanceCorrectionStatus.APPROVED ? 1 : 0);
      assert.equal(evidence.logs.length, winner === AttendanceCorrectionStatus.APPROVED ? 1 : 0);
      assert.equal(evidence.attendance.punchOutAt?.toISOString(), winner === AttendanceCorrectionStatus.APPROVED
        ? fixture.requestedPunchOutAt.toISOString() : fixture.originalPunchOutAt.toISOString());
    });
  }

  it('elects exactly one winner for review vs cancel without contradictory evidence', async () => {
    const fixture = await pendingRequest();
    const results = await race(
      (service) => service.review(fixture.requestId, { status: AttendanceCorrectionStatus.APPROVED }, reviewer()),
      (service) => service.cancel(fixture.requestId, requester()),
    );
    assertOneWinner(results);
    const evidence = await durableEvidence(fixture.requestId, fixture.attendanceId);
    assert.ok([AttendanceCorrectionStatus.APPROVED, AttendanceCorrectionStatus.CANCELLED].includes(evidence.request.status));
    assert.equal(evidence.decisionAudits.length, evidence.request.status === AttendanceCorrectionStatus.APPROVED ? 1 : 0);
    assert.equal(evidence.cancelAudits.length, evidence.request.status === AttendanceCorrectionStatus.CANCELLED ? 1 : 0);
    assert.equal(evidence.appliedAudits.length, evidence.request.status === AttendanceCorrectionStatus.APPROVED ? 1 : 0);
    assert.equal(evidence.logs.length, evidence.request.status === AttendanceCorrectionStatus.APPROVED ? 1 : 0);
  });

  it('rolls back claim, Attendance mutation, log, and audits when decision audit fails', async () => {
    const fixture = await pendingRequest();
    const fn = `pc_h0_rollback_${suffix.replaceAll('-', '_')}`;
    const trigger = `${fn}_trigger`;
    try {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${fn}"() RETURNS trigger AS $$ BEGIN IF NEW."entityType" = 'AttendanceCorrectionRequest' AND NEW."entityId" = '${fixture.requestId}' THEN RAISE EXCEPTION 'PC-H0 rollback'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${trigger}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${fn}"()`);
      await assert.rejects(() => new AttendanceCorrectionsService(prisma as never).review(
        fixture.requestId, { status: AttendanceCorrectionStatus.APPROVED }, reviewer(),
      ));
      const evidence = await durableEvidence(fixture.requestId, fixture.attendanceId);
      assert.equal(evidence.request.status, AttendanceCorrectionStatus.PENDING);
      assert.equal(evidence.attendance.punchOutAt?.toISOString(), fixture.originalPunchOutAt.toISOString());
      assert.equal(evidence.logs.length, 0);
      assert.equal(evidence.decisionAudits.length, 0);
      assert.equal(evidence.appliedAudits.length, 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${trigger}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${fn}"()`);
    }
  });

  it('preserves sequential terminal errors, tenant isolation, and employee denial', async () => {
    const service = new AttendanceCorrectionsService(prisma as never);
    const approved = await pendingRequest();
    assert.equal((await service.review(approved.requestId, { status: AttendanceCorrectionStatus.APPROVED }, reviewer())).status,
      AttendanceCorrectionStatus.APPROVED);
    await assert.rejects(() => service.review(approved.requestId, { status: AttendanceCorrectionStatus.REJECTED }, reviewer()),
      (error: unknown) => error instanceof BadRequestException && error.message === 'Only pending requests can be reviewed');
    const rejected = await pendingRequest();
    assert.equal((await service.review(rejected.requestId, { status: AttendanceCorrectionStatus.REJECTED }, reviewer())).status,
      AttendanceCorrectionStatus.REJECTED);
    const cancelled = await pendingRequest();
    assert.equal((await service.cancel(cancelled.requestId, requester())).status, AttendanceCorrectionStatus.CANCELLED);
    await assert.rejects(() => service.review(cancelled.requestId, { status: AttendanceCorrectionStatus.APPROVED }, reviewer()), BadRequestException);
    const isolated = await pendingRequest();
    await assert.rejects(() => service.review(isolated.requestId, { status: AttendanceCorrectionStatus.APPROVED }, {
      ...reviewer(), companyId: randomUUID(),
    }), NotFoundException);
    await assert.rejects(() => service.review(isolated.requestId, { status: AttendanceCorrectionStatus.APPROVED }, requester()), ForbiddenException);
  });

  async function pendingRequest() {
    const currentDay = day++;
    const date = `2027-01-${String(currentDay).padStart(2, '0')}`;
    const originalPunchOutAt = new Date(`${date}T17:00:00.000Z`);
    const requestedPunchOutAt = new Date(`${date}T18:00:00.000Z`);
    const attendance = await prisma.attendance.create({ data: {
      companyId, employeeId, attendanceDate: new Date(`${date}T00:00:00.000Z`), workDate: new Date(`${date}T00:00:00.000Z`),
      punchInAt: new Date(`${date}T09:00:00.000Z`), punchOutAt: originalPunchOutAt,
      expectedMinutes: 480, workedMinutes: 480, shiftStartTime: '09:00', shiftEndTime: '17:00', shiftTimezone: 'UTC',
    }, select: { id: true } });
    const request = await prisma.attendanceCorrectionRequest.create({ data: {
      companyId, attendanceId: attendance.id, employeeId, requestedByUserId: employeeUserId,
      type: AttendanceCorrectionType.TIME_CORRECTION, originalPunchInAt: new Date(`${date}T09:00:00.000Z`),
      originalPunchOutAt, requestedPunchOutAt, reason: 'Correct punch out',
    }, select: { id: true } });
    return { requestId: request.id, attendanceId: attendance.id, originalPunchOutAt, requestedPunchOutAt };
  }

  async function race<T>(left: (service: AttendanceCorrectionsService) => Promise<T>, right: (service: AttendanceCorrectionsService) => Promise<T>) {
    const barrier = new Barrier();
    const clients = [new PrismaClient(), new PrismaClient()];
    await Promise.all(clients.map((client) => client.$connect()));
    try {
      const services = clients.map((client) => new AttendanceCorrectionsService(coordinatedPrisma(client, barrier) as never));
      return await Promise.allSettled([left(services[0]), right(services[1])]);
    } finally { await Promise.all(clients.map((client) => client.$disconnect())); }
  }

  function assertOneWinner(results: PromiseSettledResult<unknown>[], expectedMessage?: string) {
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const loser = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    assert.ok(loser.reason instanceof BadRequestException);
    if (expectedMessage) assert.equal(loser.reason.message, expectedMessage);
  }

  async function durableEvidence(requestId: string, attendanceId: string) {
    const [request, attendance, logs, decisionAudits, appliedAudits, cancelAudits] = await Promise.all([
      prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: requestId } }),
      prisma.attendance.findUniqueOrThrow({ where: { id: attendanceId } }),
      prisma.attendanceLog.findMany({ where: { attendanceId, note: { contains: requestId } } }),
      prisma.auditLog.findMany({ where: { entityType: 'AttendanceCorrectionRequest', entityId: requestId,
        action: { in: ['ATTENDANCE_CORRECTION_APPROVED', 'ATTENDANCE_CORRECTION_REJECTED'] } } }),
      prisma.auditLog.findMany({ where: { entityType: 'Attendance', entityId: attendanceId, action: 'ATTENDANCE_CORRECTION_APPLIED' } }),
      prisma.auditLog.findMany({ where: { entityType: 'AttendanceCorrectionRequest', entityId: requestId,
        action: 'ATTENDANCE_CORRECTION_CANCELLED' } }),
    ]);
    return { request, attendance, logs, decisionAudits, appliedAudits, cancelAudits };
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
