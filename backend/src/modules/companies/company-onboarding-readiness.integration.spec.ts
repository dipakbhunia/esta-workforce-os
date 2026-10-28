import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { INestApplication, Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { NestFactory, Reflector } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { PassportStrategy } from '@nestjs/passport';
import {
  AccountActionTokenPurpose,
  BillingInterval,
  CompanyStatus,
  PlanBillingModel,
  PrismaClient,
  RoleName,
  SubscriptionActivationSource,
  SubscriptionStatus,
  TrialStatus,
  UserStatus,
} from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../database/prisma.service';
import { CommercialAccessService } from '../usage-seats/commercial-access.service';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { CompanyOnboardingReadinessService } from './company-onboarding-readiness.service';
import {
  CompanyOnboardingReadinessItemId as ItemId,
  CompanyOnboardingReadinessStatus as Status,
} from './dto/company-onboarding-readiness.dto';

const enabled = process.env.RUN_SA_C23C_INTEGRATION === 'true';
const describeIntegration = enabled ? describe : describe.skip;
const expectedDatabase = 'esta_sac23c_onboarding_20261028';
const expectedOwner = 'esta_sac23c_owner';
const expectedReader = 'esta_sac23c_reader';
const expectedHost = '127.0.0.1';
const expectedPort = '55443';
const expectedServerIp = process.env.SA_C23C_EXPECTED_PG_SERVER_IP ?? '';
const ownerUrl = process.env.SA_C23C_OWNER_DATABASE_URL ?? '';
const readerUrl = process.env.SA_C23C_READER_DATABASE_URL ?? '';
const jwtSecret = process.env.SA_C23C_JWT_SECRET ?? '';
const protectedDatabases = new Set([
  'esta_workforce',
  'esta_qa_p13b2a_20261023_131805',
  'esta_pc_l_20261008_a',
  'esta_low_d_integration_20261026',
]);

type Identity = {
  databaseName: string;
  userName: string;
  serverAddress: string;
  serverPort: number;
  readOnly: string;
};

type TokenActor = {
  sub: string;
  companyId: string | null;
  roles: RoleName[];
  type: 'access';
};

class IntegrationJwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  validate(payload: TokenActor) {
    if (payload.type !== 'access') return null;
    return {
      id: payload.sub,
      companyId: payload.companyId,
      email: `${payload.sub}@example.invalid`,
      firstName: 'SA-C2.3C',
      lastName: 'Actor',
      status: UserStatus.ACTIVE,
      roles: payload.roles,
    };
  }
}

function validateUrl(value: string, expectedUser: string): void {
  const parsed = new URL(value);
  const database = decodeURIComponent(parsed.pathname.slice(1));
  assert.equal(parsed.protocol, 'postgresql:');
  assert.equal(parsed.hostname, expectedHost);
  assert.equal(parsed.port, expectedPort);
  assert.equal(database, expectedDatabase);
  assert.equal(decodeURIComponent(parsed.username), expectedUser);
  assert.equal(parsed.searchParams.get('schema'), 'public');
  assert.equal(parsed.searchParams.size, 1);
  assert.equal(parsed.hash, '');
  assert.equal(protectedDatabases.has(database), false);
}

function assertIdentity(identity: Identity | undefined, user: string, readOnly: boolean): void {
  assert.ok(identity);
  assert.equal(identity.databaseName, expectedDatabase);
  assert.equal(identity.userName, user);
  assert.equal(identity.serverAddress.replace('/32', ''), expectedServerIp);
  assert.equal(identity.serverPort, 5432);
  assert.equal(identity.readOnly, readOnly ? 'on' : 'off');
}

async function identity(client: PrismaClient): Promise<Identity> {
  const rows = await client.$queryRaw<Identity[]>`
    SELECT current_database() AS "databaseName",
           current_user AS "userName",
           inet_server_addr()::text AS "serverAddress",
           inet_server_port() AS "serverPort",
           current_setting('transaction_read_only') AS "readOnly"
  `;
  return rows[0];
}

function readinessItem(result: Awaited<ReturnType<CompanyOnboardingReadinessService['evaluate']>>, id: ItemId) {
  return result.items.find((candidate) => candidate.id === id)!;
}

describeIntegration('SA-C2.3C disposable PostgreSQL and HTTP integration', () => {
  let owner: PrismaClient;
  let reader: PrismaClient;
  let service: CompanyOnboardingReadinessService;
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let planId: string;
  const suffix = randomUUID();

  before(async () => {
    Reflect.defineMetadata('design:paramtypes', [Reflector], RolesGuard);
    Reflect.defineMetadata(
      'design:paramtypes',
      [CompaniesService, CompanyOnboardingReadinessService],
      CompaniesController,
    );
    validateUrl(ownerUrl, expectedOwner);
    validateUrl(readerUrl, expectedReader);
    assert.match(expectedServerIp, /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/);
    assert.ok(jwtSecret.length >= 32);
    owner = new PrismaClient({ datasourceUrl: ownerUrl });
    reader = new PrismaClient({ datasourceUrl: readerUrl });
    await Promise.all([owner.$connect(), reader.$connect()]);
    assertIdentity(await identity(owner), expectedOwner, false);
    assertIdentity(await identity(reader), expectedReader, true);
    const migrations = await owner.$queryRaw<Array<{ successful: bigint; failed: bigint }>>`
      SELECT COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS successful,
             COUNT(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) AS failed
      FROM "_prisma_migrations"
    `;
    assert.deepEqual(migrations, [{ successful: 60n, failed: 0n }]);
    await assert.rejects(
      () => reader.company.create({ data: { name: 'forbidden', slug: `forbidden-${suffix}` } }),
      /read-only|permission denied/i,
    );

    const plan = await owner.plan.create({
      data: {
        code: `SAC23C-${suffix}`,
        name: 'SA-C2.3C Plan',
        billingModel: PlanBillingModel.PER_USER,
        monthlyPricePerSeatMinor: 100,
      },
    });
    planId = plan.id;
    service = new CompanyOnboardingReadinessService(
      reader as unknown as PrismaService,
      new CommercialAccessService(reader as unknown as PrismaService),
    );

    @Module({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({ secret: jwtSecret })],
      controllers: [CompaniesController],
      providers: [
        IntegrationJwtStrategy,
        { provide: RolesGuard, useFactory: (reflector: Reflector) => new RolesGuard(reflector), inject: [Reflector] },
        {
          provide: CommercialAccessService,
          useFactory: (prisma: PrismaService) => new CommercialAccessService(prisma),
          inject: [PrismaService],
        },
        {
          provide: CompanyOnboardingReadinessService,
          useFactory: (prisma: PrismaService, commercial: CommercialAccessService) =>
            new CompanyOnboardingReadinessService(prisma, commercial),
          inject: [PrismaService, CommercialAccessService],
        },
        { provide: PrismaService, useValue: reader },
        { provide: CompaniesService, useValue: {} },
      ],
    })
    class IntegrationModule {}

    app = await NestFactory.create(IntegrationModule, { logger: ['error'] });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    baseUrl = `http://127.0.0.1:${address.port}`;
    jwt = app.get(JwtService);
  });

  after(async () => {
    await app?.close();
    await Promise.allSettled([reader?.$disconnect(), owner?.$disconnect()]);
  });

  async function createCompany(status: CompanyStatus = CompanyStatus.ACTIVE, deletedAt: Date | null = null) {
    return owner.company.create({
      data: {
        name: `SA-C2.3C ${randomUUID()}`,
        slug: `sac23c-${randomUUID()}`,
        timezone: 'Asia/Kolkata',
        status,
        primaryEmail: 'company@example.invalid',
        phone: '+910000000000',
        country: 'IN',
        address: 'Pune',
        deletedAt,
      },
    });
  }

  async function createRole(companyId: string | null, systemName: RoleName, deletedAt: Date | null = null) {
    if (deletedAt === null) {
      const existing = await owner.role.findFirst({ where: { companyId, systemName, deletedAt: null } });
      if (existing) return existing;
    }
    return owner.role.create({
      data: {
        companyId,
        key: `${systemName.toLowerCase()}-${randomUUID()}`,
        name: `${systemName} integration`,
        systemName,
        deletedAt,
      },
    });
  }

  async function createUser(companyId: string | null, status: UserStatus, deletedAt: Date | null = null) {
    return owner.user.create({
      data: {
        companyId,
        email: `sac23c-${randomUUID()}@example.invalid`,
        passwordHash: 'integration-only-not-a-login-secret',
        firstName: 'SA-C2.3C',
        lastName: 'Fixture',
        status,
        deletedAt,
      },
    });
  }

  async function assign(userId: string, roleId: string) {
    await owner.userRole.create({ data: { userId, roleId } });
  }

  async function createAdmin(companyId: string, options: {
    userCompanyId?: string | null;
    roleCompanyId?: string | null;
    userStatus?: UserStatus;
    userDeletedAt?: Date | null;
    roleDeletedAt?: Date | null;
  } = {}) {
    const user = await createUser(
      options.userCompanyId === undefined ? companyId : options.userCompanyId,
      options.userStatus ?? UserStatus.ACTIVE,
      options.userDeletedAt ?? null,
    );
    const role = await createRole(
      options.roleCompanyId === undefined ? companyId : options.roleCompanyId,
      RoleName.COMPANY_ADMIN,
      options.roleDeletedAt ?? null,
    );
    await assign(user.id, role.id);
    return user;
  }

  async function invite(companyId: string, userId: string, options: {
    expiresAt?: Date;
    createdAt?: Date;
    consumedAt?: Date | null;
    invalidatedAt?: Date | null;
  } = {}) {
    return owner.accountActionToken.create({
      data: {
        companyId,
        userId,
        purpose: AccountActionTokenPurpose.INVITATION,
        tokenHash: randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
        expiresAt: options.expiresAt ?? new Date(Date.now() + 86_400_000),
        createdAt: options.createdAt,
        consumedAt: options.consumedAt ?? null,
        invalidatedAt: options.invalidatedAt ?? null,
      },
    });
  }

  function token(role: RoleName) {
    return jwt.sign({ sub: randomUUID(), companyId: role === RoleName.SUPER_ADMIN ? null : randomUUID(), roles: [role], type: 'access' });
  }

  async function get(companyId: string, role?: RoleName) {
    return fetch(`${baseUrl}/companies/${companyId}/onboarding-readiness`, {
      headers: role ? { authorization: `Bearer ${token(role)}` } : undefined,
    });
  }

  it('enforces the real HTTP guard chain for every required role', async () => {
    const company = await createCompany();
    await createAdmin(company.id);
    const cases: Array<[RoleName | undefined, number]> = [
      [undefined, 401],
      [RoleName.COMPANY_ADMIN, 403],
      [RoleName.HR, 403],
      [RoleName.MANAGER, 403],
      [RoleName.EMPLOYEE, 403],
      [RoleName.SUPER_ADMIN, 200],
    ];
    for (const [role, expected] of cases) {
      const response = await get(company.id, role);
      const body = response.status === expected ? '' : await response.text();
      assert.equal(response.status, expected, `${role ?? 'missing JWT'} ${body}`);
      if (expected === 200) assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });

  it('uses real tenant, user, and role predicates', async () => {
    const eligible = await createCompany();
    await createAdmin(eligible.id);
    assert.equal(readinessItem(await service.evaluate(eligible.id), ItemId.TENANT_ADMIN_ACCESS).status, Status.READY);

    const cases: Array<[string, Parameters<typeof createAdmin>[1]]> = [
      ['cross-company user', { userCompanyId: (await createCompany()).id }],
      ['cross-company role', { roleCompanyId: (await createCompany()).id }],
      ['platform role', { roleCompanyId: null }],
      ['deleted user', { userDeletedAt: new Date() }],
      ['deleted role', { roleDeletedAt: new Date() }],
    ];
    for (const [label, options] of cases) {
      const company = await createCompany();
      await createAdmin(company.id, options);
      const result = await service.evaluate(company.id);
      assert.equal(readinessItem(result, ItemId.TENANT_ADMIN_ACCESS).status, Status.BLOCKED, label);
    }
  });

  it('enforces invitation lifecycle and invitation-owner authority', async () => {
    const validCompany = await createCompany();
    const validOwner = await createAdmin(validCompany.id, { userStatus: UserStatus.INACTIVE });
    await invite(validCompany.id, validOwner.id);
    assert.equal(readinessItem(await service.evaluate(validCompany.id), ItemId.ADMIN_INVITATION).reasonCode, 'VALID_INVITATION_PENDING');

    const tokenCases: Array<[string, Parameters<typeof invite>[2]]> = [
      ['expired', { expiresAt: new Date(Date.now() - 1000) }],
      ['consumed', { consumedAt: new Date(Date.now() + 60_000) }],
      ['invalidated', { invalidatedAt: new Date(Date.now() + 60_000) }],
    ];
    for (const [label, options] of tokenCases) {
      const company = await createCompany();
      const user = await createAdmin(company.id, { userStatus: UserStatus.INACTIVE });
      await invite(company.id, user.id, label === 'expired'
        ? { createdAt: new Date(Date.now() - 2_000), expiresAt: new Date(Date.now() - 1_000) }
        : options);
      assert.equal(readinessItem(await service.evaluate(company.id), ItemId.ADMIN_INVITATION).status, Status.BLOCKED, label);
    }

    const ownerCases: Array<[string, Parameters<typeof createAdmin>[1]]> = [
      ['deleted owner', { userStatus: UserStatus.INACTIVE, userDeletedAt: new Date() }],
      ['cross-company owner', { userStatus: UserStatus.INACTIVE, userCompanyId: (await createCompany()).id }],
      ['cross-company owner role', { userStatus: UserStatus.INACTIVE, roleCompanyId: (await createCompany()).id }],
      ['platform owner role', { userStatus: UserStatus.INACTIVE, roleCompanyId: null }],
    ];
    for (const [label, options] of ownerCases) {
      const company = await createCompany();
      const user = await createAdmin(company.id, options);
      if (label === 'cross-company owner') {
        await assert.rejects(() => invite(company.id, user.id), /owner scope mismatch/i);
      } else {
        await invite(company.id, user.id);
      }
      assert.equal(readinessItem(await service.evaluate(company.id), ItemId.ADMIN_INVITATION).status, Status.BLOCKED, label);
    }

    const superseded = await createCompany();
    await createAdmin(superseded.id);
    const historical = await createAdmin(superseded.id, { userStatus: UserStatus.INACTIVE });
    await invite(superseded.id, historical.id, { invalidatedAt: new Date(Date.now() + 60_000) });
    assert.equal(readinessItem(await service.evaluate(superseded.id), ItemId.ADMIN_INVITATION).reasonCode, 'ACTIVE_ADMIN_SUPERSEDES_INVITATION');
  });

  it('returns 404 for missing and archived companies and keeps lifecycle warnings non-blocking', async () => {
    assert.equal((await get(randomUUID(), RoleName.SUPER_ADMIN)).status, 404);
    const archived = await createCompany(CompanyStatus.ACTIVE, new Date());
    assert.equal((await get(archived.id, RoleName.SUPER_ADMIN)).status, 404);
    for (const status of [CompanyStatus.INACTIVE, CompanyStatus.SUSPENDED]) {
      const company = await createCompany(status);
      await createAdmin(company.id);
      const result = await service.evaluate(company.id);
      assert.equal(readinessItem(result, ItemId.OPERATIONAL_LIFECYCLE).status, Status.INCOMPLETE);
      assert.equal(readinessItem(result, ItemId.OPERATIONAL_LIFECYCLE).blocking, false);
      assert.equal(result.overallStatus, Status.READY);
    }
  });

  it('proves trial precedence and active, suspended, and missing commercial outcomes', async () => {
    const subscription = async (companyId: string, status: SubscriptionStatus) => owner.companySubscription.create({
      data: {
        companyId,
        planId,
        status,
        activationSource: SubscriptionActivationSource.MANUAL,
        billingInterval: BillingInterval.MONTHLY,
        planCodeSnapshot: 'SAC23C',
        planNameSnapshot: 'SA-C2.3C',
        billingModelSnapshot: PlanBillingModel.PER_USER,
        currency: 'INR',
        pricePerSeatMinor: 100,
        seatQuantity: 10,
        currentPeriodStart: new Date(Date.now() - 1_000),
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    });
    const trialCompany = await createCompany();
    await createAdmin(trialCompany.id);
    await subscription(trialCompany.id, SubscriptionStatus.SUSPENDED);
    await owner.companyTrial.create({ data: { companyId: trialCompany.id, status: TrialStatus.ACTIVE, startsAt: new Date(Date.now() - 1000), endsAt: new Date(Date.now() + 86_400_000), seatLimit: 5 } });
    assert.equal(readinessItem(await service.evaluate(trialCompany.id), ItemId.COMMERCIAL_ACCESS).reasonCode, 'TRIAL_ACTIVE');

    for (const status of [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED]) {
      const company = await createCompany();
      await createAdmin(company.id);
      await subscription(company.id, status);
      const result = await service.evaluate(company.id);
      assert.equal(readinessItem(result, ItemId.COMMERCIAL_ACCESS).reasonCode, `SUBSCRIPTION_${status}`);
      assert.equal(readinessItem(result, ItemId.COMMERCIAL_ACCESS).blocking, false);
    }
    const missing = await createCompany();
    await createAdmin(missing.id);
    const result = await service.evaluate(missing.id);
    assert.equal(readinessItem(result, ItemId.COMMERCIAL_ACCESS).reasonCode, 'COMMERCIAL_AUTHORITY_MISSING');
    assert.equal(result.overallStatus, Status.READY);
  });

  it('keeps every billing gap outside administrative blocking', async () => {
    const missing = await createCompany();
    await createAdmin(missing.id);
    let result = await service.evaluate(missing.id);
    assert.equal(readinessItem(result, ItemId.BILLING_PROFILE).reasonCode, 'BILLING_PROFILE_MISSING');
    assert.equal(result.overallStatus, Status.READY);

    const incomplete = await createCompany();
    await createAdmin(incomplete.id);
    await assert.rejects(
      () => owner.companyBillingProfile.create({ data: { companyId: incomplete.id, billingName: ' ', addressLine1: 'Road', city: 'Pune', postalCode: '411001', country: 'IN' } }),
      /check constraint/i,
    );
    result = await service.evaluate(incomplete.id);
    assert.equal(readinessItem(result, ItemId.BILLING_PROFILE).reasonCode, 'BILLING_PROFILE_MISSING');

    const complete = await createCompany();
    await createAdmin(complete.id);
    const contact = await createUser(complete.id, UserStatus.ACTIVE);
    await owner.companyBillingProfile.create({ data: { companyId: complete.id, billingName: 'Complete', addressLine1: 'Road', city: 'Pune', postalCode: '411001', country: 'IN', billingContactUserId: contact.id } });
    result = await service.evaluate(complete.id);
    assert.equal(readinessItem(result, ItemId.BILLING_PROFILE).status, Status.READY);
    assert.equal(readinessItem(result, ItemId.BILLING_CONTACT).status, Status.READY);

    for (const [label, status, deletedAt] of [
      ['inactive', UserStatus.INACTIVE, null],
      ['deleted', UserStatus.ACTIVE, new Date()],
    ] as const) {
      const company = await createCompany();
      await createAdmin(company.id);
      const candidate = await createUser(company.id, status, deletedAt);
      await owner.companyBillingProfile.create({ data: { companyId: company.id, billingName: 'Profile', addressLine1: 'Road', city: 'Pune', postalCode: '411001', country: 'IN', billingContactUserId: candidate.id } });
      result = await service.evaluate(company.id);
      assert.equal(readinessItem(result, ItemId.BILLING_CONTACT).status, Status.INCOMPLETE, label);
      assert.equal(result.overallStatus, Status.READY, label);
    }

    const company = await createCompany();
    const other = await createCompany();
    const otherContact = await createUser(other.id, UserStatus.ACTIVE);
    await assert.rejects(
      () => owner.companyBillingProfile.create({ data: { companyId: company.id, billingName: 'Profile', addressLine1: 'Road', city: 'Pune', postalCode: '411001', country: 'IN', billingContactUserId: otherContact.id } }),
      /Foreign key constraint/i,
    );
  });

  it('proves a stable decision timestamp, bounded queries, and no GET side effects', async () => {
    const company = await createCompany();
    await createAdmin(company.id);
    const before = await counts(owner);
    const queries: string[] = [];
    const countedReader = new PrismaClient({ datasourceUrl: readerUrl, log: [{ emit: 'event', level: 'query' }] });
    countedReader.$on('query', (event) => queries.push(event.query));
    await countedReader.$connect();
    try {
      const counted = new CompanyOnboardingReadinessService(countedReader as unknown as PrismaService, new CommercialAccessService(countedReader as unknown as PrismaService));
      const result = await counted.evaluate(company.id);
      assert.match(result.evaluatedAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.ok(queries.length >= 6 && queries.length <= 10, `query count ${queries.length}`);
    } finally {
      await countedReader.$disconnect();
    }
    assert.deepEqual(await counts(owner), before);
  });

  it('proves real REPEATABLE READ snapshot consistency with a deterministic query barrier', async () => {
    const company = await createCompany();
    await createAdmin(company.id);
    await owner.companyBillingProfile.create({ data: { companyId: company.id, billingName: 'Before', addressLine1: 'Road', city: 'Pune', postalCode: '411001', country: 'IN' } });
    const contact = await createUser(company.id, UserStatus.ACTIVE);
    let release!: () => void;
    let reached!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    const atBarrier = new Promise<void>((resolve) => { reached = resolve; });
    let paused = false;
    const barrierReader = reader.$extends({
      query: {
        companyBillingProfile: {
          async findUnique({ args, query }) {
            if (!paused) {
              paused = true;
              reached();
              await released;
            }
            return query(args);
          },
        },
      },
    });
    const barrierService = new CompanyOnboardingReadinessService(barrierReader as never, new CommercialAccessService(barrierReader as never));
    const firstPromise = barrierService.evaluate(company.id);
    await atBarrier;
    await owner.companyBillingProfile.update({ where: { companyId: company.id }, data: { billingContactUserId: contact.id } });
    release();
    const first = await firstPromise;
    const second = await service.evaluate(company.id);
    assert.equal(readinessItem(first, ItemId.BILLING_CONTACT).reasonCode, 'BILLING_CONTACT_MISSING_OR_INELIGIBLE');
    assert.equal(readinessItem(second, ItemId.BILLING_CONTACT).reasonCode, 'BILLING_CONTACT_ELIGIBLE');
  });
});

async function counts(client: PrismaClient) {
  const [audit, tokens, notifications, deliveries] = await Promise.all([
    client.auditLog.count(),
    client.accountActionToken.count(),
    client.notification.count(),
    client.notificationDelivery.count(),
  ]);
  return { audit, tokens, notifications, deliveries };
}
