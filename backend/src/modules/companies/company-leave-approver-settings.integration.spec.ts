import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import {
  EmploymentType,
  LeaveRequestStatus,
  PrismaClient,
  RoleName,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { CompaniesService } from './companies.service';

const enabled = process.env.RUN_COMPANY_LEAVE_APPROVER_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const prisma = new PrismaClient();

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

describeDb('PC-I0B PostgreSQL designated leave approver configuration', () => {
  const suffix = randomUUID();
  const companyIds: string[] = [];
  const userIds: string[] = [];
  const roleIds: string[] = [];
  const employeeIds: string[] = [];
  const leaveTypeIds: string[] = [];
  const leaveRequestIds: string[] = [];
  let companyId: string;
  let otherCompanyId: string;
  let adminUserId: string;
  let hrUserId: string;
  let secondAdminUserId: string;
  let existingLeaveRequestId: string;

  const actor = () => ({
    id: adminUserId,
    companyId,
    email: `pc-i0b-admin-${suffix}@example.invalid`,
    firstName: 'Company',
    lastName: 'Admin',
    status: UserStatus.ACTIVE,
    roles: [RoleName.COMPANY_ADMIN],
  });

  before(async () => {
    await prisma.$connect();
    const company = await prisma.company.create({
      data: { name: `PC-I0B ${suffix}`, slug: `pc-i0b-${suffix}` },
      select: { id: true },
    });
    companyId = company.id;
    companyIds.push(companyId);

    const otherCompany = await prisma.company.create({
      data: { name: `PC-I0B Other ${suffix}`, slug: `pc-i0b-other-${suffix}` },
      select: { id: true },
    });
    otherCompanyId = otherCompany.id;
    companyIds.push(otherCompanyId);

    const hrRole = await createRole(companyId, 'hr', RoleName.HR);
    const adminRole = await createRole(companyId, 'admin', RoleName.COMPANY_ADMIN);
    const employeeRole = await createRole(companyId, 'employee', RoleName.EMPLOYEE);
    const otherHrRole = await createRole(otherCompanyId, 'other-hr', RoleName.HR);

    adminUserId = await createUser(companyId, 'admin', UserStatus.ACTIVE, adminRole);
    hrUserId = await createUser(companyId, 'hr', UserStatus.ACTIVE, hrRole);
    secondAdminUserId = await createUser(companyId, 'second-admin', UserStatus.ACTIVE, adminRole);
    await createUser(companyId, 'employee', UserStatus.ACTIVE, employeeRole);
    await createUser(companyId, 'inactive', UserStatus.INACTIVE, hrRole);
    const deletedId = await createUser(companyId, 'deleted', UserStatus.ACTIVE, hrRole);
    await prisma.user.update({ where: { id: deletedId }, data: { deletedAt: new Date() } });
    await createUser(otherCompanyId, 'cross-tenant', UserStatus.ACTIVE, otherHrRole);
    await createUser(null, 'platform', UserStatus.ACTIVE, null);

    const applicantId = await createUser(companyId, 'applicant', UserStatus.ACTIVE, employeeRole);
    const applicantEmployee = await prisma.employee.create({ data: {
      companyId,
      userId: applicantId,
      employeeCode: `PCI0B-A-${suffix.slice(0, 8)}`,
      joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentType: EmploymentType.FULL_TIME,
      workMode: WorkMode.REMOTE,
    }, select: { id: true } });
    employeeIds.push(applicantEmployee.id);
    const approverEmployee = await prisma.employee.create({ data: {
      companyId,
      userId: hrUserId,
      employeeCode: `PCI0B-R-${suffix.slice(0, 8)}`,
      joiningDate: new Date('2026-01-01T00:00:00.000Z'),
      employmentType: EmploymentType.FULL_TIME,
      workMode: WorkMode.REMOTE,
    }, select: { id: true } });
    employeeIds.push(approverEmployee.id);
    const leaveType = await prisma.leaveType.create({ data: {
      companyId,
      name: `PC-I0B Leave ${suffix}`,
      code: `PCI0B-${suffix}`,
      requiresApproval: true,
    }, select: { id: true } });
    leaveTypeIds.push(leaveType.id);
    const request = await prisma.leaveRequest.create({ data: {
      companyId,
      employeeId: applicantEmployee.id,
      leaveTypeId: leaveType.id,
      startDate: new Date('2028-01-01T00:00:00.000Z'),
      endDate: new Date('2028-01-01T00:00:00.000Z'),
      totalDays: 1,
      status: LeaveRequestStatus.PENDING,
      approverId: approverEmployee.id,
      assignedApproverUserId: hrUserId,
      approvalAuthorityVersion: 1,
    }, select: { id: true } });
    existingLeaveRequestId = request.id;
    leaveRequestIds.push(request.id);
  });

  after(async () => {
    try {
      if (companyId) {
        await prisma.company.updateMany({ where: { id: companyId }, data: { designatedLeaveApproverUserId: null } });
      }
      if (companyIds.length) await prisma.auditLog.deleteMany({ where: { companyId: { in: companyIds } } });
      if (leaveRequestIds.length) await prisma.leaveRequest.deleteMany({ where: { id: { in: leaveRequestIds } } });
      if (employeeIds.length) await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
      if (leaveTypeIds.length) await prisma.leaveType.deleteMany({ where: { id: { in: leaveTypeIds } } });
      if (userIds.length) await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
      if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      if (roleIds.length) await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      if (companyIds.length) await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('enforces eligibility, atomic audited changes, concurrency, and immutable request assignment', async () => {
    const service = new CompaniesService(prisma as never);
    const beforeRequest = await requestAuthority();

    assert.equal((await service.getDesignatedLeaveApprover(actor())).designatedLeaveApproverUserId, null);
    assert.equal((await service.updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: hrUserId }, actor())).designatedLeaveApprover?.id, hrUserId);
    assert.equal((await service.updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: secondAdminUserId }, actor())).designatedLeaveApprover?.id, secondAdminUserId);

    const beforeNoOp = await auditCount();
    await service.updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: secondAdminUserId }, actor());
    assert.equal(await auditCount(), beforeNoOp);
    await service.updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: null }, actor());
    assert.equal((await service.getDesignatedLeaveApprover(actor())).designatedLeaveApproverUserId, null);

    const invalidUsers = await prisma.user.findMany({
      where: { email: { in: [
        `pc-i0b-cross-tenant-${suffix}@example.invalid`,
        `pc-i0b-platform-${suffix}@example.invalid`,
        `pc-i0b-inactive-${suffix}@example.invalid`,
        `pc-i0b-deleted-${suffix}@example.invalid`,
        `pc-i0b-employee-${suffix}@example.invalid`,
      ] } },
      select: { id: true },
    });
    assert.equal(invalidUsers.length, 5);
    for (const invalid of invalidUsers) {
      await assert.rejects(
        () => service.updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: invalid.id }, actor()),
        (error: unknown) => error instanceof NotFoundException && error.message === 'Eligible designated leave approver not found',
      );
      assert.equal((await currentSetting()), null);
    }

    await service.updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: hrUserId }, actor());
    const auditBeforeFailure = await auditCount();
    const functionName = `pc_i0b_audit_failure_${suffix.replaceAll('-', '_')}`;
    const triggerName = `${functionName}_trigger`;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION "${functionName}"() RETURNS trigger AS $$
        BEGIN
          IF NEW."companyId" = '${companyId}'::uuid
             AND NEW."action" = 'COMPANY_DESIGNATED_LEAVE_APPROVER_CHANGED' THEN
            RAISE EXCEPTION 'PC-I0B audit rollback probe';
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
      await assert.rejects(() => service.updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: secondAdminUserId }, actor()));
      assert.equal(await currentSetting(), hrUserId);
      assert.equal(await auditCount(), auditBeforeFailure);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditLog"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    await service.updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: null }, actor());
    await prisma.auditLog.deleteMany({ where: { companyId, action: 'COMPANY_DESIGNATED_LEAVE_APPROVER_CHANGED' } });
    const barrier = new Barrier();
    const clients = [new PrismaClient(), new PrismaClient()];
    await Promise.all(clients.map((client) => client.$connect()));
    try {
      const services = clients.map((client) => new CompaniesService(coordinatedPrisma(client, barrier) as never));
      await Promise.all([
        services[0].updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: hrUserId }, actor()),
        services[1].updateDesignatedLeaveApprover({ designatedLeaveApproverUserId: secondAdminUserId }, actor()),
      ]);
    } finally {
      await Promise.all(clients.map((client) => client.$disconnect()));
    }
    const audits = await prisma.auditLog.findMany({
      where: { companyId, action: 'COMPANY_DESIGNATED_LEAVE_APPROVER_CHANGED' },
      select: { metadata: true },
    });
    assert.equal(audits.length, 2);
    const transitions = audits.map(({ metadata }) => metadata as {
      previousDesignatedLeaveApproverUserId: string | null;
      designatedLeaveApproverUserId: string;
    });
    const first = transitions.find((entry) => entry.previousDesignatedLeaveApproverUserId === null);
    assert.ok(first);
    const second = transitions.find(
      (entry) => entry.previousDesignatedLeaveApproverUserId === first.designatedLeaveApproverUserId,
    );
    assert.ok(second);
    assert.equal(await currentSetting(), second.designatedLeaveApproverUserId);
    assert.deepEqual(new Set(transitions.map((entry) => entry.designatedLeaveApproverUserId)), new Set([hrUserId, secondAdminUserId]));
    assert.ok(audits.every(({ metadata }) => {
      assert.deepEqual(Object.keys(metadata as object).sort(), [
        'designatedLeaveApproverUserId',
        'previousDesignatedLeaveApproverUserId',
      ]);
      return true;
    }));
    assert.deepEqual(await requestAuthority(), beforeRequest);
  });

  async function createRole(company: string, label: string, systemName: RoleName) {
    const role = await prisma.role.create({ data: {
      companyId: company,
      key: `pc-i0b-${label}-${suffix}`,
      name: `PC-I0B ${label} ${suffix}`,
      systemName,
    }, select: { id: true } });
    roleIds.push(role.id);
    return role.id;
  }

  async function createUser(company: string | null, label: string, status: UserStatus, roleId: string | null) {
    const user = await prisma.user.create({ data: {
      companyId: company,
      email: `pc-i0b-${label}-${suffix}@example.invalid`,
      passwordHash: 'integration-only-hash',
      firstName: 'PC-I0B',
      lastName: label,
      status,
      ...(roleId ? { roles: { create: { roleId } } } : {}),
    }, select: { id: true } });
    userIds.push(user.id);
    return user.id;
  }

  function currentSetting() {
    return prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { designatedLeaveApproverUserId: true } })
      .then((company) => company.designatedLeaveApproverUserId);
  }

  function auditCount() {
    return prisma.auditLog.count({ where: { companyId, action: 'COMPANY_DESIGNATED_LEAVE_APPROVER_CHANGED' } });
  }

  function requestAuthority() {
    return prisma.leaveRequest.findUniqueOrThrow({
      where: { id: existingLeaveRequestId },
      select: { assignedApproverUserId: true, approvalAuthorityVersion: true, approverId: true },
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
