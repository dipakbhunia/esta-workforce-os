import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import {
  AccountActionTokenPurpose,
  CompanyStatus,
  EmployeeStatus,
  EmploymentType,
  PrismaClient,
  RoleName,
  TrialStatus,
  UserStatus,
  WorkMode,
} from '@prisma/client';
import { buildAccountActionToken } from '../../common/utils/account-action-token.util';
import { EmployeesService } from '../employees/employees.service';
import { IdentityActionsService } from '../identity-actions/identity-actions.service';
import { UsersService } from '../users/users.service';
import { CommercialAccessService } from './commercial-access.service';
import { SeatUsageService } from './seat-usage.service';
import { UsageSeatsQueryService } from './usage-seats-query.service';

const DATABASE_NAME = 'esta_sa_c13_seats_disposable_20261027';
const enabled = process.env.RUN_SA_C13_SEAT_DB_INTEGRATION === '1';
const describeDb = enabled ? describe : describe.skip;
const tokenSecret = 'sa-c13-disposable-token-secret-at-least-32-characters';

function requireDisposableDatabase(): void {
  if (process.env.SA_C13_DISPOSABLE_DATABASE_OWNERSHIP_VERIFIED !== '1') {
    throw new Error('SA-C1.3 requires explicit disposable ownership verification');
  }
  const configured = process.env.DATABASE_URL;
  if (!configured) throw new Error('DATABASE_URL is required');
  const url = new URL(configured);
  assert.equal(decodeURIComponent(url.pathname.slice(1)), DATABASE_NAME);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.port, '55434');
}

describeDb('SA-C1.3 authoritative User billable-seat PostgreSQL integration', () => {
  const prisma = new PrismaClient();
  const seats = new SeatUsageService(prisma as never);
  const commercial = new CommercialAccessService(prisma as never);
  const queries = new UsageSeatsQueryService(prisma as never, commercial, seats);

  before(async () => {
    requireDisposableDatabase();
    await prisma.$connect();
    const [identity] = await prisma.$queryRaw<Array<{ database: string; user: string }>>`
      SELECT current_database() AS database, current_user AS user
    `;
    assert.equal(identity.database, DATABASE_NAME);
    assert.equal(identity.user, 'sa_c13_runner');
    const [migrationCount] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
    `;
    assert.equal(Number(migrationCount.count), 60);
  });

  after(async () => prisma.$disconnect());

  it('keeps Prisma, aggregate SQL, and detail consumers aligned to active non-deleted tenant Users', async () => {
    const fixture = await createCompanyFixture(prisma, 20);
    const other = await createCompanyFixture(prisma, 20);
    try {
      const activeNoEmployee = await createUser(prisma, fixture.companyId, UserStatus.ACTIVE, 'active-no-employee');
      const activeMultiRole = await createUser(prisma, fixture.companyId, UserStatus.ACTIVE, 'active-multi-role');
      const inactiveWithEmployee = await createUser(prisma, fixture.companyId, UserStatus.INACTIVE, 'inactive-employee');
      await createUser(prisma, fixture.companyId, UserStatus.SUSPENDED, 'suspended');
      const deleted = await createUser(prisma, fixture.companyId, UserStatus.ACTIVE, 'deleted');
      await prisma.user.update({ where: { id: deleted }, data: { deletedAt: new Date() } });
      const platformId = await createUser(prisma, null, UserStatus.ACTIVE, 'platform');
      const otherTenantUser = await createUser(prisma, other.companyId, UserStatus.ACTIVE, 'other-tenant');
      const roleA = await prisma.role.create({ data: { key: `SA_C13_HR_${fixture.suffix}`, name: 'HR', systemName: RoleName.HR, companyId: fixture.companyId } });
      const roleB = await prisma.role.create({ data: { key: `SA_C13_MANAGER_${fixture.suffix}`, name: 'Manager', systemName: RoleName.MANAGER, companyId: fixture.companyId } });
      await prisma.userRole.createMany({ data: [{ userId: activeMultiRole, roleId: roleA.id }, { userId: activeMultiRole, roleId: roleB.id }] });
      await prisma.employee.create({ data: employeeData(inactiveWithEmployee, fixture.companyId, `EMP-${fixture.suffix.slice(0, 6)}`) });

      assert.equal(await seats.countUsedSeats(fixture.companyId), 2);
      const detail = await queries.findCompany(fixture.companyId, { page: 1, limit: 20 });
      assert.equal(detail.seats.used, 2);
      assert.deepEqual(new Set(detail.consumers.data.map(({ id }) => id)), new Set([activeNoEmployee, activeMultiRole]));
      assert.equal(detail.consumers.data.some(({ id }) => id === otherTenantUser), false);
      assert.equal(detail.consumers.data.find(({ id }) => id === activeMultiRole)?.roles.length, 2);
      const aggregate = await queries.findAll({ page: 1, limit: 100 });
      assert.equal(aggregate.data.find(({ company }) => company.id === fixture.companyId)?.seats.used, 2);
      assert.equal(aggregate.data.find(({ company }) => company.id === other.companyId)?.seats.used, 1);
      await prisma.user.delete({ where: { id: platformId } });
    } finally {
      await cleanupCompanyFixture(prisma, fixture.companyId, fixture.planId);
      await cleanupCompanyFixture(prisma, other.companyId, other.planId);
    }
  });

  it('serializes two invitation activations competing for the final seat', async () => {
    const fixture = await createCompanyFixture(prisma, 1);
    try {
      const first = await createUser(prisma, fixture.companyId, UserStatus.INACTIVE, 'invite-a');
      const second = await createUser(prisma, fixture.companyId, UserStatus.INACTIVE, 'invite-b');
      const identity = new IdentityActionsService(
        prisma as never,
        { get: (_key: string, fallback?: unknown) => fallback, getOrThrow: () => tokenSecret } as never,
        {} as never,
        commercial,
        seats,
      );
      const inputs = await Promise.all([first, second].map(async (userId) => {
        const token = await prisma.$transaction((tx) => identity.issueTokenInTransaction(tx, {
          purpose: AccountActionTokenPurpose.INVITATION, userId, companyId: fixture.companyId,
        }));
        return { token: buildAccountActionToken(token, tokenSecret), password: 'SA-C13-test-password', passwordConfirmation: 'SA-C13-test-password' };
      }));
      const outcomes = await Promise.allSettled(inputs.map((input) => identity.activate(input, {})));
      assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
      assert.equal(await seats.countUsedSeats(fixture.companyId), 1);
      assert.equal(await prisma.user.count({ where: { id: { in: [first, second] }, status: UserStatus.INACTIVE } }), 1);
    } finally {
      await cleanupCompanyFixture(prisma, fixture.companyId, fixture.planId);
    }
  });

  it('serializes two administrative reactivations competing for the final seat', async () => {
    const fixture = await createCompanyFixture(prisma, 2);
    try {
      const actorId = await createUser(prisma, fixture.companyId, UserStatus.ACTIVE, 'actor');
      const first = await createUser(prisma, fixture.companyId, UserStatus.INACTIVE, 'admin-a');
      const second = await createUser(prisma, fixture.companyId, UserStatus.INACTIVE, 'admin-b');
      const service = new UsersService(prisma as never, { createAccountStatusChangedEmail: async () => ({ created: true }) } as never, undefined as never, commercial, seats);
      const actor = { id: actorId, companyId: fixture.companyId, email: 'actor@example.invalid', firstName: 'Actor', lastName: 'Admin', status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN] };
      const outcomes = await Promise.allSettled([first, second].map((id) => service.setStatus(id, { status: UserStatus.ACTIVE }, actor)));
      assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
      assert.equal(await seats.countUsedSeats(fixture.companyId), 2);
      assert.equal(await prisma.user.count({ where: { id: { in: [first, second] }, status: UserStatus.INACTIVE } }), 1);
    } finally {
      await cleanupCompanyFixture(prisma, fixture.companyId, fixture.planId);
    }
  });

  it('keeps Employee lifecycle independent and preserves commercial snapshots', async () => {
    const fixture = await createCompanyFixture(prisma, 2);
    try {
      const userId = await createUser(prisma, fixture.companyId, UserStatus.ACTIVE, 'employee-user');
      const service = new EmployeesService(prisma as never);
      const actor = { id: randomUUID(), companyId: fixture.companyId, email: 'admin@example.invalid', firstName: 'Admin', lastName: 'User', status: UserStatus.ACTIVE, roles: [RoleName.COMPANY_ADMIN] };
      const trialBefore = await prisma.companyTrial.findFirstOrThrow({ where: { companyId: fixture.companyId } });
      const created = await service.create({ userId, employeeCode: `E-${fixture.suffix.slice(0, 6)}`, joiningDate: '2026-10-27', employmentType: EmploymentType.FULL_TIME, workMode: WorkMode.REMOTE, status: EmployeeStatus.ACTIVE }, actor);
      assert.equal(await seats.countUsedSeats(fixture.companyId), 1);
      await service.update(created.id, { status: EmployeeStatus.INACTIVE }, actor);
      await service.update(created.id, { status: EmployeeStatus.ACTIVE }, actor);
      await service.remove(created.id, actor);
      assert.equal(await seats.countUsedSeats(fixture.companyId), 1);
      assert.deepEqual(await prisma.companyTrial.findFirstOrThrow({ where: { companyId: fixture.companyId } }), trialBefore);
      assert.equal(await prisma.subscriptionRenewal.count({ where: { companyId: fixture.companyId } }), 0);
      assert.equal(await prisma.invoice.count({ where: { companyId: fixture.companyId } }), 0);
      assert.equal(await prisma.payment.count({ where: { companyId: fixture.companyId } }), 0);
      assert.equal(await prisma.paymentTaxSnapshot.count({ where: { companyId: fixture.companyId } }), 0);
    } finally {
      await cleanupCompanyFixture(prisma, fixture.companyId, fixture.planId);
    }
  });
});

async function createCompanyFixture(prisma: PrismaClient, capacity: number) {
  const suffix = randomUUID();
  const company = await prisma.company.create({ data: { name: `SA-C1.3 ${suffix}`, slug: `sa-c13-${suffix}`, status: CompanyStatus.ACTIVE } });
  const plan = await prisma.plan.create({ data: { code: `SA_C13_${suffix}`, name: 'SA-C1.3 Plan', billingModel: 'PER_USER', monthlyPricePerSeatMinor: 100 } });
  await prisma.companyTrial.create({ data: { companyId: company.id, status: TrialStatus.ACTIVE, startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000), seatLimit: capacity } });
  return { suffix, companyId: company.id, planId: plan.id };
}

async function createUser(prisma: PrismaClient, companyId: string | null, status: UserStatus, label: string) {
  const id = randomUUID();
  await prisma.user.create({ data: { id, companyId, email: `${label}-${id}@example.invalid`, passwordHash: 'not-a-real-credential', firstName: label, lastName: 'SA-C1.3', status } });
  return id;
}

function employeeData(userId: string, companyId: string, employeeCode: string) {
  return { userId, companyId, employeeCode, joiningDate: new Date('2026-10-27'), employmentType: EmploymentType.FULL_TIME, workMode: WorkMode.REMOTE };
}

async function cleanupCompanyFixture(prisma: PrismaClient, companyId: string, planId: string) {
  await prisma.auditLog.deleteMany({ where: { companyId } });
  await prisma.accountActionToken.deleteMany({ where: { companyId } });
  await prisma.employee.deleteMany({ where: { companyId } });
  await prisma.userRole.deleteMany({ where: { user: { companyId } } });
  await prisma.role.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.companyTrial.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.plan.delete({ where: { id: planId } });
}
