import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BillingInterval, CompanyStatus, PlanBillingModel, RoleName, SubscriptionActivationSource, SubscriptionStatus, TrialStatus, UserStatus } from '@prisma/client';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TrialsController } from './trials.controller';
import { CancelTrialDto, ConvertTrialDto, ExtendTrialDto, StartTrialDto } from './dto/trial.dto';
import { DEFAULT_TRIAL_DURATION_HOURS, DEFAULT_TRIAL_SEAT_LIMIT } from './trial-policy';
import { isEffectiveTrial, TrialsService } from './trials.service';
import { SeatUsageService } from '../usage-seats/seat-usage.service';

const actor = { id: 'actor-1', companyId: null, email: 'admin@example.com', firstName: 'Super', lastName: 'Admin', status: UserStatus.ACTIVE, roles: [RoleName.SUPER_ADMIN] };
const company = { id: 'company-1', name: 'Acme', slug: 'acme', status: CompanyStatus.ACTIVE, deletedAt: null };
const activeTrial = { id: 'trial-1', companyId: company.id, status: TrialStatus.ACTIVE, startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() + 86400000), seatLimit: 10, entitlementsSnapshot: ['workforce.attendance'], limitsSnapshot: {}, cancelledAt: null, expiredAt: null, convertedAt: null, convertedSubscriptionId: null, createdAt: new Date(), updatedAt: new Date() };

function harness(options: { history?: number; active?: typeof activeTrial | null; liveSubscription?: boolean; conversionFailure?: boolean; used?: number } = {}) {
  let trial = options.active === undefined ? null : options.active;
  const audits: Array<{ action: string; metadata: unknown }> = [];
  let createData: Record<string, unknown> | null = null;
  let updateData: Record<string, unknown> | null = null;
  let conversionData: Record<string, unknown> | null = null;
  const tx = {
    company: { findFirst: async () => company },
    companyTrial: {
      findFirst: async () => trial,
      findUnique: async () => trial,
      count: async () => options.history ?? 0,
      create: async ({ data }: { data: Record<string, unknown> }) => { createData = data; trial = { ...activeTrial, ...data } as typeof activeTrial; return { ...trial, company, convertedSubscription: null }; },
      update: async ({ data }: { data: Record<string, unknown> }) => { updateData = data; trial = { ...trial!, ...data } as typeof activeTrial; return { ...trial, company, convertedSubscription: null }; },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { if (!trial || trial.status !== TrialStatus.ACTIVE) return { count: 0 }; updateData = data; trial = { ...trial, ...data } as typeof activeTrial; return { count: 1 }; },
      findMany: async () => trial ? [{ id: trial.id }] : [],
    },
    auditLog: { create: async ({ data }: { data: { action: string; metadata: unknown } }) => { audits.push(data); return {}; } },
  };
  const prisma = {
    companyTrial: { findMany: async () => trial ? [{ id: trial.id, companyId: trial.companyId }] : [], findUnique: async () => trial },
    $transaction: async (value: unknown) => typeof value === 'function' ? (value as (tx: typeof tx) => unknown)(tx) : Promise.all(value as Promise<unknown>[]),
  };
  const subscriptions = {
    assertNoLiveSubscription: async () => { if (options.liveSubscription) throw new ConflictException('live'); },
    createActiveInTransaction: async (_tx: unknown, dto: Record<string, unknown>) => {
      if (options.conversionFailure) throw new Error('conversion failed');
      conversionData = dto;
      return { id: 'subscription-1', planId: dto.planId, status: SubscriptionStatus.ACTIVE, activationSource: dto.activationSource, planCodeSnapshot: 'PRO', planNameSnapshot: 'Professional', billingModelSnapshot: PlanBillingModel.PER_USER, entitlementsSnapshot: ['workforce.leave'], limitsSnapshot: { screenshotRetentionDays: 30 } };
    },
  };
  const seatPolicy = new SeatUsageService({} as never);
  const seatUsage = {
    lockCompany: async () => undefined,
    countUsedSeats: async () => options.used ?? 0,
    assessProposedCapacity: seatPolicy.assessProposedCapacity.bind(seatPolicy),
  };
  return { service: new TrialsService(prisma as never, subscriptions as never, seatUsage as never), audits, createData: () => createData, updateData: () => updateData, conversionData: () => conversionData, trial: () => trial };
}

describe('TrialsService', () => {
  it('is SUPER_ADMIN-only and denies tenant roles', () => { const roles = new Reflector().get<RoleName[]>('roles', TrialsController); assert.deepEqual(roles, [RoleName.SUPER_ADMIN]); const guard = new RolesGuard({ getAllAndOverride: () => roles } as never); const context = { getHandler: () => TrialsController.prototype.findAll, getClass: () => TrialsController, switchToHttp: () => ({ getRequest: () => ({ user: { ...actor, roles: [RoleName.COMPANY_ADMIN] } }) }) }; assert.throws(() => guard.canActivate(context as never), ForbiddenException); });
  it('rejects malformed and null command values through DTO validation', async () => { const invalid = [plainToInstance(StartTrialDto, { companyId: null, seatLimit: 0, durationHours: -1 }), plainToInstance(ExtendTrialDto, { durationHours: 0, reason: null }), plainToInstance(CancelTrialDto, { reason: '   ' }), plainToInstance(ConvertTrialDto, { planId: null, billingInterval: 'BAD', seatQuantity: 0 })]; for (const dto of invalid) assert.ok((await validate(dto)).length > 0); });
  it('starts directly ACTIVE for exactly seven days with centralized seat, entitlement, and limit snapshots', async () => { const h = harness(); const before = Date.now(); await h.service.start({ companyId: company.id }, actor); const data = h.createData()!; assert.equal(data.status, TrialStatus.ACTIVE); assert.equal(data.seatLimit, DEFAULT_TRIAL_SEAT_LIMIT); assert.equal((data.endsAt as Date).getTime() - (data.startsAt as Date).getTime(), DEFAULT_TRIAL_DURATION_HOURS * 3600000); assert.ok((data.startsAt as Date).getTime() >= before); assert.deepEqual(data.limitsSnapshot, {}); assert.deepEqual(data.entitlementsSnapshot, ['monitoring.alerts', 'monitoring.core', 'monitoring.productivity', 'monitoring.screenshots', 'workforce.attendance', 'workforce.leave', 'workforce.scheduling']); assert.ok(!(data.entitlementsSnapshot as string[]).includes('crm.core')); assert.equal(h.audits[0].action, 'TRIAL_STARTED'); });
  it('validates positive seats, rejects duplicate ACTIVE Trial, and rejects a live Subscription', async () => { await assert.rejects(() => harness().service.start({ companyId: company.id, seatLimit: 0 }, actor), BadRequestException); await assert.rejects(() => harness({ active: activeTrial }).service.start({ companyId: company.id }, actor), ConflictException); await assert.rejects(() => harness({ liveSubscription: true }).service.start({ companyId: company.id }, actor), ConflictException); });
  it('requires a reason for re-trial but permits an audited new row after terminal history', async () => { await assert.rejects(() => harness({ history: 1 }).service.start({ companyId: company.id }, actor), BadRequestException); const h = harness({ history: 1 }); await h.service.start({ companyId: company.id, reason: 'Approved exception' }, actor); assert.deepEqual((h.audits[0].metadata as { reason: string }).reason, 'Approved exception'); });
  it('centralizes effective-window logic', () => { assert.equal(isEffectiveTrial(activeTrial), true); assert.equal(isEffectiveTrial({ ...activeTrial, endsAt: new Date(Date.now() - 1) }), false); assert.equal(isEffectiveTrial({ ...activeTrial, status: TrialStatus.CANCELLED }), false); });
  it('extends only effective ACTIVE Trials without refreshing snapshots', async () => { const h = harness({ active: activeTrial }); const originalEntitlements = activeTrial.entitlementsSnapshot; const originalEnd = activeTrial.endsAt; await h.service.extend(activeTrial.id, { durationHours: 24, reason: 'Evaluation' }, actor); assert.equal((h.updateData()!.endsAt as Date).getTime(), originalEnd.getTime() + 86400000); assert.equal(h.updateData()!.entitlementsSnapshot, undefined); assert.deepEqual(h.trial()!.entitlementsSnapshot, originalEntitlements); assert.equal(h.audits[0].action, 'TRIAL_EXTENDED'); });
  it('cancels ACTIVE Trial terminally and retains the planned end', async () => { const h = harness({ active: activeTrial }); await h.service.cancel(activeTrial.id, { reason: 'Requested' }, actor); assert.equal(h.trial()!.status, TrialStatus.CANCELLED); assert.ok(h.trial()!.cancelledAt); assert.equal(h.trial()!.endsAt, activeTrial.endsAt); await assert.rejects(() => h.service.cancel(activeTrial.id, { reason: 'Again' }, actor), BadRequestException); });
  it('reconciles expiry once and audits idempotently', async () => { const ended = { ...activeTrial, endsAt: new Date(Date.now() - 1000) }; const h = harness({ active: ended }); assert.equal(await h.service.reconcileExpired(), 1); assert.equal(h.trial()!.status, TrialStatus.EXPIRED); assert.equal(await h.service.reconcileExpired(), 0); assert.deepEqual(h.audits.map((event) => event.action), ['TRIAL_EXPIRED']); });
  it('converts atomically using TRIAL_CONVERSION and selected Plan terms, never Trial terms', async () => { const h = harness({ active: activeTrial }); await h.service.convert(activeTrial.id, { planId: 'plan-1', billingInterval: BillingInterval.MONTHLY, seatQuantity: 5 }, actor); assert.equal(h.trial()!.status, TrialStatus.CONVERTED); assert.equal(h.trial()!.convertedSubscriptionId, 'subscription-1'); assert.equal(h.conversionData()!.activationSource, SubscriptionActivationSource.TRIAL_CONVERSION); assert.equal(h.conversionData()!.entitlements, undefined); assert.notDeepEqual(h.conversionData()!.entitlements, activeTrial.entitlementsSnapshot); assert.equal(h.audits[0].action, 'TRIAL_CONVERTED'); });
  it('leaves Trial ACTIVE and unaudited when Subscription creation fails', async () => { const h = harness({ active: activeTrial, conversionFailure: true }); await assert.rejects(() => h.service.convert(activeTrial.id, { planId: 'plan-1', billingInterval: BillingInterval.MONTHLY, seatQuantity: 5 }, actor), /conversion failed/); assert.equal(h.trial()!.status, TrialStatus.ACTIVE); assert.equal(h.updateData(), null); assert.deepEqual(h.audits, []); });
  it('never mutates Company status', async () => { const h = harness(); await h.service.start({ companyId: company.id }, actor); assert.equal(company.status, CompanyStatus.ACTIVE); assert.equal('status' in (h.createData() ?? {}), true); });
  it('requires a reasoned override when Trial capacity is below current usage', async () => { await assert.rejects(() => harness({ used: 11 }).service.start({ companyId: company.id, seatLimit: 10 }, actor), BadRequestException); const h = harness({ used: 11 }); await h.service.start({ companyId: company.id, seatLimit: 10, allowOverLimit: true, reason: 'Approved Trial exception' }, actor); const metadata = h.audits[0].metadata as { overLimitOverride: boolean; usedSeats: number; proposedCapacity: number; overBy: number; reason: string }; assert.deepEqual(metadata, { durationHours: 168, seatLimit: 10, entitlementCount: 7, reason: 'Approved Trial exception', overLimitOverride: true, usedSeats: 11, proposedCapacity: 10, overBy: 1 }); });
  it('requires a reasoned override when Trial conversion capacity is below usage', async () => { await assert.rejects(() => harness({ active: activeTrial, used: 6 }).service.convert(activeTrial.id, { planId: 'plan-1', billingInterval: BillingInterval.MONTHLY, seatQuantity: 5 }, actor), BadRequestException); const h = harness({ active: activeTrial, used: 6 }); await h.service.convert(activeTrial.id, { planId: 'plan-1', billingInterval: BillingInterval.MONTHLY, seatQuantity: 5, allowOverLimit: true, reason: 'Approved conversion' }, actor); assert.equal((h.audits[0].metadata as { overLimitOverride: boolean }).overLimitOverride, true); });
});
