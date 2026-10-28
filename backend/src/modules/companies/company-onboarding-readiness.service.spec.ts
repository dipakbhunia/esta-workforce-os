import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import {
  CompanyStatus,
  Prisma,
  SubscriptionStatus,
  TrialStatus,
  UserStatus,
} from '@prisma/client';
import { CommercialSeatSource } from '../usage-seats/usage-seats.types';
import { CompanyOnboardingReadinessService } from './company-onboarding-readiness.service';
import {
  CompanyOnboardingReadinessItemId as ItemId,
  CompanyOnboardingReadinessStatus as Status,
} from './dto/company-onboarding-readiness.dto';

const companyId = '10000000-0000-4000-8000-000000000001';
const otherCompanyId = '20000000-0000-4000-8000-000000000001';

type FixtureOptions = {
  company?: Record<string, unknown> | null;
  activeAdmin?: boolean;
  pendingInvitation?: boolean;
  adminCandidate?: AdminCandidate | null;
  invitationCandidate?: InvitationCandidate | null;
  billingProfile?: Record<string, unknown> | null;
  commercial?: {
    source: CommercialSeatSource;
    commercialStatus: TrialStatus | SubscriptionStatus | null;
    allocationAllowed: boolean;
  };
};

type AdminCandidate = {
  id: string;
  companyId: string | null;
  status: UserStatus;
  deletedAt: Date | null;
  role: { companyId: string | null; systemName: string; deletedAt: Date | null };
};

type InvitationCandidate = {
  id: string;
  companyId: string | null;
  purpose: string;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
  expiresAt: Date;
  user: AdminCandidate;
};

const baseCompany = {
  id: companyId,
  name: 'Acme',
  slug: 'acme',
  timezone: 'Asia/Kolkata',
  status: CompanyStatus.ACTIVE,
  primaryEmail: 'contact@example.invalid',
  phone: '+910000000000',
  country: 'India',
  address: 'Pune',
};

const completeBillingProfile = {
  billingName: 'Acme',
  addressLine1: 'Street',
  city: 'Pune',
  postalCode: '411001',
  country: 'India',
  billingContact: { companyId, status: UserStatus.ACTIVE, deletedAt: null },
};

const eligibleAdmin = (): AdminCandidate => ({
  id: 'admin-1',
  companyId,
  status: UserStatus.ACTIVE,
  deletedAt: null,
  role: { companyId, systemName: 'COMPANY_ADMIN', deletedAt: null },
});

const eligibleInvitation = (): InvitationCandidate => ({
  id: 'token-1',
  companyId,
  purpose: 'INVITATION',
  consumedAt: null,
  invalidatedAt: null,
  expiresAt: new Date('2999-01-01T00:00:00.000Z'),
  user: { ...eligibleAdmin(), status: UserStatus.INACTIVE },
});

function scalarMatches(candidate: Record<string, unknown>, where: Record<string, unknown>, field: string): boolean {
  return where[field] === undefined || candidate[field] === where[field];
}

function adminMatches(candidate: AdminCandidate, where: Record<string, unknown>): boolean {
  const roleWhere = ((where.roles as { some?: { role?: Record<string, unknown> } } | undefined)?.some?.role) ?? {};
  return scalarMatches(candidate as unknown as Record<string, unknown>, where, 'companyId')
    && scalarMatches(candidate as unknown as Record<string, unknown>, where, 'status')
    && scalarMatches(candidate as unknown as Record<string, unknown>, where, 'deletedAt')
    && scalarMatches(candidate.role, roleWhere, 'companyId')
    && scalarMatches(candidate.role, roleWhere, 'systemName')
    && scalarMatches(candidate.role, roleWhere, 'deletedAt');
}

function invitationMatches(candidate: InvitationCandidate, where: Record<string, unknown>): boolean {
  const expiry = where.expiresAt as { gt?: Date } | undefined;
  const userWhere = (where.user as Record<string, unknown> | undefined) ?? {};
  return scalarMatches(candidate as unknown as Record<string, unknown>, where, 'companyId')
    && scalarMatches(candidate as unknown as Record<string, unknown>, where, 'purpose')
    && scalarMatches(candidate as unknown as Record<string, unknown>, where, 'consumedAt')
    && scalarMatches(candidate as unknown as Record<string, unknown>, where, 'invalidatedAt')
    && (!expiry?.gt || candidate.expiresAt > expiry.gt)
    && adminMatches(candidate.user, userWhere);
}

function fixture(options: FixtureOptions = {}) {
  const calls: Array<{ model: string; args: unknown }> = [];
  let transactionOptions: unknown;
  const adminCandidate = options.adminCandidate !== undefined
    ? options.adminCandidate
    : options.activeAdmin === false ? null : eligibleAdmin();
  const invitationCandidate = options.invitationCandidate !== undefined
    ? options.invitationCandidate
    : options.pendingInvitation ? eligibleInvitation() : null;
  const tx = {
    company: {
      findFirst: async (args: unknown) => {
        calls.push({ model: 'company', args });
        return options.company === null ? null : { ...baseCompany, ...(options.company ?? {}) };
      },
    },
    user: {
      findFirst: async (args: unknown) => {
        calls.push({ model: 'user', args });
        const where = (args as { where: Record<string, unknown> }).where;
        return adminCandidate && adminMatches(adminCandidate, where) ? { id: adminCandidate.id } : null;
      },
    },
    accountActionToken: {
      findFirst: async (args: unknown) => {
        calls.push({ model: 'token', args });
        const where = (args as { where: Record<string, unknown> }).where;
        return invitationCandidate && invitationMatches(invitationCandidate, where) ? { id: invitationCandidate.id } : null;
      },
    },
    companyBillingProfile: {
      findUnique: async (args: unknown) => {
        calls.push({ model: 'billingProfile', args });
        return options.billingProfile === undefined ? completeBillingProfile : options.billingProfile;
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (client: typeof tx) => unknown, settings: unknown) => {
      transactionOptions = settings;
      return callback(tx);
    },
  };
  const commercial = options.commercial ?? {
    source: CommercialSeatSource.TRIAL,
    commercialStatus: TrialStatus.ACTIVE,
    allocationAllowed: true,
  };
  let commercialCall: unknown[] | undefined;
  const commercialAccess = {
    resolve: async (...args: unknown[]) => {
      commercialCall = args;
      return { ...commercial, referenceId: 'commercial-1', plan: null, capacity: 10 };
    },
  };
  return {
    service: new CompanyOnboardingReadinessService(prisma as never, commercialAccess as never),
    calls,
    transactionOptions: () => transactionOptions,
    transactionClient: tx,
    commercialCall: () => commercialCall,
  };
}

function item(result: Awaited<ReturnType<CompanyOnboardingReadinessService['evaluate']>>, id: ItemId) {
  return result.items.find((candidate) => candidate.id === id)!;
}

describe('CompanyOnboardingReadinessService', () => {
  it('returns a versioned, ready administrative contract from one repeatable-read snapshot', async () => {
    const state = fixture();
    const result = await state.service.evaluate(companyId);

    assert.equal(result.companyId, companyId);
    assert.equal(result.contractVersion, '1');
    assert.equal(result.overallStatus, Status.READY);
    assert.equal(result.blockingCount, 0);
    assert.equal(result.items.length, 8);
    assert.deepEqual(state.transactionOptions(), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    assert.equal(state.commercialCall()?.[0], companyId);
    assert.equal(state.commercialCall()?.[1], state.transactionClient);
    assert.equal(state.commercialCall()?.[2] instanceof Date, true);
    assert.equal(result.evaluatedAt, (state.commercialCall()?.[2] as Date).toISOString());
    assert.deepEqual(state.calls.map(({ model }) => model), ['company', 'user', 'billingProfile']);
  });

  it('uses a valid pending invitation as incomplete handoff without double-counting it as blocking', async () => {
    const result = await fixture({ activeAdmin: false, pendingInvitation: true }).service.evaluate(companyId);
    assert.equal(result.overallStatus, Status.INCOMPLETE);
    assert.equal(result.blockingCount, 1);
    assert.equal(item(result, ItemId.TENANT_ADMIN_ACCESS).status, Status.INCOMPLETE);
    assert.equal(item(result, ItemId.ADMIN_INVITATION).status, Status.INCOMPLETE);
    assert.equal(item(result, ItemId.ADMIN_INVITATION).blocking, false);
  });

  it('blocks administrative handoff when neither active authority nor a valid invitation exists', async () => {
    const result = await fixture({ activeAdmin: false, pendingInvitation: false }).service.evaluate(companyId);
    assert.equal(result.overallStatus, Status.BLOCKED);
    assert.equal(item(result, ItemId.TENANT_ADMIN_ACCESS).reasonCode, 'COMPANY_ADMIN_AUTHORITY_MISSING');
  });

  it('does not query or count historical invitations after active admin authority is found', async () => {
    const state = fixture({ activeAdmin: true, pendingInvitation: true });
    const result = await state.service.evaluate(companyId);
    assert.equal(state.calls.some(({ model }) => model === 'token'), false);
    assert.equal(item(result, ItemId.ADMIN_INVITATION).status, Status.NOT_APPLICABLE);
    assert.equal(result.overallStatus, Status.READY);
  });

  it('uses strict same-company, live-role and valid-token predicates', async () => {
    const state = fixture({ activeAdmin: false, pendingInvitation: true });
    await state.service.evaluate(companyId);
    const adminWhere = (state.calls.find(({ model }) => model === 'user')!.args as { where: Record<string, unknown> }).where;
    const tokenWhere = (state.calls.find(({ model }) => model === 'token')!.args as { where: Record<string, unknown> }).where;
    assert.equal(adminWhere.companyId, companyId);
    assert.equal(adminWhere.status, UserStatus.ACTIVE);
    assert.equal(adminWhere.deletedAt, null);
    assert.equal(tokenWhere.companyId, companyId);
    assert.equal(tokenWhere.consumedAt, null);
    assert.equal(tokenWhere.invalidatedAt, null);
    assert.ok(tokenWhere.expiresAt);
    assert.equal(JSON.stringify({ adminWhere, tokenWhere }).includes(otherCompanyId), false);
  });

  it('rejects expired, consumed, and invalidated invitations as observable blocked handoff states', async () => {
    const cases: Array<[string, Partial<InvitationCandidate>]> = [
      ['expired', { expiresAt: new Date('2000-01-01T00:00:00.000Z') }],
      ['consumed', { consumedAt: new Date('2020-01-01T00:00:00.000Z') }],
      ['invalidated', { invalidatedAt: new Date('2020-01-01T00:00:00.000Z') }],
    ];
    for (const [label, override] of cases) {
      const invitationCandidate = { ...eligibleInvitation(), ...override };
      const result = await fixture({ adminCandidate: null, invitationCandidate }).service.evaluate(companyId);
      assert.equal(result.overallStatus, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.TENANT_ADMIN_ACCESS).status, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.TENANT_ADMIN_ACCESS).reasonCode, 'COMPANY_ADMIN_AUTHORITY_MISSING', label);
      assert.equal(item(result, ItemId.ADMIN_INVITATION).status, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.ADMIN_INVITATION).reasonCode, 'VALID_INVITATION_MISSING', label);
    }
  });

  it('rejects deleted, cross-company, cross-role, and platform-role administrators behaviorally', async () => {
    const cases: Array<[string, AdminCandidate]> = [
      ['deleted administrator', { ...eligibleAdmin(), deletedAt: new Date('2020-01-01T00:00:00.000Z') }],
      ['cross-company administrator', { ...eligibleAdmin(), companyId: otherCompanyId }],
      ['cross-company role', { ...eligibleAdmin(), role: { ...eligibleAdmin().role, companyId: otherCompanyId } }],
      ['platform-level role', { ...eligibleAdmin(), role: { ...eligibleAdmin().role, companyId: null } }],
    ];
    for (const [label, adminCandidate] of cases) {
      const result = await fixture({ adminCandidate, invitationCandidate: null }).service.evaluate(companyId);
      assert.equal(result.overallStatus, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.TENANT_ADMIN_ACCESS).status, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.TENANT_ADMIN_ACCESS).reasonCode, 'COMPANY_ADMIN_AUTHORITY_MISSING', label);
      assert.equal(item(result, ItemId.ADMIN_INVITATION).status, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.ADMIN_INVITATION).reasonCode, 'VALID_INVITATION_MISSING', label);
    }
  });

  it('rejects invitations owned by deleted or cross-company administrators', async () => {
    const cases: Array<[string, AdminCandidate]> = [
      ['deleted owner', { ...eligibleInvitation().user, deletedAt: new Date('2020-01-01T00:00:00.000Z') }],
      ['cross-company owner', { ...eligibleInvitation().user, companyId: otherCompanyId }],
      ['cross-company owner role', { ...eligibleInvitation().user, role: { ...eligibleInvitation().user.role, companyId: otherCompanyId } }],
      ['platform-level owner role', { ...eligibleInvitation().user, role: { ...eligibleInvitation().user.role, companyId: null } }],
    ];
    for (const [label, user] of cases) {
      const result = await fixture({
        adminCandidate: null,
        invitationCandidate: { ...eligibleInvitation(), user },
      }).service.evaluate(companyId);
      assert.equal(result.overallStatus, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.TENANT_ADMIN_ACCESS).status, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.TENANT_ADMIN_ACCESS).reasonCode, 'COMPANY_ADMIN_AUTHORITY_MISSING', label);
      assert.equal(item(result, ItemId.ADMIN_INVITATION).status, Status.BLOCKED, label);
      assert.equal(item(result, ItemId.ADMIN_INVITATION).reasonCode, 'VALID_INVITATION_MISSING', label);
    }
  });

  it('treats inactive and suspended lifecycle states as non-blocking warnings', async () => {
    for (const status of [CompanyStatus.INACTIVE, CompanyStatus.SUSPENDED]) {
      const result = await fixture({ company: { status } }).service.evaluate(companyId);
      assert.equal(item(result, ItemId.OPERATIONAL_LIFECYCLE).status, Status.INCOMPLETE);
      assert.equal(item(result, ItemId.OPERATIONAL_LIFECYCLE).blocking, false);
      assert.equal(result.overallStatus, Status.READY);
    }
  });

  it('returns 404 for missing or archived companies before dependent reads', async () => {
    const state = fixture({ company: null });
    await assert.rejects(() => state.service.evaluate(companyId), NotFoundException);
    assert.deepEqual(state.calls.map(({ model }) => model), ['company']);
  });

  it('keeps commercial and billing deficiencies visible but outside administrative aggregation', async () => {
    const result = await fixture({
      billingProfile: null,
      commercial: { source: CommercialSeatSource.NONE, commercialStatus: null, allocationAllowed: false },
    }).service.evaluate(companyId);
    assert.equal(item(result, ItemId.COMMERCIAL_ACCESS).status, Status.INCOMPLETE);
    assert.equal(item(result, ItemId.BILLING_PROFILE).status, Status.INCOMPLETE);
    assert.equal(item(result, ItemId.BILLING_CONTACT).status, Status.NOT_APPLICABLE);
    assert.equal(result.overallStatus, Status.READY);
  });

  it('reports suspended subscription access as non-blocking and preserves resolver authority', async () => {
    const result = await fixture({ commercial: {
      source: CommercialSeatSource.SUBSCRIPTION,
      commercialStatus: SubscriptionStatus.SUSPENDED,
      allocationAllowed: false,
    } }).service.evaluate(companyId);
    assert.equal(item(result, ItemId.COMMERCIAL_ACCESS).status, Status.BLOCKED);
    assert.equal(item(result, ItemId.COMMERCIAL_ACCESS).blocking, false);
    assert.equal(result.overallStatus, Status.READY);
  });

  it('reports incomplete billing fields and ineligible billing contacts without blocking', async () => {
    const result = await fixture({ billingProfile: {
      ...completeBillingProfile,
      city: ' ',
      billingContact: { companyId: otherCompanyId, status: UserStatus.ACTIVE, deletedAt: null },
    } }).service.evaluate(companyId);
    assert.equal(item(result, ItemId.BILLING_PROFILE).reasonCode, 'BILLING_PROFILE_INCOMPLETE');
    assert.equal(item(result, ItemId.BILLING_CONTACT).status, Status.INCOMPLETE);
    assert.equal(result.overallStatus, Status.READY);
  });

  it('reports inactive and deleted billing contacts as incomplete without blocking onboarding', async () => {
    for (const [label, billingContact] of [
      ['inactive', { companyId, status: UserStatus.INACTIVE, deletedAt: null }],
      ['deleted', { companyId, status: UserStatus.ACTIVE, deletedAt: new Date('2020-01-01T00:00:00.000Z') }],
    ] as const) {
      const result = await fixture({ billingProfile: { ...completeBillingProfile, billingContact } }).service.evaluate(companyId);
      assert.equal(item(result, ItemId.BILLING_CONTACT).status, Status.INCOMPLETE, label);
      assert.equal(item(result, ItemId.BILLING_CONTACT).reasonCode, 'BILLING_CONTACT_MISSING_OR_INELIGIBLE', label);
      assert.equal(result.overallStatus, Status.READY, label);
    }
  });

  it('does not expose personal, token, financial, SMTP, or provider fields', async () => {
    const serialized = JSON.stringify(await fixture().service.evaluate(companyId));
    for (const forbidden of ['email', 'token', 'password', 'smtp', 'amount', 'provider', 'referenceId', 'capacity']) {
      assert.equal(serialized.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    }
  });

  it('uses deterministic mandatory precedence BLOCKED > UNAVAILABLE > INCOMPLETE > READY', () => {
    const candidate = (status: Status) => ({ status, blocking: true }) as never;
    assert.equal(CompanyOnboardingReadinessService.aggregate([candidate(Status.READY)]), Status.READY);
    assert.equal(CompanyOnboardingReadinessService.aggregate([candidate(Status.INCOMPLETE), candidate(Status.READY)]), Status.INCOMPLETE);
    assert.equal(CompanyOnboardingReadinessService.aggregate([candidate(Status.UNAVAILABLE), candidate(Status.INCOMPLETE)]), Status.UNAVAILABLE);
    assert.equal(CompanyOnboardingReadinessService.aggregate([candidate(Status.BLOCKED), candidate(Status.UNAVAILABLE)]), Status.BLOCKED);
    assert.equal(CompanyOnboardingReadinessService.aggregate([candidate(Status.NOT_APPLICABLE)]), Status.UNAVAILABLE);
    assert.equal(CompanyOnboardingReadinessService.aggregate([]), Status.UNAVAILABLE);
  });

  it('bounds the normal ready evaluation to company, admin, billing, and shared commercial reads', async () => {
    const state = fixture();
    await state.service.evaluate(companyId);
    assert.equal(state.calls.length, 3);
    assert.equal(state.commercialCall()?.length, 3);
  });
});
