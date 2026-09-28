import { Inject, Injectable, Optional } from '@nestjs/common';
import { PaymentPurpose, PaymentStatus, Prisma, SubscriptionRenewalStatus, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { mapDunningDetails, mapDunningListItem, platformDunningDetailSelect, platformDunningListSelect } from './platform-dunning.mapper';
import { DunningIntegrityError, DunningNotFoundError, PlatformDunningQuery } from './platform-dunning.types';

export const DUNNING_CLOCK = Symbol('DUNNING_CLOCK');
export type DunningClock = () => Date;
const OPEN_PAYMENT_STATUSES = [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED, PaymentStatus.FAILED];
const OPEN_SUBSCRIPTION_STATUSES = [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED, SubscriptionStatus.EXPIRED];

@Injectable()
export class PlatformDunningService {
  constructor(private readonly prisma: PrismaService,
    @Optional() @Inject(DUNNING_CLOCK) private readonly clock: DunningClock = () => new Date()) {}

  async findAll(input: PlatformDunningQuery = {}) {
    const evaluationTime = this.clock();
    const query = normalizeQuery(input);
    const where = activeWhere(query, evaluationTime);
    const [rows, total, incoherent] = await this.prisma.$transaction(async tx => Promise.all([
      tx.subscriptionRenewal.findMany({ where, orderBy: [{ cycleStart: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.limit, take: query.limit, select: platformDunningListSelect }),
      tx.subscriptionRenewal.count({ where }),
      tx.subscriptionRenewal.findFirst({ where: { ...dueScope(query, evaluationTime), status: SubscriptionRenewalStatus.PREPARED,
        ...(query.paymentStatus && { payment: { status: query.paymentStatus } }),
        subscription: { status: SubscriptionStatus.PENDING } }, select: { id: true } }),
    ]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    if (incoherent) throw new DunningIntegrityError('PENDING_SUBSCRIPTION_LINEAGE');
    const data = rows.map(row => mapDunningListItem(row, evaluationTime));
    if (data.some(row => !row.active)) throw new DunningIntegrityError('ACTIVE_QUERY_RETURNED_NON_OPEN_ROW');
    return { evaluationTime: evaluationTime.toISOString(), data, meta: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) } };
  }

  async findOne(renewalId: string) {
    if (!renewalId) throw new DunningIntegrityError('MISSING_RENEWAL_ID');
    const evaluationTime = this.clock();
    const row = await this.prisma.subscriptionRenewal.findUnique({ where: { id: renewalId }, select: platformDunningDetailSelect });
    if (!row) throw new DunningNotFoundError();
    return mapDunningDetails(row, evaluationTime);
  }
}

function normalizeQuery(input: PlatformDunningQuery) {
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new DunningIntegrityError('INVALID_PAGINATION');
  if ((input.from && !input.to) || (!input.from && input.to) || (input.from && input.to && input.from >= input.to)) throw new DunningIntegrityError('INVALID_DATE_RANGE');
  if (input.paymentStatus && !(OPEN_PAYMENT_STATUSES as PaymentStatus[]).includes(input.paymentStatus)) throw new DunningIntegrityError('INVALID_PAYMENT_STATUS_FILTER');
  return { ...input, page, limit };
}

function activeWhere(query: ReturnType<typeof normalizeQuery>, evaluationTime: Date): Prisma.SubscriptionRenewalWhereInput {
  return { ...dueScope(query, evaluationTime), status: SubscriptionRenewalStatus.PREPARED,
    payment: { purpose: PaymentPurpose.SUBSCRIPTION_RENEWAL, status: query.paymentStatus ?? { in: OPEN_PAYMENT_STATUSES } },
    subscription: { status: { in: OPEN_SUBSCRIPTION_STATUSES } },
  };
}

function dueScope(query: ReturnType<typeof normalizeQuery>, evaluationTime: Date): Prisma.SubscriptionRenewalWhereInput {
  const cycleStart: Prisma.DateTimeFilter = { lte: evaluationTime };
  if (query.from && query.to) { cycleStart.gte = query.from; cycleStart.lt = query.to; }
  return { cycleStart,
    ...(query.companyId && { companyId: query.companyId }), ...(query.subscriptionId && { subscriptionId: query.subscriptionId }),
    ...(query.renewalId && { id: query.renewalId }), ...(query.paymentId && { paymentId: query.paymentId }),
  };
}
