import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BillingInterval, CompanySubscription, Plan, PlanBillingModel, PlanStatus, Prisma, SubscriptionActivationSource, SubscriptionStatus } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CURRENT_ENTITLEMENTS, PLAN_LIMIT_KEYS, PlanLimits, isAssignableEntitlement } from '../plans/plan-catalog.registry';
import { AmendSubscriptionDto, CreateSubscriptionDto, SubscriptionQueryDto } from './dto/subscription.dto';

const detailInclude = {
  company: { select: { id: true, name: true, slug: true, status: true } },
  plan: { select: { id: true, code: true, name: true, status: true } },
  supersedes: { select: { id: true, planCodeSnapshot: true, planNameSnapshot: true, status: true } },
  successors: { select: { id: true, planCodeSnapshot: true, planNameSnapshot: true, status: true }, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.CompanySubscriptionInclude;

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSubscriptionDto, actor: AuthenticatedUser) {
    const [company, plan] = await Promise.all([
      this.prisma.company.findFirst({ where: { id: dto.companyId, deletedAt: null } }),
      this.prisma.plan.findUnique({ where: { id: dto.planId } }),
    ]);
    if (!company) throw new NotFoundException('Company not found');
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.status !== PlanStatus.ACTIVE || plan.archivedAt) throw new BadRequestException('Only active plans can be selected for a new subscription');
    const data = this.createData(dto, plan);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.companySubscription.create({ data, include: detailInclude });
      await this.audit(tx, actor.id, created.companyId, created.id, 'SUBSCRIPTION_CREATED', { planId: created.planId, status: created.status });
      return created;
    });
  }

  async findAll(query: SubscriptionQueryDto): Promise<PaginatedResult<unknown>> {
    const search = query.search?.trim();
    const where: Prisma.CompanySubscriptionWhereInput = {
      ...(search ? { OR: [
        { company: { name: { contains: search, mode: 'insensitive' } } },
        { planNameSnapshot: { contains: search, mode: 'insensitive' } },
        { planCodeSnapshot: { contains: search, mode: 'insensitive' } },
      ] } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.planId ? { planId: query.planId } : {}),
      ...(query.activationSource ? { activationSource: query.activationSource } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.companySubscription.findMany({ where, ...paginationArgs(query), include: detailInclude, orderBy: { createdAt: 'desc' } }),
      this.prisma.companySubscription.count({ where }),
    ]);
    return paginatedResult(rows, total, query);
  }

  async findOne(id: string) {
    const subscription = await this.prisma.companySubscription.findUnique({ where: { id }, include: detailInclude });
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }

  activate(id: string, actor: AuthenticatedUser) { return this.transition(id, SubscriptionStatus.PENDING, SubscriptionStatus.ACTIVE, 'SUBSCRIPTION_ACTIVATED', actor, async (tx, current, now) => {
    await this.assertNoLive(tx, current.companyId, current.id);
    return { startsAt: current.startsAt ?? now, suspendedAt: null };
  }); }
  suspend(id: string, actor: AuthenticatedUser) { return this.transition(id, SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED, 'SUBSCRIPTION_SUSPENDED', actor, async (_tx, _current, now) => ({ suspendedAt: now })); }
  resume(id: string, actor: AuthenticatedUser) { return this.transition(id, SubscriptionStatus.SUSPENDED, SubscriptionStatus.ACTIVE, 'SUBSCRIPTION_RESUMED', actor, async (tx, current) => { await this.assertNoLive(tx, current.companyId, current.id); return { suspendedAt: null }; }); }

  async cancel(id: string, actor: AuthenticatedUser) {
    const current = await this.get(id);
    if (current.status !== SubscriptionStatus.PENDING && current.status !== SubscriptionStatus.ACTIVE && current.status !== SubscriptionStatus.SUSPENDED) throw new BadRequestException(`Cannot cancel a ${current.status} subscription`);
    const now = new Date();
    return this.updateWithAudit(current, { status: SubscriptionStatus.CANCELLED, cancelledAt: now, endedAt: now }, 'SUBSCRIPTION_CANCELLED', actor);
  }

  async expire(id: string, actor: AuthenticatedUser) {
    const current = await this.get(id);
    if (current.status !== SubscriptionStatus.ACTIVE && current.status !== SubscriptionStatus.SUSPENDED) throw new BadRequestException(`Cannot expire a ${current.status} subscription`);
    if (!current.currentPeriodEnd) throw new BadRequestException('Subscription cannot expire without a current period end');
    if (current.currentPeriodEnd.getTime() > Date.now()) throw new BadRequestException('Subscription cannot expire before its current period end');
    return this.updateWithAudit(current, { status: SubscriptionStatus.EXPIRED, endedAt: new Date() }, 'SUBSCRIPTION_EXPIRED', actor);
  }

  async amend(id: string, dto: AmendSubscriptionDto, actor: AuthenticatedUser) {
    const source = await this.get(id);
    if (source.status !== SubscriptionStatus.ACTIVE && source.status !== SubscriptionStatus.SUSPENDED) throw new BadRequestException(`Cannot amend a ${source.status} subscription`);
    const planChanged = dto.planId !== undefined && dto.planId !== source.planId;
    const plan = await this.prisma.plan.findUnique({ where: { id: planChanged ? dto.planId : source.planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (planChanged && (plan.status !== PlanStatus.ACTIVE || plan.archivedAt)) throw new BadRequestException('Only active plans can be selected for an amendment');
    const resolved = this.amendmentData(source, plan, dto, planChanged);
    if (!resolved.changedCategories.length) throw new BadRequestException('Amendment must change at least one commercial term');
    const effectiveAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.companySubscription.findUnique({ where: { id } });
      if (!locked || locked.status !== source.status) throw new ConflictException('Subscription changed while the amendment was being prepared');
      await this.assertNoLive(tx, source.companyId, source.id);
      await tx.companySubscription.update({ where: { id }, data: { status: SubscriptionStatus.SUPERSEDED, endedAt: effectiveAt } });
      const successor = await tx.companySubscription.create({ data: { ...resolved.data, supersedesSubscriptionId: source.id }, include: detailInclude });
      const metadata: Prisma.InputJsonObject = { oldSubscriptionId: source.id, successorSubscriptionId: successor.id, companyId: source.companyId, previousPlanSnapshot: source.planCodeSnapshot, newPlanSnapshot: successor.planCodeSnapshot, changedCategories: resolved.changedCategories };
      await this.audit(tx, actor.id, source.companyId, source.id, 'SUBSCRIPTION_SUPERSEDED', metadata);
      await this.audit(tx, actor.id, source.companyId, successor.id, 'SUBSCRIPTION_AMENDED', metadata);
      return successor;
    });
  }

  private createData(dto: CreateSubscriptionDto, plan: Plan): Prisma.CompanySubscriptionCreateInput {
    this.validateSeats(dto.seatQuantity, plan);
    this.validatePeriod(dto.currentPeriodStart, dto.currentPeriodEnd);
    const complimentary = dto.activationSource === SubscriptionActivationSource.COMPLIMENTARY;
    const isCustom = plan.billingModel === PlanBillingModel.CUSTOM;
    if (!isCustom && (dto.entitlements !== undefined || dto.limits !== undefined || dto.customRecurringPriceMinor !== undefined)) throw new BadRequestException('Negotiated entitlements, limits, and recurring price are only allowed for CUSTOM plans');
    if (isCustom && dto.pricePerSeatMinor !== undefined) throw new BadRequestException('Per-seat price is not valid for CUSTOM plans');
    const customPrice = isCustom ? (complimentary ? 0 : this.integer(dto.customRecurringPriceMinor, 'Custom recurring price', 0)) : null;
    const perSeatPrice = isCustom ? null : (complimentary ? 0 : dto.pricePerSeatMinor === undefined ? plan.monthlyPricePerSeatMinor : this.integer(dto.pricePerSeatMinor, 'Per-seat price', 0));
    if (!isCustom && perSeatPrice === null) throw new BadRequestException('PER_USER plan does not have a valid per-seat price');
    return {
      company: { connect: { id: dto.companyId } }, plan: { connect: { id: plan.id } },
      activationSource: dto.activationSource, billingInterval: dto.billingInterval,
      planCodeSnapshot: plan.code, planNameSnapshot: plan.name, billingModelSnapshot: plan.billingModel,
      currency: this.currency(plan.currency), pricePerSeatMinor: perSeatPrice, customRecurringPriceMinor: customPrice,
      seatQuantity: dto.seatQuantity,
      entitlementsSnapshot: isCustom ? this.entitlements(dto.entitlements ?? plan.entitlements) : plan.entitlements,
      limitsSnapshot: this.limits(isCustom ? dto.limits ?? plan.limits : plan.limits),
      startsAt: dto.startsAt ?? null, currentPeriodStart: dto.currentPeriodStart ?? null, currentPeriodEnd: dto.currentPeriodEnd ?? null,
    };
  }

  private amendmentData(source: CompanySubscription, plan: Plan, dto: AmendSubscriptionDto, planChanged: boolean) {
    const billingModel = planChanged ? plan.billingModel : source.billingModelSnapshot;
    const seatQuantity = dto.seatQuantity ?? source.seatQuantity;
    this.validateSeats(seatQuantity, plan);
    if (billingModel !== PlanBillingModel.CUSTOM && (dto.entitlements !== undefined || dto.limits !== undefined || dto.customRecurringPriceMinor !== undefined)) throw new BadRequestException('Negotiated entitlements, limits, and recurring price are only allowed for CUSTOM subscriptions');
    if (billingModel === PlanBillingModel.CUSTOM && dto.pricePerSeatMinor !== undefined) throw new BadRequestException('Per-seat price is not valid for CUSTOM subscriptions');
    const complimentary = source.activationSource === SubscriptionActivationSource.COMPLIMENTARY;
    const pricePerSeatMinor = billingModel === PlanBillingModel.PER_USER
      ? complimentary ? 0 : dto.pricePerSeatMinor === undefined ? (planChanged ? plan.monthlyPricePerSeatMinor : source.pricePerSeatMinor) : this.integer(dto.pricePerSeatMinor, 'Per-seat price', 0)
      : null;
    if (billingModel === PlanBillingModel.PER_USER && pricePerSeatMinor === null) throw new BadRequestException('PER_USER subscription requires a per-seat price');
    const customRecurringPriceMinor = billingModel === PlanBillingModel.CUSTOM
      ? complimentary ? 0 : dto.customRecurringPriceMinor === undefined ? (planChanged ? null : source.customRecurringPriceMinor) : this.integer(dto.customRecurringPriceMinor, 'Custom recurring price', 0)
      : null;
    if (billingModel === PlanBillingModel.CUSTOM && customRecurringPriceMinor === null) throw new BadRequestException('CUSTOM subscription requires a negotiated recurring price');
    const entitlementsSnapshot = billingModel === PlanBillingModel.CUSTOM
      ? this.entitlements(dto.entitlements ?? (planChanged ? plan.entitlements : source.entitlementsSnapshot))
      : planChanged ? [...plan.entitlements] : [...source.entitlementsSnapshot];
    const limitsSnapshot = this.limits(billingModel === PlanBillingModel.CUSTOM ? dto.limits ?? (planChanged ? plan.limits : source.limitsSnapshot) : planChanged ? plan.limits : source.limitsSnapshot);
    const data: Prisma.CompanySubscriptionUncheckedCreateInput = {
      companyId: source.companyId, planId: planChanged ? plan.id : source.planId, status: source.status,
      activationSource: source.activationSource, billingInterval: dto.billingInterval ?? source.billingInterval,
      planCodeSnapshot: planChanged ? plan.code : source.planCodeSnapshot, planNameSnapshot: planChanged ? plan.name : source.planNameSnapshot,
      billingModelSnapshot: billingModel, currency: planChanged ? this.currency(plan.currency) : source.currency,
      pricePerSeatMinor, customRecurringPriceMinor, seatQuantity, entitlementsSnapshot, limitsSnapshot,
      startsAt: source.startsAt, currentPeriodStart: source.currentPeriodStart, currentPeriodEnd: source.currentPeriodEnd,
      suspendedAt: source.status === SubscriptionStatus.SUSPENDED ? source.suspendedAt ?? new Date() : null,
    };
    const changedCategories: string[] = [];
    if (planChanged) changedCategories.push('plan');
    if (seatQuantity !== source.seatQuantity) changedCategories.push('seats');
    if (data.billingInterval !== source.billingInterval) changedCategories.push('billingInterval');
    if (pricePerSeatMinor !== source.pricePerSeatMinor || customRecurringPriceMinor !== source.customRecurringPriceMinor) changedCategories.push('price');
    if (!this.equalJson(entitlementsSnapshot, source.entitlementsSnapshot)) changedCategories.push('entitlements');
    if (!this.equalJson(limitsSnapshot, source.limitsSnapshot)) changedCategories.push('limits');
    return { data, changedCategories };
  }

  private async transition(id: string, from: SubscriptionStatus, to: SubscriptionStatus, action: string, actor: AuthenticatedUser, extra: (tx: Prisma.TransactionClient, current: CompanySubscription, now: Date) => Promise<Prisma.CompanySubscriptionUpdateInput>) {
    const current = await this.get(id);
    if (current.status !== from) throw new BadRequestException(`Cannot transition subscription from ${current.status} to ${to}`);
    return this.prisma.$transaction(async (tx) => {
      const data = await extra(tx, current, new Date());
      const updated = await tx.companySubscription.update({ where: { id }, data: { ...data, status: to }, include: detailInclude });
      await this.audit(tx, actor.id, current.companyId, id, action, { from, to });
      return updated;
    });
  }
  private async updateWithAudit(current: CompanySubscription, data: Prisma.CompanySubscriptionUpdateInput, action: string, actor: AuthenticatedUser) { return this.prisma.$transaction(async (tx) => { const updated = await tx.companySubscription.update({ where: { id: current.id }, data, include: detailInclude }); await this.audit(tx, actor.id, current.companyId, current.id, action, { from: current.status, to: updated.status }); return updated; }); }
  private async assertNoLive(tx: Prisma.TransactionClient, companyId: string, excludeId: string) { const live = await tx.companySubscription.findFirst({ where: { companyId, id: { not: excludeId }, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] } } }); if (live) throw new ConflictException('Company already has an active or suspended subscription'); }
  private async get(id: string) { const value = await this.prisma.companySubscription.findUnique({ where: { id } }); if (!value) throw new NotFoundException('Subscription not found'); return value; }
  private validateSeats(value: number, plan: Plan) { this.integer(value, 'Seat quantity', 1); if (plan.minSeats !== null && value < plan.minSeats) throw new BadRequestException(`Seat quantity must be at least ${plan.minSeats}`); if (plan.maxSeats !== null && value > plan.maxSeats) throw new BadRequestException(`Seat quantity cannot exceed ${plan.maxSeats}`); }
  private validatePeriod(start?: Date | null, end?: Date | null) { if (Boolean(start) !== Boolean(end)) throw new BadRequestException('Current period start and end must both be provided or both omitted'); if (start && end && start >= end) throw new BadRequestException('Current period start must be before current period end'); }
  private integer(value: unknown, field: string, min: number): number { if (!Number.isInteger(value) || (value as number) < min) throw new BadRequestException(`${field} must be an integer of at least ${min}`); return value as number; }
  private currency(value: unknown) { if (typeof value !== 'string' || value.toUpperCase() !== 'INR') throw new BadRequestException('Currency must be INR'); return 'INR'; }
  private entitlements(value: unknown): string[] { if (!Array.isArray(value) || value.some((key) => typeof key !== 'string' || !isAssignableEntitlement(key))) throw new BadRequestException(`Entitlements must be assignable, available catalog keys: ${CURRENT_ENTITLEMENTS.join(', ')}`); return [...new Set(value as string[])].sort(); }
  private limits(value: unknown): Prisma.InputJsonObject { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Limits must be an object'); const result: PlanLimits = {}; for (const [key, amount] of Object.entries(value)) { if (!(PLAN_LIMIT_KEYS as readonly string[]).includes(key)) throw new BadRequestException(`Unsupported plan limit: ${key}`); result[key as keyof PlanLimits] = this.integer(amount, `Limit ${key}`, 0); } return result; }
  private audit(tx: Prisma.TransactionClient, actorUserId: string, companyId: string, entityId: string, action: string, metadata: Prisma.InputJsonObject) { return tx.auditLog.create({ data: { actorUserId, companyId, action, entityType: 'CompanySubscription', entityId, metadata } }); }
  private equalJson(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
}
