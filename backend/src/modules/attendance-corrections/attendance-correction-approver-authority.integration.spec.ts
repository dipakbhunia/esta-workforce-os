import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttendanceCorrectionStatus, AttendanceCorrectionType, AttendanceStatus, EmployeeStatus, EmploymentType, Prisma, PrismaClient, RoleName, UserStatus, WorkMode } from '@prisma/client';
import { AttendanceCorrectionsService } from './attendance-corrections.service';
import { CompaniesService } from '../companies/companies.service';

const enabled = process.env.RUN_ATTENDANCE_CORRECTION_AUTHORITY_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

describeDb('PC-K PostgreSQL attendance correction authority', () => {
  const suffix = randomUUID();
  let companyId: string;
  let applicantUserId: string;
  let applicantEmployeeId: string;
  let managerUserId: string;
  let managerEmployeeId: string;
  let otherManagerUserId: string;
  let otherManagerEmployeeId: string;
  let fallbackUserId: string;
  let fallbackEmployeeId: string;
  let adminUserId: string;
  let managerRoleId: string;
  let hrRoleId: string;
  let employeeRoleId: string;
  const notificationCalls: any[] = [];
  const decisionNotificationCalls: any[] = [];
  let notificationFailure = false;
  const notifications = {
    createAttendanceCorrectionAppliedEmail: async (input: unknown) => {
      notificationCalls.push(input);
      if (notificationFailure) throw new Error('PC-K notification failure');
      return { created: true };
    },
    createAttendanceCorrectionDecisionEmail: async (input: unknown) => {
      decisionNotificationCalls.push(input);
      return { created: true };
    },
  };
  const actor = (id: string, role: RoleName) => ({ id, companyId, email: `${id}@example.invalid`, firstName: 'PC-K', lastName: role, status: UserStatus.ACTIVE, roles: [role] });

  before(async () => {
    await prisma.$connect();
    companyId = (await prisma.company.create({ data: { name: `PC-K ${suffix}`, slug: `pc-k-${suffix}` }, select: { id: true } })).id;
    employeeRoleId = await role(RoleName.EMPLOYEE, 'employee');
    managerRoleId = await role(RoleName.MANAGER, 'manager');
    hrRoleId = await role(RoleName.HR, 'hr');
    const adminRole = await role(RoleName.COMPANY_ADMIN, 'admin');
    applicantUserId = await user('applicant', employeeRoleId);
    managerUserId = await user('manager', managerRoleId);
    otherManagerUserId = await user('other-manager', managerRoleId);
    fallbackUserId = await user('fallback', hrRoleId);
    adminUserId = await user('admin', adminRole);
    managerEmployeeId = await employee(managerUserId, 'MGR');
    otherManagerEmployeeId = await employee(otherManagerUserId, 'MGR2');
    applicantEmployeeId = await employee(applicantUserId, 'APP', managerEmployeeId);
    fallbackEmployeeId = await employee(fallbackUserId, 'HR');
    await employee(adminUserId, 'ADM');
  });

  after(async () => {
    try {
      await prisma.notificationDelivery.deleteMany({ where: { notification: { companyId } } });
      await prisma.notification.deleteMany({ where: { companyId } });
      await prisma.auditLog.deleteMany({ where: { companyId } });
      await prisma.attendanceCorrectionRequest.deleteMany({ where: { companyId } });
      await prisma.attendance.deleteMany({ where: { companyId } });
      await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: null } });
      await prisma.employee.deleteMany({ where: { companyId } });
      await prisma.userRole.deleteMany({ where: { user: { companyId } } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.role.deleteMany({ where: { companyId } });
      await prisma.company.delete({ where: { id: companyId } });
    } finally { await prisma.$disconnect(); }
  });

  it('snapshots the valid reporting manager and restricts versioned review to that user', async () => {
    notificationCalls.length = 0;
    const request = await service().create(await dto('2035-01-10'), actor(applicantUserId, RoleName.EMPLOYEE));
    const row = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(row.assignedApproverUserId, managerUserId);
    assert.equal(row.approvalAuthorityVersion, 1);
    assert.equal(notificationCalls[0].assignedApproverUserId, managerUserId);
    assert.equal(notificationCalls[0].attendanceCorrectionRequestId, row.id);
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: otherManagerEmployeeId } });
    await assert.rejects(() => service().review(row.id, { status: AttendanceCorrectionStatus.APPROVED }, actor(adminUserId, RoleName.COMPANY_ADMIN)), ForbiddenException);
    await assert.rejects(() => service().review(row.id, { status: AttendanceCorrectionStatus.APPROVED }, actor(fallbackUserId, RoleName.HR)), ForbiddenException);
    await assert.rejects(() => service().review(row.id, { status: AttendanceCorrectionStatus.APPROVED }, actor(otherManagerUserId, RoleName.MANAGER)), ForbiddenException);
    await assert.rejects(() => service().review(row.id, { status: AttendanceCorrectionStatus.APPROVED }, actor(applicantUserId, RoleName.EMPLOYEE)), ForbiddenException);
    assert.equal((await service().review(row.id, { status: AttendanceCorrectionStatus.REJECTED }, actor(managerUserId, RoleName.MANAGER))).status, AttendanceCorrectionStatus.REJECTED);
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
  });

  it('uses fallback for an invalid or self reporting manager and rejects an unusable fallback', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: fallbackUserId } });
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: managerEmployeeId } });
    await prisma.user.update({ where: { id: managerUserId }, data: { status: UserStatus.INACTIVE } });
    const inactiveManager = await service().create(await dto('2035-01-15'), actor(applicantUserId, RoleName.EMPLOYEE));
    assert.equal((await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: inactiveManager.id } })).assignedApproverUserId, fallbackUserId);
    await prisma.user.update({ where: { id: managerUserId }, data: { status: UserStatus.ACTIVE } });
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: applicantEmployeeId } });
    const selfManager = await service().create(await dto('2035-01-16'), actor(applicantUserId, RoleName.EMPLOYEE));
    assert.equal((await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: selfManager.id } })).assignedApproverUserId, fallbackUserId);
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
    await prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.INACTIVE } });
    const invalidFallbackDto = await dto('2035-01-17');
    await assert.rejects(() => service().create(invalidFallbackDto, actor(applicantUserId, RoleName.EMPLOYEE)), ConflictException);
    await prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.ACTIVE } });
  });

  it('uses the configured fallback, blocks self/invalid authority, and preserves configuration API isolation', async () => {
    const companies = new CompaniesService(prisma as never);
    await companies.updateDesignatedAttendanceApprover({ designatedAttendanceApproverUserId: fallbackUserId }, actor(adminUserId, RoleName.COMPANY_ADMIN));
    const request = await service().create(await dto('2035-01-11'), actor(applicantUserId, RoleName.EMPLOYEE));
    const row = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(row.assignedApproverUserId, fallbackUserId);
    assert.equal((await service().review(row.id, { status: AttendanceCorrectionStatus.APPROVED }, actor(fallbackUserId, RoleName.HR))).status, AttendanceCorrectionStatus.APPROVED);
    await companies.updateDesignatedAttendanceApprover({ designatedAttendanceApproverUserId: null }, actor(adminUserId, RoleName.COMPANY_ADMIN));
    const noAuthorityDto = await dto('2035-01-12');
    await assert.rejects(() => service().create(noAuthorityDto, actor(applicantUserId, RoleName.EMPLOYEE)), ConflictException);
    await assert.rejects(() => companies.updateDesignatedAttendanceApprover(
      { designatedAttendanceApproverUserId: applicantUserId }, actor(adminUserId, RoleName.COMPANY_ADMIN)));
  });

  it('commits the request and audit when post-commit notification enqueue fails', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: fallbackUserId } });
    notificationFailure = true;
    try {
      const request = await service().create(await dto('2035-01-14'), actor(applicantUserId, RoleName.EMPLOYEE));
      assert.equal(await prisma.attendanceCorrectionRequest.count({ where: { id: request.id } }), 1);
      assert.equal(await prisma.auditLog.count({ where: { entityId: request.id, action: 'ATTENDANCE_CORRECTION_REQUESTED' } }), 1);
    } finally {
      notificationFailure = false;
    }
  });

  it('rolls request and audit back together and never enqueues on audit failure', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: fallbackUserId } });
    notificationCalls.length = 0;
    const attendanceDto = await dto('2035-01-13');
    const functionName = `pc_k_audit_${suffix.replaceAll('-', '_')}`;
    const triggerName = `${functionName}_trigger`;
    try {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$ BEGIN IF NEW."action" = 'ATTENDANCE_CORRECTION_REQUESTED' THEN RAISE EXCEPTION 'PC-K rollback'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
      await assert.rejects(() => service().create(attendanceDto, actor(applicantUserId, RoleName.EMPLOYEE)));
      assert.equal(await prisma.attendanceCorrectionRequest.count({ where: { attendanceId: attendanceDto.attendanceId } }), 0);
      assert.equal(notificationCalls.length, 0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }
  });

  it('serializes submission and review against every mutable approver eligibility fact', async () => {
    await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: fallbackUserId } });
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: managerEmployeeId } });
    const managerCases: Array<[string, (tx: Prisma.TransactionClient) => Promise<unknown>, () => Promise<unknown>]> = [
      ['manager User status', (tx) => tx.user.update({ where: { id: managerUserId }, data: { status: UserStatus.INACTIVE } }), () => prisma.user.update({ where: { id: managerUserId }, data: { status: UserStatus.ACTIVE } })],
      ['manager Employee status', (tx) => tx.employee.update({ where: { id: managerEmployeeId }, data: { status: EmployeeStatus.INACTIVE } }), () => prisma.employee.update({ where: { id: managerEmployeeId }, data: { status: EmployeeStatus.ACTIVE } })],
      ['manager role membership', (tx) => tx.userRole.delete({ where: { userId_roleId: { userId: managerUserId, roleId: managerRoleId } } }), () => prisma.userRole.create({ data: { userId: managerUserId, roleId: managerRoleId } })],
    ];
    let day = 20;
    for (const [label, mutate, restore] of managerCases) {
      const input = await dto(`2035-01-${day++}`);
      const result = await mutateBeforeAuthorityOperation(mutate, () => service().create(input, actor(applicantUserId, RoleName.EMPLOYEE)));
      assert.equal((await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: result.id } })).assignedApproverUserId, fallbackUserId, label);
      await restore();
    }

    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
    const fallbackCases: Array<[string, (tx: Prisma.TransactionClient) => Promise<unknown>, () => Promise<unknown>]> = [
      ['fallback User status', (tx) => tx.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.INACTIVE } }), () => prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.ACTIVE } })],
      ['fallback Employee status', (tx) => tx.employee.updateMany({ where: { userId: fallbackUserId }, data: { status: EmployeeStatus.INACTIVE } }), () => prisma.employee.updateMany({ where: { userId: fallbackUserId }, data: { status: EmployeeStatus.ACTIVE } })],
      ['fallback role membership', (tx) => tx.userRole.delete({ where: { userId_roleId: { userId: fallbackUserId, roleId: hrRoleId } } }), () => prisma.userRole.create({ data: { userId: fallbackUserId, roleId: hrRoleId } })],
    ];
    for (const [label, mutate, restore] of fallbackCases) {
      const input = await dto(`2035-01-${day++}`);
      await assert.rejects(() => mutateBeforeAuthorityOperation(mutate, () => service().create(input, actor(applicantUserId, RoleName.EMPLOYEE))), ConflictException, label);
      await restore();
    }

    const configInput = await dto(`2035-01-${day++}`);
    await assert.rejects(() => mutateBeforeAuthorityOperation(
      (tx) => tx.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: null } }),
      () => service().create(configInput, actor(applicantUserId, RoleName.EMPLOYEE)),
    ), ConflictException);

    await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: fallbackUserId } });
    const reviewCases: Array<[(tx: Prisma.TransactionClient) => Promise<unknown>, () => Promise<unknown>]> = [
      [(tx) => tx.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.INACTIVE } }), () => prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.ACTIVE } })],
      [(tx) => tx.employee.updateMany({ where: { userId: fallbackUserId }, data: { status: EmployeeStatus.INACTIVE } }), () => prisma.employee.updateMany({ where: { userId: fallbackUserId }, data: { status: EmployeeStatus.ACTIVE } })],
      [async (tx) => { await tx.userRole.delete({ where: { userId_roleId: { userId: fallbackUserId, roleId: hrRoleId } } }); await tx.userRole.create({ data: { userId: fallbackUserId, roleId: employeeRoleId } }); }, async () => { await prisma.userRole.delete({ where: { userId_roleId: { userId: fallbackUserId, roleId: employeeRoleId } } }); await prisma.userRole.create({ data: { userId: fallbackUserId, roleId: hrRoleId } }); }],
    ];
    for (const [mutate, restore] of reviewCases) {
      const request = await service().create(await dto(`2035-01-${day++}`), actor(applicantUserId, RoleName.EMPLOYEE));
      await assert.rejects(() => mutateBeforeAuthorityOperation(mutate, () => service().review(request.id, { status: AttendanceCorrectionStatus.APPROVED }, actor(fallbackUserId, RoleName.HR))), ForbiddenException);
      assert.equal((await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: request.id } })).status, AttendanceCorrectionStatus.PENDING);
      await restore();
    }
  });

  it('lets submission commit before concurrent authority revocation and preserves its snapshot', async () => {
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
    await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: fallbackUserId } });
    const cases: Array<[string, (tx: Prisma.TransactionClient) => Promise<unknown>, () => Promise<unknown>]> = [
      ['User status', (tx) => tx.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.INACTIVE } }), () => prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.ACTIVE } })],
      ['Employee status', (tx) => tx.employee.update({ where: { id: fallbackEmployeeId }, data: { status: EmployeeStatus.INACTIVE } }), () => prisma.employee.update({ where: { id: fallbackEmployeeId }, data: { status: EmployeeStatus.ACTIVE } })],
      ['UserRole removal', (tx) => tx.userRole.delete({ where: { userId_roleId: { userId: fallbackUserId, roleId: hrRoleId } } }), () => prisma.userRole.create({ data: { userId: fallbackUserId, roleId: hrRoleId } })],
      ['fallback configuration', (tx) => tx.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: null } }), () => prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: fallbackUserId } })],
    ];
    let day = 1;
    for (const [label, mutate, restore] of cases) {
      const callsBefore = notificationCalls.length;
      const input = await dto(`2035-02-${String(day++).padStart(2, '0')}`);
      try {
        const request = await authorityOperationBeforeMutation(
          'ATTENDANCE_CORRECTION_REQUESTED',
          () => service().create(input, actor(applicantUserId, RoleName.EMPLOYEE)),
          mutate,
        );
        const persisted = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: request.id } });
        assert.equal(persisted.assignedApproverUserId, fallbackUserId, label);
        assert.equal(persisted.approvalAuthorityVersion, 1, label);
        assert.equal(await prisma.auditLog.count({ where: { entityId: request.id, action: 'ATTENDANCE_CORRECTION_REQUESTED' } }), 1, label);
        assert.equal(notificationCalls.length, callsBefore + 1, label);
      } finally {
        await restore();
      }
    }
  });

  it('lets review commit before concurrent eligibility revocation with one decision', async () => {
    await prisma.employee.update({ where: { id: applicantEmployeeId }, data: { reportingManagerId: null } });
    await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: fallbackUserId } });
    const cases: Array<[string, (tx: Prisma.TransactionClient) => Promise<unknown>, () => Promise<unknown>]> = [
      ['User status', (tx) => tx.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.INACTIVE } }), () => prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.ACTIVE } })],
      ['Employee status', (tx) => tx.employee.update({ where: { id: fallbackEmployeeId }, data: { status: EmployeeStatus.INACTIVE } }), () => prisma.employee.update({ where: { id: fallbackEmployeeId }, data: { status: EmployeeStatus.ACTIVE } })],
      ['UserRole removal', (tx) => tx.userRole.delete({ where: { userId_roleId: { userId: fallbackUserId, roleId: hrRoleId } } }), () => prisma.userRole.create({ data: { userId: fallbackUserId, roleId: hrRoleId } })],
    ];
    let day = 10;
    for (const [label, mutate, restore] of cases) {
      const request = await service().create(await dto(`2035-02-${day++}`), actor(applicantUserId, RoleName.EMPLOYEE));
      const callsBefore = decisionNotificationCalls.length;
      try {
        await authorityOperationBeforeMutation(
          'ATTENDANCE_CORRECTION_APPROVED',
          () => service().review(request.id, { status: AttendanceCorrectionStatus.APPROVED }, actor(fallbackUserId, RoleName.HR)),
          mutate,
        );
        const persisted = await prisma.attendanceCorrectionRequest.findUniqueOrThrow({ where: { id: request.id } });
        assert.equal(persisted.status, AttendanceCorrectionStatus.APPROVED, label);
        assert.equal(persisted.reviewedByUserId, fallbackUserId, label);
        assert.equal(await prisma.auditLog.count({ where: { entityId: request.id, action: 'ATTENDANCE_CORRECTION_APPROVED' } }), 1, label);
        assert.equal(decisionNotificationCalls.length, callsBefore + 1, label);
      } finally {
        await restore();
      }
    }
  });

  it('enforces configuration eligibility and serializes concurrent configuration mutation', async () => {
    const companies = new CompaniesService(prisma as never);
    const admin = actor(adminUserId, RoleName.COMPANY_ADMIN);
    await prisma.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: null } });

    await prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.INACTIVE } });
    await assert.rejects(() => companies.updateDesignatedAttendanceApprover({ designatedAttendanceApproverUserId: fallbackUserId }, admin), NotFoundException);
    await prisma.user.update({ where: { id: fallbackUserId }, data: { status: UserStatus.ACTIVE } });
    await prisma.employee.updateMany({ where: { userId: fallbackUserId }, data: { status: EmployeeStatus.INACTIVE } });
    await assert.rejects(() => companies.updateDesignatedAttendanceApprover({ designatedAttendanceApproverUserId: fallbackUserId }, admin), NotFoundException);
    await prisma.employee.updateMany({ where: { userId: fallbackUserId }, data: { status: EmployeeStatus.ACTIVE } });
    await prisma.userRole.delete({ where: { userId_roleId: { userId: fallbackUserId, roleId: hrRoleId } } });
    await assert.rejects(() => companies.updateDesignatedAttendanceApprover({ designatedAttendanceApproverUserId: fallbackUserId }, admin), NotFoundException);
    await prisma.userRole.create({ data: { userId: fallbackUserId, roleId: hrRoleId } });

    const otherCompany = await prisma.company.create({ data: { name: `PC-K Other ${suffix}`, slug: `pc-k-other-${suffix}` } });
    const otherRole = await prisma.role.create({ data: { companyId: otherCompany.id, key: `pck-other-${suffix}`, name: 'PC-K Other HR', systemName: RoleName.HR } });
    const otherUser = await prisma.user.create({ data: { companyId: otherCompany.id, email: `pck-other-${suffix}@example.invalid`, passwordHash: 'integration-only-hash', firstName: 'Other', lastName: 'HR', roles: { create: { roleId: otherRole.id } } } });
    await prisma.employee.create({ data: { companyId: otherCompany.id, userId: otherUser.id, employeeCode: `OTHER-${suffix.slice(0, 8)}`, joiningDate: new Date('2026-01-01T00:00:00.000Z'), employmentType: EmploymentType.FULL_TIME, workMode: WorkMode.REMOTE } });
    try {
      await assert.rejects(() => companies.updateDesignatedAttendanceApprover({ designatedAttendanceApproverUserId: otherUser.id }, admin), NotFoundException);
    } finally {
      await prisma.employee.deleteMany({ where: { companyId: otherCompany.id } });
      await prisma.userRole.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
      await prisma.role.delete({ where: { id: otherRole.id } });
      await prisma.company.delete({ where: { id: otherCompany.id } });
    }

    await mutateBeforeAuthorityOperation(
      (tx) => tx.company.update({ where: { id: companyId }, data: { designatedAttendanceApproverUserId: null } }),
      () => companies.updateDesignatedAttendanceApprover({ designatedAttendanceApproverUserId: fallbackUserId }, admin),
    );
    assert.equal((await prisma.company.findUniqueOrThrow({ where: { id: companyId } })).designatedAttendanceApproverUserId, fallbackUserId);
  });

  function service() { return new AttendanceCorrectionsService(prisma as never, notifications as never); }
  async function dto(date: string) {
    const attendanceId = (await prisma.attendance.create({ data: {
      companyId, employeeId: applicantEmployeeId, attendanceDate: new Date(`${date}T00:00:00.000Z`),
      punchInAt: new Date(`${date}T09:00:00.000Z`), punchOutAt: new Date(`${date}T17:00:00.000Z`), status: AttendanceStatus.PRESENT,
      expectedMinutes: 480, shiftStartTime: '09:00', shiftEndTime: '17:00', shiftTimezone: 'UTC',
    }, select: { id: true } })).id;
    return { attendanceId, type: AttendanceCorrectionType.TIME_CORRECTION, requestedPunchOutAt: `${date}T18:00:00.000Z`, reason: 'Forgot to punch out' };
  }
  async function role(systemName: RoleName, label: string) { return (await prisma.role.create({ data: { companyId, key: `pck-${label}-${suffix}`, name: `PC-K ${label}`, systemName }, select: { id: true } })).id; }
  async function user(label: string, roleId: string) { return (await prisma.user.create({ data: { companyId, email: `pck-${label}-${suffix}@example.invalid`, passwordHash: 'integration-only-hash', firstName: 'PC-K', lastName: label, roles: { create: { roleId } } }, select: { id: true } })).id; }
  async function employee(userId: string, code: string, reportingManagerId?: string) { return (await prisma.employee.create({ data: { companyId, userId, reportingManagerId, employeeCode: `${code}-${suffix.slice(0, 8)}`, joiningDate: new Date('2026-01-01T00:00:00.000Z'), employmentType: EmploymentType.FULL_TIME, workMode: WorkMode.REMOTE, status: EmployeeStatus.ACTIVE }, select: { id: true } })).id; }

  async function mutateBeforeAuthorityOperation<T>(
    mutate: (tx: Prisma.TransactionClient) => Promise<unknown>,
    operation: () => Promise<T>,
  ): Promise<T> {
    let release!: () => void;
    let locked!: () => void;
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    const lockedPromise = new Promise<void>((resolve) => { locked = resolve; });
    const mutation = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId}::uuid FOR UPDATE`;
      await mutate(tx);
      locked();
      await releasePromise;
    });
    let pendingOperation: Promise<T> | undefined;
    try {
      await lockedPromise;
      pendingOperation = operation();
      await waitForCompanyLockWait();
      release();
      await mutation;
      return await pendingOperation;
    } finally {
      release();
      await Promise.allSettled([mutation, ...(pendingOperation ? [pendingOperation] : [])]);
    }
  }

  let barrierSequence = 0;
  async function authorityOperationBeforeMutation<T>(
    auditAction: string,
    operation: () => Promise<T>,
    mutate: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<T> {
    barrierSequence += 1;
    const identifier = `pc_k_order_${suffix.replaceAll('-', '_')}_${barrierSequence}`;
    const triggerName = `${identifier}_trigger`;
    const advisoryKey = 7_410_000 + barrierSequence;
    let releaseGate!: () => void;
    let gateLocked!: () => void;
    const releasePromise = new Promise<void>((resolve) => { releaseGate = resolve; });
    const gateLockedPromise = new Promise<void>((resolve) => { gateLocked = resolve; });
    let pendingOperation: Promise<T> | undefined;
    let pendingMutation: Promise<unknown> | undefined;
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${identifier}"() RETURNS trigger AS $$ BEGIN IF NEW."action" = '${auditAction}' THEN PERFORM pg_advisory_xact_lock(${advisoryKey}); END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION "${identifier}"()`);
    const gate = prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(${advisoryKey})::text`);
      gateLocked();
      await releasePromise;
    });
    try {
      await gateLockedPromise;
      pendingOperation = operation();
      await waitForDatabaseLockWait('Lock', 'AuditLog', 'Authority operation did not reach the audit barrier');
      pendingMutation = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId}::uuid FOR UPDATE`;
        return mutate(tx);
      });
      await waitForCompanyLockWait();
      releaseGate();
      const result = await pendingOperation;
      await pendingMutation;
      return result;
    } finally {
      releaseGate();
      await Promise.allSettled([gate, ...(pendingOperation ? [pendingOperation] : []), ...(pendingMutation ? [pendingMutation] : [])]);
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${identifier}"()`);
    }
  }

  async function waitForCompanyLockWait(): Promise<void> {
    return waitForDatabaseLockWait('Lock', 'FROM "Company"', 'Authority operation did not reach the Company lock barrier');
  }

  async function waitForDatabaseLockWait(
    waitEventType: string,
    queryFragment: string,
    failureMessage: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const waiting = await prisma.$queryRaw<Array<{ waiting: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "waiting"
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = ${waitEventType}
          AND query LIKE ${`%${queryFragment}%`}
      `);
      if (waiting[0]?.waiting > 0n) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(failureMessage);
  }
});
