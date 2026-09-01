import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginatedResult } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { StorageUsageQueryDto } from './dto/storage-usage-query.dto';
import { StorageUsageService } from './storage-usage.service';
import {
  PlatformStorageDashboardSnapshot,
  StorageCapacityState,
  StorageUsageMetrics,
  StorageUsageRecord,
} from './storage-usage.types';

interface PlatformStorageAggregate {
  measuredStorageBytes: string;
  configuredAllocationBytes: string;
  measuredObjectCount: number;
  unmeasuredObjectCount: number;
  companiesWithConfiguredLimit: number;
  companiesWithoutConfiguredLimit: number;
  companiesAtLimit: number;
  companiesOverLimit: number;
}

interface CapacityDistributionRow {
  state: StorageCapacityState;
  companyCount: number;
}

interface HighUsageRow {
  companyId: string;
  companyName: string;
  measuredStorageBytes: string;
  configuredLimitBytes: string;
  utilizationPercent: string;
  capacityState: StorageCapacityState.AVAILABLE | StorageCapacityState.AT_LIMIT | StorageCapacityState.OVER_LIMIT;
}

interface StorageAttentionRow {
  companyId: string;
  companyName: string;
  referenceId: string | null;
  capacityState: StorageCapacityState.AT_LIMIT | StorageCapacityState.OVER_LIMIT | StorageCapacityState.UNMEASURABLE | StorageCapacityState.NO_ACCESS;
  measuredStorageBytes: string;
}

interface StorageUsageAggregate {
  total: number;
  totalMeasuredStorageBytes: string;
  measuredScreenshotObjects: number;
  unmeasuredScreenshotObjects: number;
  companiesWithMeasuredStorage: number;
  companiesWithUnmeasurableStorage: number;
  companiesWithConfiguredLimit: number;
  companiesWithoutConfiguredLimit: number;
  companiesAtLimit: number;
  companiesOverLimit: number;
  effectiveTrialCount: number;
  activeSubscriptionCount: number;
  suspendedSubscriptionCount: number;
  noAccessCount: number;
}

@Injectable()
export class StorageUsageQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageUsage: StorageUsageService,
  ) {}

  async findAll(query: StorageUsageQueryDto) {
    const calculatedAt = new Date();
    const cte = this.storageCte(calculatedAt);
    const filters = this.filters(query);
    const offset = (query.page - 1) * query.limit;

    const [rows, aggregates] = await this.prisma.$transaction([
      this.prisma.$queryRaw<StorageUsageRecord[]>(Prisma.sql`
        ${cte}
        SELECT ${this.reportColumns()}
        FROM "derived_storage"
        WHERE ${filters}
        ORDER BY "companyName" ASC, "companyId" ASC
        OFFSET ${offset}
        LIMIT ${query.limit}
      `),
      this.prisma.$queryRaw<StorageUsageAggregate[]>(Prisma.sql`
        ${cte}
        SELECT
          COUNT(*)::INTEGER AS "total",
          COALESCE(SUM("measuredStorageBytesNumeric"), 0)::TEXT AS "totalMeasuredStorageBytes",
          COALESCE(SUM("measuredObjectCount"), 0)::INTEGER AS "measuredScreenshotObjects",
          COALESCE(SUM("unmeasuredObjectCount"), 0)::INTEGER AS "unmeasuredScreenshotObjects",
          COUNT(*) FILTER (WHERE "measuredObjectCount" > 0)::INTEGER AS "companiesWithMeasuredStorage",
          COUNT(*) FILTER (WHERE "measurementState" = 'UNMEASURABLE')::INTEGER AS "companiesWithUnmeasurableStorage",
          COUNT(*) FILTER (WHERE "configuredLimitBytesNumeric" IS NOT NULL)::INTEGER AS "companiesWithConfiguredLimit",
          COUNT(*) FILTER (WHERE "source" <> 'NONE' AND "configuredLimitBytesNumeric" IS NULL)::INTEGER AS "companiesWithoutConfiguredLimit",
          COUNT(*) FILTER (WHERE "capacityState" = 'AT_LIMIT')::INTEGER AS "companiesAtLimit",
          COUNT(*) FILTER (WHERE "capacityState" = 'OVER_LIMIT')::INTEGER AS "companiesOverLimit",
          COUNT(*) FILTER (WHERE "source" = 'TRIAL')::INTEGER AS "effectiveTrialCount",
          COUNT(*) FILTER (WHERE "source" = 'SUBSCRIPTION' AND "commercialStatus" = 'ACTIVE')::INTEGER AS "activeSubscriptionCount",
          COUNT(*) FILTER (WHERE "source" = 'SUBSCRIPTION' AND "commercialStatus" = 'SUSPENDED')::INTEGER AS "suspendedSubscriptionCount",
          COUNT(*) FILTER (WHERE "source" = 'NONE')::INTEGER AS "noAccessCount"
        FROM "derived_storage"
        WHERE ${filters}
      `),
    ]);

    const aggregate = aggregates[0] ?? this.emptyAggregate();
    const hasFilters = Boolean(
      query.search?.trim() ||
        query.source ||
        query.commercialStatus ||
        query.capacityState ||
        query.planId ||
        query.limitConfigured !== undefined ||
        query.overLimit !== undefined,
    );

    return {
      ...paginatedResult(
        rows.map((row) =>
          this.storageUsage.toCompanySummary(row, calculatedAt),
        ),
        aggregate.total,
        query,
      ),
      summary: {
        scope: hasFilters ? 'FILTERED' : 'ALL_COMPANIES',
        totalMeasuredStorageBytes: aggregate.totalMeasuredStorageBytes,
        measuredScreenshotObjects: aggregate.measuredScreenshotObjects,
        unmeasuredScreenshotObjects: aggregate.unmeasuredScreenshotObjects,
        companiesWithMeasuredStorage: aggregate.companiesWithMeasuredStorage,
        companiesWithUnmeasurableStorage:
          aggregate.companiesWithUnmeasurableStorage,
        companiesWithConfiguredLimit: aggregate.companiesWithConfiguredLimit,
        companiesWithoutConfiguredLimit:
          aggregate.companiesWithoutConfiguredLimit,
        companiesAtLimit: aggregate.companiesAtLimit,
        companiesOverLimit: aggregate.companiesOverLimit,
        effectiveTrialCount: aggregate.effectiveTrialCount,
        activeSubscriptionCount: aggregate.activeSubscriptionCount,
        suspendedSubscriptionCount: aggregate.suspendedSubscriptionCount,
        noAccessCount: aggregate.noAccessCount,
      } satisfies StorageUsageMetrics,
      calculatedAt: calculatedAt.toISOString(),
    };
  }

  async findCompany(companyId: string) {
    const calculatedAt = new Date();
    const rows = await this.prisma.$queryRaw<StorageUsageRecord[]>(Prisma.sql`
      ${this.storageCte(calculatedAt)}
      SELECT ${this.reportColumns()}
      FROM "derived_storage"
      WHERE "companyId" = ${companyId}::uuid
      LIMIT 1
    `);
    const record = rows[0];
    if (!record) throw new NotFoundException('Company not found');
    return this.storageUsage.toCompanySummary(record, calculatedAt);
  }

  async getPlatformDashboardSnapshot(
    asOf: Date,
    highUsageLimit: number,
  ): Promise<PlatformStorageDashboardSnapshot> {
    const cte = this.storageCte(asOf);
    const capacityStates = Object.values(StorageCapacityState);
    const [aggregateRows, distributionRows, highUsageCompanies, attentionCandidates] =
      await this.prisma.$transaction([
        this.prisma.$queryRaw<PlatformStorageAggregate[]>(Prisma.sql`
          ${cte}
          SELECT
            COALESCE(SUM("measuredStorageBytesNumeric"), 0)::TEXT AS "measuredStorageBytes",
            COALESCE(SUM("configuredLimitBytesNumeric"), 0)::TEXT AS "configuredAllocationBytes",
            COALESCE(SUM("measuredObjectCount"), 0)::INTEGER AS "measuredObjectCount",
            COALESCE(SUM("unmeasuredObjectCount"), 0)::INTEGER AS "unmeasuredObjectCount",
            COUNT(*) FILTER (WHERE "configuredLimitBytesNumeric" IS NOT NULL)::INTEGER AS "companiesWithConfiguredLimit",
            COUNT(*) FILTER (WHERE "source" <> 'NONE' AND "configuredLimitBytesNumeric" IS NULL)::INTEGER AS "companiesWithoutConfiguredLimit",
            COUNT(*) FILTER (WHERE "capacityState" = 'AT_LIMIT')::INTEGER AS "companiesAtLimit",
            COUNT(*) FILTER (WHERE "capacityState" = 'OVER_LIMIT')::INTEGER AS "companiesOverLimit"
          FROM "derived_storage"
        `),
        this.prisma.$queryRaw<CapacityDistributionRow[]>(Prisma.sql`
          ${cte}
          SELECT "capacityState" AS "state", COUNT(*)::INTEGER AS "companyCount"
          FROM "derived_storage"
          GROUP BY "capacityState"
        `),
        this.prisma.$queryRaw<HighUsageRow[]>(Prisma.sql`
          ${cte}
          SELECT
            "companyId", "companyName",
            "measuredStorageBytesNumeric"::TEXT AS "measuredStorageBytes",
            "configuredLimitBytesNumeric"::TEXT AS "configuredLimitBytes",
            ROUND(("measuredStorageBytesNumeric" * 100) / "configuredLimitBytesNumeric", 2)::TEXT AS "utilizationPercent",
            "capacityState"
          FROM "derived_storage"
          WHERE "source" <> 'NONE'
            AND "configuredLimitBytesNumeric" > 0
            AND "unmeasuredObjectCount" = 0
          ORDER BY
            ("measuredStorageBytesNumeric" / "configuredLimitBytesNumeric") DESC,
            "measuredStorageBytesNumeric" DESC,
            "companyName" ASC,
            "companyId" ASC
          LIMIT ${highUsageLimit}
        `),
        this.prisma.$queryRaw<StorageAttentionRow[]>(Prisma.sql`
          ${cte}
          SELECT "companyId", "companyName", "referenceId", "capacityState",
            "measuredStorageBytesNumeric"::TEXT AS "measuredStorageBytes"
          FROM "derived_storage"
          WHERE "capacityState" IN ('OVER_LIMIT', 'AT_LIMIT', 'UNMEASURABLE', 'NO_ACCESS')
          ORDER BY CASE "capacityState"
            WHEN 'OVER_LIMIT' THEN 1 WHEN 'AT_LIMIT' THEN 2
            WHEN 'UNMEASURABLE' THEN 3 ELSE 4 END,
            "companyName" ASC, "companyId" ASC
          LIMIT 40
        `),
      ]);
    const aggregate = aggregateRows[0] ?? {
      measuredStorageBytes: '0', configuredAllocationBytes: '0', measuredObjectCount: 0,
      unmeasuredObjectCount: 0, companiesWithConfiguredLimit: 0,
      companiesWithoutConfiguredLimit: 0, companiesAtLimit: 0, companiesOverLimit: 0,
    };
    const distribution = new Map(distributionRows.map((row) => [row.state, row.companyCount]));
    const measurementCoverage = aggregate.measuredObjectCount === 0
      ? aggregate.unmeasuredObjectCount === 0 ? 'NO_OBJECTS' : 'UNMEASURABLE'
      : aggregate.unmeasuredObjectCount === 0 ? 'COMPLETE' : 'PARTIAL';
    return {
      ...aggregate,
      measurementCoverage,
      capacityDistribution: capacityStates.map((state) => ({
        state,
        companyCount: distribution.get(state) ?? 0,
      })),
      highUsageCompanies,
      attentionCandidates,
    };
  }

  private storageCte(now: Date): Prisma.Sql {
    return Prisma.sql`
      WITH "screenshot_usage" AS (
        SELECT
          screenshot."companyId",
          COALESCE(
            SUM(screenshot."sizeBytes") FILTER (
              WHERE screenshot."sizeBytes" IS NOT NULL
            ),
            0
          )::NUMERIC AS "measuredStorageBytesNumeric",
          COUNT(*) FILTER (
            WHERE screenshot."sizeBytes" IS NOT NULL
          )::INTEGER AS "measuredObjectCount",
          COUNT(*) FILTER (
            WHERE screenshot."sizeBytes" IS NULL
          )::INTEGER AS "unmeasuredObjectCount",
          MIN(screenshot."capturedAt") AS "earliestScreenshotAt",
          MAX(screenshot."capturedAt") AS "latestScreenshotAt"
        FROM "Screenshot" screenshot
        WHERE screenshot."deletedAt" IS NULL
        GROUP BY screenshot."companyId"
      ),
      "effective_trial" AS (
        SELECT DISTINCT ON (trial."companyId")
          trial."id",
          trial."companyId",
          trial."status"::TEXT AS "status",
          trial."limitsSnapshot",
          trial."createdAt"
        FROM "CompanyTrial" trial
        WHERE
          trial."status" = 'ACTIVE'
          AND trial."startsAt" <= ${now}
          AND trial."endsAt" > ${now}
        ORDER BY trial."companyId", trial."createdAt" DESC
      ),
      "live_subscription" AS (
        SELECT DISTINCT ON (subscription."companyId")
          subscription."id",
          subscription."companyId",
          subscription."status"::TEXT AS "status",
          subscription."planId",
          subscription."planCodeSnapshot",
          subscription."planNameSnapshot",
          subscription."limitsSnapshot",
          subscription."createdAt"
        FROM "CompanySubscription" subscription
        WHERE subscription."status" IN ('ACTIVE', 'SUSPENDED')
          AND (subscription."currentPeriodEnd" IS NULL OR subscription."currentPeriodEnd" > ${now})
        ORDER BY
          subscription."companyId",
          (subscription."status" = 'ACTIVE') DESC,
          subscription."createdAt" DESC
      ),
      "commercial_storage" AS (
        SELECT
          company."id" AS "companyId",
          company."name" AS "companyName",
          company."slug" AS "companySlug",
          company."status"::TEXT AS "companyStatus",
          CASE
            WHEN trial."id" IS NOT NULL THEN 'TRIAL'
            WHEN subscription."id" IS NOT NULL THEN 'SUBSCRIPTION'
            ELSE 'NONE'
          END AS "source",
          COALESCE(trial."id", subscription."id") AS "referenceId",
          CASE
            WHEN trial."id" IS NOT NULL THEN trial."status"
            ELSE subscription."status"
          END AS "commercialStatus",
          CASE WHEN trial."id" IS NULL THEN subscription."planId" ELSE NULL END AS "planId",
          CASE WHEN trial."id" IS NULL THEN subscription."planCodeSnapshot" ELSE NULL END AS "planCode",
          CASE WHEN trial."id" IS NULL THEN subscription."planNameSnapshot" ELSE NULL END AS "planName",
          CASE
            WHEN trial."id" IS NOT NULL THEN trial."limitsSnapshot"
            WHEN subscription."id" IS NOT NULL THEN subscription."limitsSnapshot"
            ELSE '{}'::JSONB
          END AS "effectiveLimits",
          CASE
            WHEN trial."id" IS NOT NULL THEN TRUE
            WHEN subscription."status" = 'ACTIVE' THEN TRUE
            ELSE FALSE
          END AS "allocationAllowed",
          COALESCE(usage."measuredStorageBytesNumeric", 0)::NUMERIC AS "measuredStorageBytesNumeric",
          COALESCE(usage."measuredObjectCount", 0)::INTEGER AS "measuredObjectCount",
          COALESCE(usage."unmeasuredObjectCount", 0)::INTEGER AS "unmeasuredObjectCount",
          usage."earliestScreenshotAt",
          usage."latestScreenshotAt"
        FROM "Company" company
        LEFT JOIN "effective_trial" trial
          ON trial."companyId" = company."id"
        LEFT JOIN "live_subscription" subscription
          ON subscription."companyId" = company."id"
        LEFT JOIN "screenshot_usage" usage
          ON usage."companyId" = company."id"
        WHERE company."deletedAt" IS NULL
      ),
      "normalized_storage" AS (
        SELECT
          *,
          CASE
            WHEN
              "source" <> 'NONE'
              AND JSONB_TYPEOF("effectiveLimits" -> 'maxStorageBytes') = 'number'
              AND ("effectiveLimits" ->> 'maxStorageBytes') ~ '^[0-9]+$'
            THEN ("effectiveLimits" ->> 'maxStorageBytes')::NUMERIC
            ELSE NULL
          END AS "configuredLimitBytesNumeric",
          CASE
            WHEN "unmeasuredObjectCount" > 0 THEN 'UNMEASURABLE'
            ELSE 'MEASURED'
          END AS "measurementState"
        FROM "commercial_storage"
      ),
      "capacity_storage" AS (
        SELECT
          *,
          CASE
            WHEN "source" = 'NONE' THEN 'NO_ACCESS'
            WHEN "unmeasuredObjectCount" > 0 THEN 'UNMEASURABLE'
            WHEN "configuredLimitBytesNumeric" IS NULL THEN 'UNCONFIGURED'
            WHEN "measuredStorageBytesNumeric" < "configuredLimitBytesNumeric" THEN 'AVAILABLE'
            WHEN "measuredStorageBytesNumeric" = "configuredLimitBytesNumeric" THEN 'AT_LIMIT'
            ELSE 'OVER_LIMIT'
          END AS "capacityState"
        FROM "normalized_storage"
      ),
      "derived_storage" AS (
        SELECT
          *,
          ("capacityState" = 'OVER_LIMIT') AS "isOverLimit"
        FROM "capacity_storage"
      )
    `;
  }

  private reportColumns(): Prisma.Sql {
    return Prisma.sql`
      "companyId",
      "companyName",
      "companySlug",
      "companyStatus",
      "source",
      "referenceId",
      "commercialStatus",
      "planId",
      "planCode",
      "planName",
      "configuredLimitBytesNumeric"::TEXT AS "configuredLimitBytes",
      "measuredStorageBytesNumeric"::TEXT AS "measuredStorageBytes",
      "measuredObjectCount",
      "unmeasuredObjectCount",
      "earliestScreenshotAt",
      "latestScreenshotAt",
      "allocationAllowed"
    `;
  }

  private filters(query: StorageUsageQueryDto): Prisma.Sql {
    const filters: Prisma.Sql[] = [];
    const search = query.search?.trim();
    if (search) {
      filters.push(Prisma.sql`(
        POSITION(LOWER(${search}) IN LOWER("companyName")) > 0 OR
        POSITION(LOWER(${search}) IN LOWER("companySlug")) > 0
      )`);
    }
    if (query.source) {
      filters.push(Prisma.sql`"source" = ${query.source}`);
    }
    if (query.commercialStatus) {
      filters.push(
        Prisma.sql`"commercialStatus" = ${query.commercialStatus}`,
      );
    }
    if (query.capacityState) {
      filters.push(Prisma.sql`"capacityState" = ${query.capacityState}`);
    }
    if (query.planId) {
      filters.push(Prisma.sql`"planId" = ${query.planId}::uuid`);
    }
    if (query.limitConfigured !== undefined) {
      filters.push(
        query.limitConfigured
          ? Prisma.sql`"configuredLimitBytesNumeric" IS NOT NULL`
          : Prisma.sql`"configuredLimitBytesNumeric" IS NULL`,
      );
    }
    if (query.overLimit !== undefined) {
      filters.push(Prisma.sql`"isOverLimit" = ${query.overLimit}`);
    }
    return filters.length ? Prisma.join(filters, ' AND ') : Prisma.sql`TRUE`;
  }

  private emptyAggregate(): StorageUsageAggregate {
    return {
      total: 0,
      totalMeasuredStorageBytes: '0',
      measuredScreenshotObjects: 0,
      unmeasuredScreenshotObjects: 0,
      companiesWithMeasuredStorage: 0,
      companiesWithUnmeasurableStorage: 0,
      companiesWithConfiguredLimit: 0,
      companiesWithoutConfiguredLimit: 0,
      companiesAtLimit: 0,
      companiesOverLimit: 0,
      effectiveTrialCount: 0,
      activeSubscriptionCount: 0,
      suspendedSubscriptionCount: 0,
      noAccessCount: 0,
    };
  }
}
