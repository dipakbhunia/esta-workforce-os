import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Plan, PlanBillingModel, PlanStatus, Prisma } from '@prisma/client';
import { PaginatedResult } from '../../common/interfaces/paginated-result.interface';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreatePlanDto, PlanQueryDto, UpdatePlanDto } from './dto/plan.dto';
import { PlanResponseDto } from './dto/plan-response.dto';
import { CURRENT_ENTITLEMENTS, ENTITLEMENT_CATALOG, PLAN_LIMIT_KEYS, PlanLimits, isAssignableEntitlement } from './plan-catalog.registry';

const transitions: Record<PlanStatus, readonly PlanStatus[]> = {
  DRAFT: [PlanStatus.ACTIVE, PlanStatus.ARCHIVED],
  ACTIVE: [PlanStatus.INACTIVE, PlanStatus.ARCHIVED],
  INACTIVE: [PlanStatus.ACTIVE, PlanStatus.ARCHIVED],
  ARCHIVED: [],
};

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  entitlementCatalog() {
    return ENTITLEMENT_CATALOG.map(({ key, name, group, description, availability, assignable, trialEligible, sortOrder }) => ({ key, name, group, description, availability, assignable, trialEligible, sortOrder }));
  }

  async create(dto: CreatePlanDto, actor: AuthenticatedUser): Promise<PlanResponseDto> {
    const data = this.createData(dto);
    try {
      const plan = await this.prisma.$transaction(async (tx) => {
        const created = await tx.plan.create({ data });
        await this.audit(tx, actor.id, created.id, 'PLAN_CREATED', { code: created.code });
        return created;
      });
      return this.toResponse(plan);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Plan code already exists');
      }
      throw error;
    }
  }

  async findAll(query: PlanQueryDto): Promise<PaginatedResult<PlanResponseDto>> {
    const where: Prisma.PlanWhereInput = {
      ...(query.search ? { OR: [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { code: { contains: query.search.trim(), mode: 'insensitive' } },
      ] } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.isPublic !== undefined ? { isPublic: query.isPublic } : {}),
    };
    const [plans, total] = await this.prisma.$transaction([
      this.prisma.plan.findMany({ where, ...paginationArgs(query), orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.plan.count({ where }),
    ]);
    return paginatedResult(plans.map((plan) => this.toResponse(plan)), total, query);
  }

  async findOne(id: string): Promise<PlanResponseDto> {
    const plan = await this.getPlan(id);
    return this.toResponse(plan);
  }

  async update(id: string, dto: UpdatePlanDto, actor: AuthenticatedUser): Promise<PlanResponseDto> {
    const current = await this.getPlan(id);
    if (dto.code !== undefined && (typeof dto.code !== 'string' || dto.code.trim().toUpperCase() !== current.code)) {
      throw new BadRequestException('Plan code is immutable');
    }
    if (current.status === PlanStatus.ARCHIVED) throw new BadRequestException('Archived plans cannot be edited');
    const data = this.updateData(dto, current);
    const changed = Object.keys(data);
    if (!changed.length) throw new BadRequestException('No plan changes were provided');

    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({ where: { id }, data });
      await this.audit(tx, actor.id, id, 'PLAN_UPDATED', { changedFields: changed });
      if (data.monthlyPricePerSeatMinor !== undefined && data.monthlyPricePerSeatMinor !== current.monthlyPricePerSeatMinor) await this.audit(tx, actor.id, id, 'PLAN_PRICE_CHANGED', { from: current.monthlyPricePerSeatMinor, to: data.monthlyPricePerSeatMinor });
      if (data.entitlements !== undefined && !this.equalJson(current.entitlements, data.entitlements)) await this.audit(tx, actor.id, id, 'PLAN_ENTITLEMENTS_CHANGED', { from: current.entitlements, to: data.entitlements });
      if (data.limits !== undefined && !this.equalJson(current.limits, data.limits)) await this.audit(tx, actor.id, id, 'PLAN_LIMITS_CHANGED', { from: JSON.stringify(current.limits), to: JSON.stringify(data.limits) });
      return plan;
    });
    return this.toResponse(updated);
  }

  async updateStatus(id: string, status: PlanStatus, actor: AuthenticatedUser): Promise<PlanResponseDto> {
    const current = await this.getPlan(id);
    if (!status || !Object.values(PlanStatus).includes(status)) throw new BadRequestException('Plan status is invalid');
    if (status === current.status) throw new BadRequestException('Plan is already in the requested status');
    if (!transitions[current.status].includes(status)) throw new BadRequestException(`Cannot transition plan from ${current.status} to ${status}`);
    const action = status === PlanStatus.ACTIVE ? 'PLAN_ACTIVATED' : status === PlanStatus.INACTIVE ? 'PLAN_DEACTIVATED' : 'PLAN_ARCHIVED';
    const updated = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({ where: { id }, data: { status, archivedAt: status === PlanStatus.ARCHIVED ? new Date() : null } });
      await this.audit(tx, actor.id, id, action, { from: current.status, to: status });
      return plan;
    });
    return this.toResponse(updated);
  }

  private createData(dto: CreatePlanDto): Prisma.PlanCreateInput {
    const billingModel = this.billingModel(dto.billingModel);
    const seats = this.seats(dto.minSeats, dto.maxSeats);
    return {
      code: this.required(dto.code, 'Plan code').toUpperCase(),
      name: this.required(dto.name, 'Plan name'),
      description: this.optionalText(dto.description),
      billingModel,
      monthlyPricePerSeatMinor: this.price(billingModel, dto.monthlyPricePerSeatMinor),
      currency: this.currency(dto.currency),
      ...seats,
      sortOrder: this.integer(dto.sortOrder ?? 0, 'Sort order', 0),
      isPublic: dto.isPublic ?? false,
      isRecommended: dto.isRecommended ?? false,
      entitlements: this.entitlements(dto.entitlements ?? []),
      limits: this.limits(dto.limits ?? {}),
    };
  }

  private updateData(dto: UpdatePlanDto, current: Plan): Prisma.PlanUpdateInput {
    const billingModel = dto.billingModel === undefined ? current.billingModel : this.billingModel(dto.billingModel);
    const minSeats = dto.minSeats === undefined ? current.minSeats : dto.minSeats;
    const maxSeats = dto.maxSeats === undefined ? current.maxSeats : dto.maxSeats;
    const seats = this.seats(minSeats, maxSeats);
    const data: Prisma.PlanUpdateInput = {
      ...(dto.name !== undefined ? { name: this.required(dto.name, 'Plan name') } : {}),
      ...(dto.description !== undefined ? { description: this.optionalText(dto.description) } : {}),
      ...(dto.billingModel !== undefined ? { billingModel } : {}),
      ...(dto.billingModel !== undefined || dto.monthlyPricePerSeatMinor !== undefined ? { monthlyPricePerSeatMinor: this.price(billingModel, dto.monthlyPricePerSeatMinor === undefined ? current.monthlyPricePerSeatMinor : dto.monthlyPricePerSeatMinor) } : {}),
      ...(dto.currency !== undefined ? { currency: this.currency(dto.currency) } : {}),
      ...(dto.minSeats !== undefined ? { minSeats: seats.minSeats } : {}),
      ...(dto.maxSeats !== undefined ? { maxSeats: seats.maxSeats } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: this.integer(dto.sortOrder, 'Sort order', 0) } : {}),
      ...(dto.isPublic !== undefined ? { isPublic: this.boolean(dto.isPublic, 'Public visibility') } : {}),
      ...(dto.isRecommended !== undefined ? { isRecommended: this.boolean(dto.isRecommended, 'Recommended state') } : {}),
      ...(dto.entitlements !== undefined ? { entitlements: this.entitlements(dto.entitlements) } : {}),
      ...(dto.limits !== undefined ? { limits: this.limits(dto.limits) } : {}),
    };
    return data;
  }

  private required(value: unknown, field: string): string { if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} is required`); return value.trim(); }
  private optionalText(value: unknown): string | null { if (value === null || value === undefined || value === '') return null; if (typeof value !== 'string') throw new BadRequestException('Description is invalid'); return value.trim() || null; }
  private currency(value: unknown): string { const normalized = this.required(value, 'Currency').toUpperCase(); if (normalized !== 'INR') throw new BadRequestException('Currency must be a supported ISO 4217 code (INR is currently supported)'); return normalized; }
  private billingModel(value: unknown): PlanBillingModel { if (!value || !Object.values(PlanBillingModel).includes(value as PlanBillingModel)) throw new BadRequestException('Billing model is invalid'); return value as PlanBillingModel; }
  private integer(value: unknown, field: string, minimum: number): number { if (!Number.isInteger(value) || (value as number) < minimum) throw new BadRequestException(`${field} must be an integer of at least ${minimum}`); return value as number; }
  private boolean(value: unknown, field: string): boolean { if (typeof value !== 'boolean') throw new BadRequestException(`${field} is invalid`); return value; }
  private price(model: PlanBillingModel, value: unknown): number | null { if (model === PlanBillingModel.CUSTOM && (value === null || value === undefined)) return null; if (value === null || value === undefined) throw new BadRequestException('Monthly per-user price is required for PER_USER plans'); return this.integer(value, 'Monthly per-user price', 0); }
  private seats(min: unknown, max: unknown): { minSeats: number | null; maxSeats: number | null } { const minSeats = min === null || min === undefined ? null : this.integer(min, 'Minimum seats', 0); const maxSeats = max === null || max === undefined ? null : this.integer(max, 'Maximum seats', 0); if (minSeats !== null && maxSeats !== null && minSeats > maxSeats) throw new BadRequestException('Minimum seats cannot exceed maximum seats'); return { minSeats, maxSeats }; }
  private entitlements(value: unknown): string[] { if (!Array.isArray(value) || value.some((key) => typeof key !== 'string' || !isAssignableEntitlement(key))) throw new BadRequestException(`Entitlements must be assignable, available catalog keys: ${CURRENT_ENTITLEMENTS.join(', ')}`); return [...new Set(value as string[])].sort(); }
  private limits(value: unknown): Prisma.InputJsonObject { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Limits must be an object'); const result: PlanLimits = {}; for (const [key, amount] of Object.entries(value)) { if (!(PLAN_LIMIT_KEYS as readonly string[]).includes(key)) throw new BadRequestException(`Unsupported plan limit: ${key}`); result[key as keyof PlanLimits] = this.integer(amount, `Limit ${key}`, 0); } return result; }
  private async getPlan(id: string): Promise<Plan> { const plan = await this.prisma.plan.findUnique({ where: { id } }); if (!plan) throw new NotFoundException('Plan not found'); return plan; }
  private audit(tx: Prisma.TransactionClient, actorUserId: string, entityId: string, action: string, metadata: Prisma.InputJsonObject) { return tx.auditLog.create({ data: { actorUserId, action, entityType: 'Plan', entityId, metadata } }); }
  private equalJson(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
  private toResponse(plan: Plan): PlanResponseDto { return { ...plan, limits: plan.limits as Record<string, number> }; }
}
