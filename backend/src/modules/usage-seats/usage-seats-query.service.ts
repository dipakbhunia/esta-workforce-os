import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CompanyStatus,
  EmployeeStatus,
  Prisma,
  SubscriptionStatus,
  TrialStatus,
} from '@prisma/client';
import { paginatedResult } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { CommercialAccessService } from './commercial-access.service';
import {
  CompanySeatDetailsQueryDto,
  UsageSeatsQueryDto,
} from './dto/usage-seats-query.dto';
import { SeatUsageService } from './seat-usage.service';
import {
  CommercialSeatSource,
  CompanySeatSummary,
  SeatCapacityState,
  UsageSeatsMetrics,
} from './usage-seats.types';

interface UsageRow {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyStatus: CompanyStatus;
  source: CommercialSeatSource;
  referenceId: string | null;
  commercialStatus: TrialStatus | SubscriptionStatus | null;
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  capacity: number | null;
  allocationAllowed: boolean;
  used: number;
  capacityState: SeatCapacityState;
  isOverLimit: boolean | null;
}

interface UsageAggregate {
  total: number;
  effectiveTrialCompanies: number;
  activeSubscriptionCompanies: number;
  suspendedSubscriptionCompanies: number;
  noCommercialAccessCompanies: number;
  atCapacityCompanies: number;
  overLimitCompanies: number;
  totalTrialAllowance: number;
  totalSubscriptionCapacity: number;
  currentUsedWorkforceSeats: number;
}

@Injectable()
export class UsageSeatsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commercialAccess: CommercialAccessService,
    private readonly seatUsage: SeatUsageService,
  ) {}

  async findAll(query: UsageSeatsQueryDto) {
    const now = new Date();
    const cte = this.usageCte(now);
    const filters = this.filters(query);
    const offset = (query.page - 1) * query.limit;

    const [rows, aggregates] = await this.prisma.$transaction([
      this.prisma.$queryRaw<UsageRow[]>(Prisma.sql`
        ${cte}
        SELECT *
        FROM "derived_usage"
        WHERE ${filters}
        ORDER BY "companyName" ASC, "companyId" ASC
        OFFSET ${offset}
        LIMIT ${query.limit}
      `),
      this.prisma.$queryRaw<UsageAggregate[]>(Prisma.sql`
        ${cte}
        SELECT
          COUNT(*)::INTEGER AS "total",
          COUNT(*) FILTER (WHERE "source" = 'TRIAL')::INTEGER AS "effectiveTrialCompanies",
          COUNT(*) FILTER (WHERE "source" = 'SUBSCRIPTION' AND "commercialStatus" = 'ACTIVE')::INTEGER AS "activeSubscriptionCompanies",
          COUNT(*) FILTER (WHERE "source" = 'SUBSCRIPTION' AND "commercialStatus" = 'SUSPENDED')::INTEGER AS "suspendedSubscriptionCompanies",
          COUNT(*) FILTER (WHERE "source" = 'NONE')::INTEGER AS "noCommercialAccessCompanies",
          COUNT(*) FILTER (WHERE "capacityState" = 'AT_CAPACITY')::INTEGER AS "atCapacityCompanies",
          COUNT(*) FILTER (WHERE "capacityState" = 'OVER_LIMIT')::INTEGER AS "overLimitCompanies",
          COALESCE(SUM("capacity") FILTER (WHERE "source" = 'TRIAL'), 0)::INTEGER AS "totalTrialAllowance",
          COALESCE(SUM("capacity") FILTER (WHERE "source" = 'SUBSCRIPTION'), 0)::INTEGER AS "totalSubscriptionCapacity",
          COALESCE(SUM("used"), 0)::INTEGER AS "currentUsedWorkforceSeats"
        FROM "derived_usage"
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
        query.overLimit !== undefined,
    );

    return {
      ...paginatedResult(
        rows.map((row) => this.toSummary(row, now)),
        aggregate.total,
        query,
      ),
      summary: {
        scope: hasFilters ? 'FILTERED' : 'ALL_COMPANIES',
        effectiveTrialCompanies: aggregate.effectiveTrialCompanies,
        activeSubscriptionCompanies: aggregate.activeSubscriptionCompanies,
        suspendedSubscriptionCompanies:
          aggregate.suspendedSubscriptionCompanies,
        noCommercialAccessCompanies: aggregate.noCommercialAccessCompanies,
        atCapacityCompanies: aggregate.atCapacityCompanies,
        overLimitCompanies: aggregate.overLimitCompanies,
        totalTrialAllowance: aggregate.totalTrialAllowance,
        totalSubscriptionCapacity: aggregate.totalSubscriptionCapacity,
        currentUsedWorkforceSeats: aggregate.currentUsedWorkforceSeats,
      } satisfies UsageSeatsMetrics,
      asOf: now.toISOString(),
    };
  }

  async findCompany(companyId: string, query: CompanySeatDetailsQueryDto) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: companyId, deletedAt: null },
        select: { id: true, name: true, slug: true, status: true },
      });
      if (!company) throw new NotFoundException('Company not found');

      const commercial = await this.commercialAccess.resolve(companyId, tx, now);
      const used = await this.seatUsage.countUsedSeats(companyId, tx);
      const search = query.search?.trim();
      const where: Prisma.EmployeeWhereInput = {
        companyId,
        status: EmployeeStatus.ACTIVE,
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { employeeCode: { contains: search, mode: 'insensitive' } },
                { user: { firstName: { contains: search, mode: 'insensitive' } } },
                { user: { lastName: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };
      const [employees, total] = await Promise.all([
        tx.employee.findMany({
          where,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: [{ user: { firstName: 'asc' } }, { employeeCode: 'asc' }],
          select: {
            id: true,
            employeeCode: true,
            status: true,
            user: { select: { firstName: true, lastName: true } },
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        }),
        tx.employee.count({ where }),
      ]);

      const summary: CompanySeatSummary = {
        company,
        commercial,
        seats: this.seatUsage.calculate(used, commercial.capacity),
        asOf: now.toISOString(),
      };

      return {
        ...summary,
        consumers: paginatedResult(
          employees.map((employee) => ({
            id: employee.id,
            employeeCode: employee.employeeCode,
            status: employee.status,
            name:
              [employee.user.firstName, employee.user.lastName]
                .filter(Boolean)
                .join(' ') || employee.employeeCode,
            department: employee.department,
            designation: employee.designation,
          })),
          total,
          query,
        ),
      };
    });
  }

  private usageCte(now: Date): Prisma.Sql {
    return Prisma.sql`
      WITH "active_usage" AS (
        SELECT "companyId", COUNT(*)::INTEGER AS "used"
        FROM "Employee"
        WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL
        GROUP BY "companyId"
      ),
      "effective_trial" AS (
        SELECT DISTINCT ON ("companyId")
          "id", "companyId", "status"::TEXT AS "status", "seatLimit", "createdAt"
        FROM "CompanyTrial"
        WHERE "status" = 'ACTIVE' AND "startsAt" <= ${now} AND "endsAt" > ${now}
        ORDER BY "companyId", "createdAt" DESC
      ),
      "live_subscription" AS (
        SELECT DISTINCT ON (subscription."companyId")
          subscription."id",
          subscription."companyId",
          subscription."status"::TEXT AS "status",
          subscription."seatQuantity",
          subscription."planId",
          plan."code" AS "planCode",
          plan."name" AS "planName",
          subscription."createdAt"
        FROM "CompanySubscription" subscription
        INNER JOIN "Plan" plan ON plan."id" = subscription."planId"
        WHERE subscription."status" IN ('ACTIVE', 'SUSPENDED')
          AND (subscription."currentPeriodEnd" IS NULL OR subscription."currentPeriodEnd" > ${now})
        ORDER BY subscription."companyId", subscription."createdAt" DESC
      ),
      "usage_rows" AS (
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
          CASE WHEN trial."id" IS NULL THEN subscription."planCode" ELSE NULL END AS "planCode",
          CASE WHEN trial."id" IS NULL THEN subscription."planName" ELSE NULL END AS "planName",
          CASE
            WHEN trial."id" IS NOT NULL THEN trial."seatLimit"
            ELSE subscription."seatQuantity"
          END AS "capacity",
          CASE
            WHEN trial."id" IS NOT NULL THEN TRUE
            WHEN subscription."status" = 'ACTIVE' THEN TRUE
            ELSE FALSE
          END AS "allocationAllowed",
          COALESCE(usage."used", 0)::INTEGER AS "used"
        FROM "Company" company
        LEFT JOIN "effective_trial" trial ON trial."companyId" = company."id"
        LEFT JOIN "live_subscription" subscription ON subscription."companyId" = company."id"
        LEFT JOIN "active_usage" usage ON usage."companyId" = company."id"
        WHERE company."deletedAt" IS NULL
      ),
      "derived_usage" AS (
        SELECT
          *,
          CASE
            WHEN "capacity" IS NULL THEN 'NO_ACCESS'
            WHEN "used" > "capacity" THEN 'OVER_LIMIT'
            WHEN "used" = "capacity" THEN 'AT_CAPACITY'
            ELSE 'AVAILABLE'
          END AS "capacityState",
          CASE WHEN "capacity" IS NULL THEN NULL ELSE "used" > "capacity" END AS "isOverLimit"
        FROM "usage_rows"
      )
    `;
  }

  private filters(query: UsageSeatsQueryDto): Prisma.Sql {
    const filters: Prisma.Sql[] = [];
    const search = query.search?.trim();
    if (search) {
      filters.push(Prisma.sql`(
        POSITION(LOWER(${search}) IN LOWER("companyName")) > 0 OR
        POSITION(LOWER(${search}) IN LOWER("companySlug")) > 0
      )`);
    }
    if (query.source) filters.push(Prisma.sql`"source" = ${query.source}`);
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
    if (query.overLimit !== undefined) {
      filters.push(Prisma.sql`"isOverLimit" = ${query.overLimit}`);
    }
    return filters.length ? Prisma.join(filters, ' AND ') : Prisma.sql`TRUE`;
  }

  private toSummary(row: UsageRow, now: Date): CompanySeatSummary {
    return {
      company: {
        id: row.companyId,
        name: row.companyName,
        slug: row.companySlug,
        status: row.companyStatus,
      },
      commercial: {
        source: row.source,
        referenceId: row.referenceId,
        commercialStatus: row.commercialStatus,
        plan: row.planId
          ? { id: row.planId, code: row.planCode!, name: row.planName! }
          : null,
        capacity: row.capacity,
        allocationAllowed: row.allocationAllowed,
      },
      seats: this.seatUsage.calculate(row.used, row.capacity),
      asOf: now.toISOString(),
    };
  }

  private emptyAggregate(): UsageAggregate {
    return {
      total: 0,
      effectiveTrialCompanies: 0,
      activeSubscriptionCompanies: 0,
      suspendedSubscriptionCompanies: 0,
      noCommercialAccessCompanies: 0,
      atCapacityCompanies: 0,
      overLimitCompanies: 0,
      totalTrialAllowance: 0,
      totalSubscriptionCapacity: 0,
      currentUsedWorkforceSeats: 0,
    };
  }
}
