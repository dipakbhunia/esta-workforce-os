import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyStatus, Prisma, SubscriptionActivationSource, SubscriptionStatus, TrialStatus } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { ApprovedOverLimit, SeatUsageService } from '../usage-seats/seat-usage.service';
import { CancelTrialDto, ConvertTrialDto, ExtendTrialDto, StartTrialDto, TrialQueryDto } from './dto/trial.dto';
import { DEFAULT_TRIAL_DURATION_HOURS, DEFAULT_TRIAL_LIMITS, DEFAULT_TRIAL_SEAT_LIMIT, MAX_TRIAL_DURATION_HOURS, trialEntitlementSnapshot } from './trial-policy';

const detailInclude = {
  company: { select: { id: true, name: true, slug: true, status: true } },
  convertedSubscription: { select: { id: true, status: true, planCodeSnapshot: true, planNameSnapshot: true } },
} satisfies Prisma.CompanyTrialInclude;

export function isEffectiveTrial(value: { status: TrialStatus; startsAt: Date; endsAt: Date }, now = new Date()): boolean {
  return value.status === TrialStatus.ACTIVE && value.startsAt <= now && value.endsAt > now;
}

@Injectable()
export class TrialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
    private readonly seatUsage: SeatUsageService,
  ) {}

  async start(dto: StartTrialDto, actor: AuthenticatedUser) {
    const now = new Date();
    const durationHours = dto.durationHours ?? DEFAULT_TRIAL_DURATION_HOURS;
    const seatLimit = dto.seatLimit ?? DEFAULT_TRIAL_SEAT_LIMIT;
    this.positiveInteger(durationHours, 'Trial duration', MAX_TRIAL_DURATION_HOURS);
    this.positiveInteger(seatLimit, 'Seat limit');
    return this.prisma.$transaction(async (tx) => {
      await this.seatUsage.lockCompany(tx, dto.companyId);
      const company = await tx.company.findFirst({ where: { id: dto.companyId, deletedAt: null } });
      if (!company) throw new NotFoundException('Company not found');
      if (company.status !== CompanyStatus.ACTIVE && company.status !== CompanyStatus.TRIAL) throw new BadRequestException('Company is not operationally eligible for a Trial');
      await this.reconcileCompanyExpired(tx, company.id, now);
      if (await tx.companyTrial.findFirst({ where: { companyId: company.id, status: TrialStatus.ACTIVE } })) throw new ConflictException('Company already has an active Trial');
      await this.subscriptions.assertNoLiveSubscription(tx, company.id);
      const history = await tx.companyTrial.count({ where: { companyId: company.id } });
      const reason = dto.reason?.trim();
      if (history > 0 && !reason) throw new BadRequestException('A reason is required when starting another Trial for this Company');
      const used = await this.seatUsage.countUsedSeats(company.id, tx);
      const approval = this.seatUsage.assessProposedCapacity(used, seatLimit, dto);
      const created = await tx.companyTrial.create({ data: {
        companyId: company.id, status: TrialStatus.ACTIVE, startsAt: now,
        endsAt: new Date(now.getTime() + durationHours * 60 * 60 * 1000), seatLimit,
        entitlementsSnapshot: trialEntitlementSnapshot(), limitsSnapshot: DEFAULT_TRIAL_LIMITS,
      }, include: detailInclude });
      await this.audit(tx, actor.id, company.id, created.id, 'TRIAL_STARTED', { durationHours, seatLimit, entitlementCount: created.entitlementsSnapshot.length, ...(reason ? { reason } : {}), ...this.overLimitMetadata(approval) });
      return created;
    });
  }

  async findAll(query: TrialQueryDto): Promise<PaginatedResult<unknown>> {
    await this.reconcileExpired();
    if (query.startsFrom && query.startsTo && query.startsFrom > query.startsTo) throw new BadRequestException('Trial start range is invalid');
    if (query.endsFrom && query.endsTo && query.endsFrom > query.endsTo) throw new BadRequestException('Trial end range is invalid');
    const now = new Date();
    const expiringBefore = query.expiringWithinDays ? new Date(now.getTime() + query.expiringWithinDays * 86400000) : undefined;
    const where: Prisma.CompanyTrialWhereInput = {
      ...(query.search?.trim() ? { company: { name: { contains: query.search.trim(), mode: 'insensitive' } } } : {}),
      ...(query.status ? { status: query.status } : {}), ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.startsFrom || query.startsTo ? { startsAt: { ...(query.startsFrom ? { gte: query.startsFrom } : {}), ...(query.startsTo ? { lte: query.startsTo } : {}) } } : {}),
      ...(query.endsFrom || query.endsTo || expiringBefore ? { endsAt: { ...(query.endsFrom ? { gte: query.endsFrom } : {}), ...(query.endsTo ? { lte: query.endsTo } : {}), ...(expiringBefore ? { gt: now, lte: expiringBefore } : {}) } } : {}),
      ...(expiringBefore ? { status: TrialStatus.ACTIVE } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.companyTrial.findMany({ where, ...paginationArgs(query), include: detailInclude, orderBy: { createdAt: 'desc' } }),
      this.prisma.companyTrial.count({ where }),
    ]);
    return paginatedResult(rows, total, query);
  }

  async findOne(id: string) {
    await this.reconcileExpired(id);
    const value = await this.prisma.companyTrial.findUnique({ where: { id }, include: detailInclude });
    if (!value) throw new NotFoundException('Trial not found');
    return value;
  }

  async extend(id: string, dto: ExtendTrialDto, actor: AuthenticatedUser) {
    this.positiveInteger(dto.durationHours, 'Extension duration', MAX_TRIAL_DURATION_HOURS);
    const reason = this.reason(dto.reason);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.companyTrial.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Trial not found');
      await this.seatUsage.lockCompany(tx, current.companyId);
      const locked = await tx.companyTrial.findUnique({ where: { id } });
      const now = new Date();
      if (!locked || !isEffectiveTrial(locked, now)) throw new BadRequestException('Only an effective ACTIVE Trial can be extended');
      const endsAt = new Date(locked.endsAt.getTime() + dto.durationHours * 3600000);
      const updated = await tx.companyTrial.update({ where: { id }, data: { endsAt }, include: detailInclude });
      await this.audit(tx, actor.id, locked.companyId, id, 'TRIAL_EXTENDED', { reason, durationHours: dto.durationHours, previousEndsAt: locked.endsAt.toISOString(), endsAt: endsAt.toISOString() });
      return updated;
    });
  }

  async cancel(id: string, dto: CancelTrialDto, actor: AuthenticatedUser) {
    const reason = this.reason(dto.reason);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.companyTrial.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Trial not found');
      await this.seatUsage.lockCompany(tx, current.companyId);
      const locked = await tx.companyTrial.findUnique({ where: { id } });
      const now = new Date();
      if (!locked || !isEffectiveTrial(locked, now)) throw new BadRequestException('Only an effective ACTIVE Trial can be cancelled');
      const updated = await tx.companyTrial.update({ where: { id }, data: { status: TrialStatus.CANCELLED, cancelledAt: now }, include: detailInclude });
      await this.audit(tx, actor.id, locked.companyId, id, 'TRIAL_CANCELLED', { reason });
      return updated;
    });
  }

  async convert(id: string, dto: ConvertTrialDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.companyTrial.findUnique({ where: { id } });
      if (!current) throw new NotFoundException('Trial not found');
      await this.seatUsage.lockCompany(tx, current.companyId);
      const locked = await tx.companyTrial.findUnique({ where: { id } });
      const now = new Date();
      if (!locked || !isEffectiveTrial(locked, now)) throw new BadRequestException('Only an effective ACTIVE Trial can be converted');
      await this.subscriptions.assertNoLiveSubscription(tx, locked.companyId);
      const used = await this.seatUsage.countUsedSeats(locked.companyId, tx);
      const approval = this.seatUsage.assessProposedCapacity(used, dto.seatQuantity, dto);
      const subscription = await this.subscriptions.createActiveInTransaction(tx, {
        companyId: locked.companyId, planId: dto.planId, billingInterval: dto.billingInterval,
        activationSource: SubscriptionActivationSource.TRIAL_CONVERSION, seatQuantity: dto.seatQuantity,
        pricePerSeatMinor: dto.pricePerSeatMinor, customRecurringPriceMinor: dto.customRecurringPriceMinor,
        entitlements: dto.entitlements, limits: dto.limits, startsAt: now,
      }, actor, approval);
      const converted = await tx.companyTrial.update({ where: { id }, data: { status: TrialStatus.CONVERTED, convertedAt: now, convertedSubscriptionId: subscription.id }, include: detailInclude });
      await this.audit(tx, actor.id, locked.companyId, id, 'TRIAL_CONVERTED', { subscriptionId: subscription.id, planId: subscription.planId, ...this.overLimitMetadata(approval) });
      return converted;
    });
  }

  async reconcileExpired(onlyId?: string): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.companyTrial.findMany({ where: { ...(onlyId ? { id: onlyId } : {}), status: TrialStatus.ACTIVE, endsAt: { lte: now } }, select: { id: true, companyId: true } });
    let count = 0;
    for (const candidate of candidates) {
      count += await this.prisma.$transaction(async (tx) => {
        await this.seatUsage.lockCompany(tx, candidate.companyId);
        const changed = await tx.companyTrial.updateMany({ where: { id: candidate.id, status: TrialStatus.ACTIVE, endsAt: { lte: now } }, data: { status: TrialStatus.EXPIRED, expiredAt: now } });
        if (!changed.count) return 0;
        await this.audit(tx, null, candidate.companyId, candidate.id, 'TRIAL_EXPIRED', { expiredAt: now.toISOString() });
        return 1;
      });
    }
    return count;
  }

  private async reconcileCompanyExpired(tx: Prisma.TransactionClient, companyId: string, now: Date) {
    const candidates = await tx.companyTrial.findMany({ where: { companyId, status: TrialStatus.ACTIVE, endsAt: { lte: now } }, select: { id: true } });
    for (const candidate of candidates) {
      const changed = await tx.companyTrial.updateMany({ where: { id: candidate.id, status: TrialStatus.ACTIVE, endsAt: { lte: now } }, data: { status: TrialStatus.EXPIRED, expiredAt: now } });
      if (changed.count) await this.audit(tx, null, companyId, candidate.id, 'TRIAL_EXPIRED', { expiredAt: now.toISOString() });
    }
  }

  private positiveInteger(value: unknown, field: string, max = Number.MAX_SAFE_INTEGER) { if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) throw new BadRequestException(`${field} must be a positive integer no greater than ${max}`); }
  private reason(value: unknown) { if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('Reason is required'); return value.trim(); }
  private audit(tx: Prisma.TransactionClient, actorUserId: string | null, companyId: string, entityId: string, action: string, metadata: Prisma.InputJsonObject) { return tx.auditLog.create({ data: { actorUserId, companyId, action, entityType: 'CompanyTrial', entityId, metadata } }); }
  private overLimitMetadata(approval: ApprovedOverLimit | null): Prisma.InputJsonObject { return approval ? { overLimitOverride: true, usedSeats: approval.usedSeats, proposedCapacity: approval.proposedCapacity, overBy: approval.overBy, reason: approval.reason } : {}; }
}
