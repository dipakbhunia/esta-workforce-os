import { BadRequestException, Injectable } from '@nestjs/common';
import { CompanyStatus, Prisma, SubscriptionStatus, TrialStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StorageUsageQueryService } from '../storage-usage/storage-usage-query.service';
import { StorageCapacityState } from '../storage-usage/storage-usage.types';
import { PlatformDashboardQueryDto } from './dto/platform-dashboard-query.dto';
import {
  AttentionResourceType, AttentionSeverity, AttentionType, CommercialState,
  DashboardGranularity, EffectiveSubscriptionStatus, PlatformDashboardResponseDto,
  TrialLifecycleStatus,
} from './dto/platform-dashboard-response.dto';

const DAY_MS = 86_400_000;
const SUBSCRIPTION_ORDER: EffectiveSubscriptionStatus[] = [
  'PENDING', 'ACTIVE', 'SUSPENDED', 'SUPERSEDED', 'CANCELLED', 'EXPIRED',
];
const TRIAL_ORDER: TrialLifecycleStatus[] = [
  'EFFECTIVE_ACTIVE', 'SCHEDULED', 'EXPIRED', 'CANCELLED', 'CONVERTED',
];
const ATTENTION_PRIORITY: Record<AttentionType, number> = {
  STORAGE_OVER_LIMIT: 1, COMPANY_SUSPENDED: 2, SUBSCRIPTION_ENDING_SOON: 3,
  TRIAL_ENDING_SOON: 4, STORAGE_AT_LIMIT: 5, STORAGE_UNMEASURABLE: 6,
  NO_COMMERCIAL_ACCESS: 7,
};

interface NormalizedRange {
  from: string; to: string; fromInclusive: Date; toExclusive: Date;
  granularity: DashboardGranularity;
}

interface GrowthRow { bucketStart: string; newCompanies: number; trialStarts: number }
interface PlanRow { planId: string; planCode: string; planName: string; subscriptionCount: number }
type AttentionItem = PlatformDashboardResponseDto['attention'][number];

@Injectable()
export class PlatformDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageUsage: StorageUsageQueryService,
  ) {}

  async getDashboard(
    query: PlatformDashboardQueryDto,
    requestedAsOf = new Date(),
  ): Promise<PlatformDashboardResponseDto> {
    const asOf = new Date(requestedAsOf);
    const range = normalizeRange(query, asOf);
    const sevenDays = new Date(asOf.getTime() + 7 * DAY_MS);
    const thirtyDays = new Date(asOf.getTime() + 30 * DAY_MS);
    const livePeriod = { OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: asOf } }] };
    const companyWhere = { deletedAt: null } as const;

    const [
      totalCompanies, effectiveActiveSubscriptions, effectiveActiveTrials, newCompanies,
      trialsEndingSoon, subscriptionsEndingSoon, subscriptionGroups, elapsedByStatus,
      trialGroups, overdueTrials, planDistribution, growth, recentBase,
      endingSubscriptions, endingTrials, suspendedCompanies, storage,
    ] = await Promise.all([
      this.prisma.company.count({ where: companyWhere }),
      this.prisma.companySubscription.count({ where: { status: SubscriptionStatus.ACTIVE, company: companyWhere, ...livePeriod } }),
      this.prisma.companyTrial.count({ where: { company: companyWhere, status: TrialStatus.ACTIVE, startsAt: { lte: asOf }, endsAt: { gt: asOf } } }),
      this.prisma.company.count({ where: { deletedAt: null, createdAt: { gte: range.fromInclusive, lt: range.toExclusive } } }),
      this.prisma.companyTrial.count({ where: { company: companyWhere, status: TrialStatus.ACTIVE, startsAt: { lte: asOf }, endsAt: { gt: asOf, lte: sevenDays } } }),
      this.prisma.companySubscription.count({ where: { company: companyWhere, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] }, currentPeriodEnd: { gt: asOf, lte: thirtyDays } } }),
      this.prisma.companySubscription.groupBy({ by: ['status'], where: { company: companyWhere }, _count: { _all: true } }),
      this.prisma.companySubscription.groupBy({ by: ['status'], where: { company: companyWhere, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] }, currentPeriodEnd: { lte: asOf } }, _count: { _all: true } }),
      this.prisma.companyTrial.groupBy({ by: ['status'], where: { company: companyWhere }, _count: { _all: true } }),
      this.prisma.companyTrial.count({ where: { company: companyWhere, status: TrialStatus.ACTIVE, endsAt: { lte: asOf } } }),
      this.getPlanDistribution(asOf),
      this.getGrowth(range),
      this.prisma.company.findMany({ where: companyWhere, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 6, select: { id: true, name: true, status: true, createdAt: true } }),
      this.prisma.companySubscription.findMany({ where: { status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] }, currentPeriodEnd: { gt: asOf, lte: thirtyDays }, company: companyWhere }, take: 20, orderBy: [{ currentPeriodEnd: 'asc' }, { company: { name: 'asc' } }, { companyId: 'asc' }, { id: 'asc' }], select: { id: true, companyId: true, currentPeriodEnd: true, company: { select: { name: true } } } }),
      this.prisma.companyTrial.findMany({ where: { status: TrialStatus.ACTIVE, startsAt: { lte: asOf }, endsAt: { gt: asOf, lte: sevenDays }, company: companyWhere }, take: 20, orderBy: [{ endsAt: 'asc' }, { company: { name: 'asc' } }, { companyId: 'asc' }, { id: 'asc' }], select: { id: true, companyId: true, endsAt: true, company: { select: { name: true } } } }),
      this.prisma.company.findMany({ where: { deletedAt: null, status: CompanyStatus.SUSPENDED }, take: 20, orderBy: [{ name: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }),
      this.storageUsage.getPlatformDashboardSnapshot(asOf, 5),
    ]);

    const recentCommercial = await this.getRecentCommercialState(recentBase.map((company) => company.id), asOf);
    const subscriptionCounts = new Map(subscriptionGroups.map((row) => [row.status, row._count._all]));
    let elapsedTotal = 0;
    for (const row of elapsedByStatus) {
      subscriptionCounts.set(row.status, (subscriptionCounts.get(row.status) ?? 0) - row._count._all);
      elapsedTotal += row._count._all;
    }
    subscriptionCounts.set(SubscriptionStatus.EXPIRED, (subscriptionCounts.get(SubscriptionStatus.EXPIRED) ?? 0) + elapsedTotal);

    const trialCounts = new Map(trialGroups.map((row) => [row.status, row._count._all]));
    const activeTotal = trialCounts.get(TrialStatus.ACTIVE) ?? 0;
    const scheduledTrials = await this.prisma.companyTrial.count({ where: { company: companyWhere, status: TrialStatus.ACTIVE, startsAt: { gt: asOf } } });
    const effectiveTrials = activeTotal - scheduledTrials - overdueTrials;

    const { attentionCandidates: storageAttention, ...storageResponse } = storage;
    const attention = this.buildAttention(
      storageAttention, suspendedCompanies, endingSubscriptions, endingTrials,
    );

    return {
      asOf: asOf.toISOString(),
      range: { from: range.from, to: range.to, timezone: 'UTC', granularity: range.granularity },
      kpis: { totalCompanies, effectiveActiveSubscriptions, effectiveActiveTrials, newCompanies, trialsEndingSoon, subscriptionsEndingSoon },
      growth,
      subscriptionDistribution: SUBSCRIPTION_ORDER.map((status) => ({ status, count: subscriptionCounts.get(status as SubscriptionStatus) ?? 0 })),
      planDistribution,
      trialDistribution: TRIAL_ORDER.map((status) => ({ status, count: status === 'EFFECTIVE_ACTIVE' ? effectiveTrials : status === 'SCHEDULED' ? scheduledTrials : status === 'EXPIRED' ? (trialCounts.get(TrialStatus.EXPIRED) ?? 0) + overdueTrials : trialCounts.get(status as TrialStatus) ?? 0 })),
      storage: storageResponse,
      attention,
      recentCompanies: recentBase.map((company) => {
        const commercial = recentCommercial.get(company.id) ?? { state: 'NONE' as CommercialState, id: null };
        return { id: company.id, name: company.name, status: company.status, createdAt: company.createdAt.toISOString(), commercialState: commercial.state, commercialReferenceId: commercial.id };
      }),
    };
  }

  private getGrowth(range: NormalizedRange) {
    const interval = range.granularity === 'DAILY' ? '1 day' : range.granularity === 'WEEKLY' ? '1 week' : '1 month';
    const bucket = range.granularity === 'DAILY' ? 'day' : range.granularity === 'WEEKLY' ? 'week' : 'month';
    return this.prisma.$queryRaw<GrowthRow[]>(Prisma.sql`
      WITH bounds AS (
        SELECT
          (${range.fromInclusive}::timestamptz AT TIME ZONE 'UTC') AS "fromUtc",
          (${range.toExclusive}::timestamptz AT TIME ZONE 'UTC') AS "toUtc"
      ), buckets AS (
        SELECT generate_series(
          date_trunc(${bucket}, bounds."fromUtc"),
          date_trunc(${bucket}, bounds."toUtc" - interval '1 millisecond'),
          ${interval}::interval
        ) AS bucket
        FROM bounds
      ), companies AS (
        SELECT date_trunc(${bucket}, company."createdAt") AS bucket, COUNT(*)::INTEGER AS count
        FROM "Company" company CROSS JOIN bounds
        WHERE company."deletedAt" IS NULL
          AND company."createdAt" >= bounds."fromUtc"
          AND company."createdAt" < bounds."toUtc"
        GROUP BY 1
      ), trials AS (
        SELECT date_trunc(${bucket}, trial."startsAt") AS bucket, COUNT(*)::INTEGER AS count
        FROM "CompanyTrial" trial
        JOIN "Company" company ON company."id" = trial."companyId"
        CROSS JOIN bounds
        WHERE company."deletedAt" IS NULL
          AND trial."startsAt" >= bounds."fromUtc"
          AND trial."startsAt" < bounds."toUtc"
        GROUP BY 1
      )
      SELECT to_char(buckets.bucket, 'YYYY-MM-DD') AS "bucketStart",
        COALESCE(companies.count, 0)::INTEGER AS "newCompanies",
        COALESCE(trials.count, 0)::INTEGER AS "trialStarts"
      FROM buckets LEFT JOIN companies USING (bucket) LEFT JOIN trials USING (bucket) ORDER BY buckets.bucket
    `);
  }

  private getPlanDistribution(asOf: Date) {
    return this.prisma.$queryRaw<PlanRow[]>(Prisma.sql`
      SELECT subscription."planId", subscription."planCodeSnapshot" AS "planCode", subscription."planNameSnapshot" AS "planName", COUNT(*)::INTEGER AS "subscriptionCount"
      FROM "CompanySubscription" subscription JOIN "Company" company ON company."id" = subscription."companyId"
      WHERE company."deletedAt" IS NULL AND subscription."status" IN ('ACTIVE', 'SUSPENDED') AND (subscription."currentPeriodEnd" IS NULL OR subscription."currentPeriodEnd" > ${asOf})
      GROUP BY subscription."planId", subscription."planCodeSnapshot", subscription."planNameSnapshot"
      ORDER BY COUNT(*) DESC, subscription."planNameSnapshot" ASC, subscription."planId" ASC
    `);
  }

  private async getRecentCommercialState(companyIds: string[], asOf: Date) {
    const result = new Map<string, { state: CommercialState; id: string | null }>();
    if (!companyIds.length) return result;
    const [trials, subscriptions] = await Promise.all([
      this.prisma.companyTrial.findMany({ where: { companyId: { in: companyIds }, status: TrialStatus.ACTIVE, startsAt: { lte: asOf }, endsAt: { gt: asOf } }, orderBy: [{ createdAt: 'desc' }], select: { id: true, companyId: true } }),
      this.prisma.companySubscription.findMany({ where: { companyId: { in: companyIds }, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: asOf } }] }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], select: { id: true, companyId: true, status: true } }),
    ]);
    for (const subscription of subscriptions) if (!result.has(subscription.companyId)) result.set(subscription.companyId, { state: subscription.status === SubscriptionStatus.ACTIVE ? 'ACTIVE_SUBSCRIPTION' : 'SUSPENDED_SUBSCRIPTION', id: subscription.id });
    for (const trial of trials) result.set(trial.companyId, { state: 'TRIAL', id: trial.id });
    return result;
  }

  private buildAttention(
    storage: Awaited<ReturnType<StorageUsageQueryService['getPlatformDashboardSnapshot']>>['attentionCandidates'],
    suspended: Array<{ id: string; name: string }>,
    subscriptions: Array<{ id: string; companyId: string; currentPeriodEnd: Date | null; company: { name: string } }>,
    trials: Array<{ id: string; companyId: string; endsAt: Date; company: { name: string } }>,
  ): AttentionItem[] {
    const items: AttentionItem[] = [];
    const add = (type: AttentionType, severity: AttentionSeverity, companyId: string, companyName: string, resourceType: AttentionResourceType, resourceId: string, relevantAt: Date | null, metricValue: string | null, metricUnit: 'BYTES' | null) =>
      items.push({ id: `${type}:${resourceId}`, type, severity, companyId, companyName, resourceType, resourceId, relevantAt: relevantAt?.toISOString() ?? null, metricValue, metricUnit });
    for (const row of storage) {
      const mapping = row.capacityState === StorageCapacityState.OVER_LIMIT ? ['STORAGE_OVER_LIMIT', 'CRITICAL'] as const
        : row.capacityState === StorageCapacityState.AT_LIMIT ? ['STORAGE_AT_LIMIT', 'WARNING'] as const
        : row.capacityState === StorageCapacityState.UNMEASURABLE ? ['STORAGE_UNMEASURABLE', 'WARNING'] as const
        : ['NO_COMMERCIAL_ACCESS', 'INFO'] as const;
      const measurable = row.capacityState !== StorageCapacityState.NO_ACCESS && row.capacityState !== StorageCapacityState.UNMEASURABLE;
      add(mapping[0], mapping[1], row.companyId, row.companyName, 'STORAGE', row.companyId, null, measurable ? row.measuredStorageBytes : null, measurable ? 'BYTES' : null);
    }
    for (const row of suspended) add('COMPANY_SUSPENDED', 'CRITICAL', row.id, row.name, 'COMPANY', row.id, null, null, null);
    for (const row of subscriptions) add('SUBSCRIPTION_ENDING_SOON', 'WARNING', row.companyId, row.company.name, 'SUBSCRIPTION', row.id, row.currentPeriodEnd, null, null);
    for (const row of trials) add('TRIAL_ENDING_SOON', 'WARNING', row.companyId, row.company.name, 'TRIAL', row.id, row.endsAt, null, null);
    return items.sort((a, b) => ATTENTION_PRIORITY[a.type] - ATTENTION_PRIORITY[b.type]
      || compareNullableDates(a.relevantAt, b.relevantAt) || a.companyName.localeCompare(b.companyName)
      || a.companyId.localeCompare(b.companyId) || a.resourceId.localeCompare(b.resourceId)).slice(0, 10);
  }
}

export function normalizeRange(query: PlatformDashboardQueryDto, asOf: Date): NormalizedRange {
  if ((query.from && !query.to) || (!query.from && query.to)) throw new BadRequestException('from and to must be provided together');
  const today = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  const from = query.from ?? isoDay(new Date(today.getTime() - 29 * DAY_MS));
  const to = query.to ?? isoDay(today);
  const fromInclusive = parseUtcDay(from);
  const toInclusive = parseUtcDay(to);
  if (fromInclusive > toInclusive) throw new BadRequestException('from must not be after to');
  if (toInclusive > today) throw new BadRequestException('to must not be in the future');
  const days = Math.round((toInclusive.getTime() - fromInclusive.getTime()) / DAY_MS) + 1;
  if (days > 366) throw new BadRequestException('date range cannot exceed 366 days');
  return { from, to, fromInclusive, toExclusive: new Date(toInclusive.getTime() + DAY_MS), granularity: days <= 45 ? 'DAILY' : days <= 180 ? 'WEEKLY' : 'MONTHLY' };
}

function parseUtcDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('dates must use YYYY-MM-DD');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new BadRequestException('invalid calendar date');
  return date;
}

function isoDay(date: Date) { return date.toISOString().slice(0, 10); }
function compareNullableDates(a: string | null, b: string | null) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}
