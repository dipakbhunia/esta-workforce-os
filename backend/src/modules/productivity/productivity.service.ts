import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationProductivityRule, Prisma, ProductivityCategory, RoleName, WebsiteProductivityRule } from '@prisma/client';
import { paginatedResult, paginationArgs } from '../../common/utils/pagination.util';
import { PrismaService } from '../../database/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  ProductivityAnalyticsQueryDto,
  ProductivityCoverageQueryDto,
  ProductivityEmployeeDetailsQueryDto,
  ProductivityTrendsQueryDto,
} from './dto/productivity-analytics.dto';
import {
  ClassifyApplicationDto,
  ClassifyWebsiteDto,
  CreateApplicationProductivityRuleDto,
  CreateWebsiteProductivityRuleDto,
  ProductivityRuleQueryDto,
  UpdateApplicationProductivityRuleDto,
  UpdateWebsiteProductivityRuleDto,
} from './dto/productivity-rule.dto';
import { ClassificationResult, ProductivityClassificationService } from './productivity-classification.service';

type AnalyticsEmployee = Prisma.EmployeeGetPayload<{ include: { user: true; department: true; branch: true } }>;
type AnalyticsUsageInclude = { employee: { include: { user: true; department: true; branch: true } } };
type AnalyticsApplicationUsage = Prisma.ApplicationUsageGetPayload<{ include: AnalyticsUsageInclude }>;
type AnalyticsWebsiteUsage = Prisma.WebsiteUsageGetPayload<{ include: AnalyticsUsageInclude }>;
type UsageSource = 'APPLICATION' | 'WEBSITE';
type CategorySeconds = Record<ProductivityCategory, number>;

interface NamedDurationAggregate {
  name: string;
  normalizedName: string;
  category: ProductivityCategory;
  durationSeconds: number;
  employeeIds: Set<string>;
}

interface WebsiteDurationAggregate {
  hostname: string;
  normalizedHostname: string;
  category: ProductivityCategory;
  durationSeconds: number;
  employeeIds: Set<string>;
}

interface EmployeeProductivityAggregate {
  employeeId: string;
  employeeCode: string;
  employee: AnalyticsEmployee;
  durations: CategorySeconds;
  productiveApps: Map<string, number>;
  productiveWebsites: Map<string, number>;
}

interface DepartmentProductivityAggregate {
  department: AnalyticsEmployee['department'];
  employeeIds: Set<string>;
  productiveSeconds: number;
  neutralSeconds: number;
  unproductiveSeconds: number;
  unclassifiedSeconds: number;
}

interface ClassifiedApplicationUsage {
  employee: AnalyticsEmployee;
  employeeId: string;
  companyId: string;
  displayName: string;
  normalizedName: string;
  category: ProductivityCategory;
  durationSeconds: number;
  startedAt: Date;
  endedAt: Date;
}

interface ClassifiedWebsiteUsage {
  employee: AnalyticsEmployee;
  employeeId: string;
  companyId: string;
  displayName: string;
  normalizedHostname: string;
  category: ProductivityCategory;
  durationSeconds: number;
  startedAt: Date;
  endedAt: Date;
}

interface EmployeeUsageAggregate {
  name: string;
  normalizedName: string;
  category: ProductivityCategory;
  durationSeconds: number;
  usageCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface EmployeeWebsiteUsageAggregate {
  hostname: string;
  normalizedHostname: string;
  category: ProductivityCategory;
  durationSeconds: number;
  usageCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

interface CoverageApplicationAggregate {
  name: string;
  normalizedName: string;
  durationSeconds: number;
  employeeIds: Set<string>;
  usageCount: number;
  lastSeenAt: Date;
}

interface CoverageWebsiteAggregate {
  hostname: string;
  normalizedHostname: string;
  durationSeconds: number;
  employeeIds: Set<string>;
  usageCount: number;
  lastSeenAt: Date;
}

interface TrendAggregate {
  bucket: string;
  start: Date;
  end: Date;
  durations: CategorySeconds;
}

interface TrendEntityAggregate {
  durations: CategorySeconds;
  firstProductivity: number | null;
  lastProductivity: number | null;
}
interface CoverageEmployeeAggregate {
  employee: AnalyticsEmployee;
  classifiedSeconds: number;
  unclassifiedSeconds: number;
}
@Injectable()
export class ProductivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classifier: ProductivityClassificationService,
  ) {}

  async createApplication(dto: CreateApplicationProductivityRuleDto, actor: AuthenticatedUser) {
    const scope = this.resolveWriteScope(actor, dto.companyId);
    const normalizedName = this.classifier.normalizeApplicationName(dto.applicationName);
    try {
      const rule = await this.prisma.applicationProductivityRule.create({
        data: {
          companyId: scope.companyId,
          scope: scope.scope,
          applicationName: dto.applicationName.trim(),
          normalizedName,
          category: dto.category,
          notes: this.optionalText(dto.notes),
          enabled: dto.enabled ?? true,
        },
      });
      await this.audit(actor, scope.companyId, 'PRODUCTIVITY_APPLICATION_RULE_CREATED', 'ApplicationProductivityRule', rule.id, { normalizedName, category: rule.category });
      return this.mapApplication(rule);
    } catch (error) {
      this.throwConflict(error, 'Application productivity rule already exists for this scope');
    }
  }

  async listApplications(query: ProductivityRuleQueryDto, actor: AuthenticatedUser) {
    const filters: Prisma.ApplicationProductivityRuleWhereInput[] = [
      this.readScopeWhere(actor, query.scope),
      { deletedAt: null },
    ];
    if (query.category) filters.push({ category: query.category });
    if (query.enabled !== undefined) filters.push({ enabled: query.enabled });
    if (query.search) {
      filters.push({
        OR: [
          { applicationName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { normalizedName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { notes: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }
    const where: Prisma.ApplicationProductivityRuleWhereInput = { AND: filters };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.applicationProductivityRule.findMany({ where, ...paginationArgs(query), orderBy: [{ companyId: 'asc' }, { applicationName: 'asc' }] }),
      this.prisma.applicationProductivityRule.count({ where }),
    ]);
    return paginatedResult(records.map((record) => this.mapApplication(record)), total, query);
  }

  async getApplication(id: string, actor: AuthenticatedUser) {
    const record = await this.prisma.applicationProductivityRule.findFirst({ where: { id, deletedAt: null, AND: [this.readScopeWhere(actor)] } });
    if (!record) throw new NotFoundException('Application productivity rule not found');
    return this.mapApplication(record);
  }

  async updateApplication(id: string, dto: UpdateApplicationProductivityRuleDto, actor: AuthenticatedUser) {
    const existing = await this.applicationForWrite(id, actor);
    const data: Prisma.ApplicationProductivityRuleUpdateInput = {
      ...(dto.applicationName !== undefined ? {
        applicationName: dto.applicationName.trim(),
        normalizedName: this.classifier.normalizeApplicationName(dto.applicationName),
      } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
    };
    try {
      const rule = await this.prisma.applicationProductivityRule.update({ where: { id }, data });
      await this.audit(actor, existing.companyId, 'PRODUCTIVITY_APPLICATION_RULE_UPDATED', 'ApplicationProductivityRule', id, { category: rule.category });
      return this.mapApplication(rule);
    } catch (error) {
      this.throwConflict(error, 'Application productivity rule already exists for this scope');
    }
  }

  async deleteApplication(id: string, actor: AuthenticatedUser) {
    const existing = await this.applicationForWrite(id, actor);
    const rule = await this.prisma.applicationProductivityRule.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
    await this.audit(actor, existing.companyId, 'PRODUCTIVITY_APPLICATION_RULE_DELETED', 'ApplicationProductivityRule', id, { normalizedName: existing.normalizedName });
    return this.mapApplication(rule);
  }

  async createWebsite(dto: CreateWebsiteProductivityRuleDto, actor: AuthenticatedUser) {
    const scope = this.resolveWriteScope(actor, dto.companyId);
    const normalizedHostname = this.classifier.normalizeHostname(dto.hostname);
    try {
      const rule = await this.prisma.websiteProductivityRule.create({
        data: {
          companyId: scope.companyId,
          scope: scope.scope,
          hostname: normalizedHostname,
          normalizedHostname,
          category: dto.category,
          notes: this.optionalText(dto.notes),
          enabled: dto.enabled ?? true,
        },
      });
      await this.audit(actor, scope.companyId, 'PRODUCTIVITY_WEBSITE_RULE_CREATED', 'WebsiteProductivityRule', rule.id, { normalizedHostname, category: rule.category });
      return this.mapWebsite(rule);
    } catch (error) {
      this.throwConflict(error, 'Website productivity rule already exists for this scope');
    }
  }

  async listWebsites(query: ProductivityRuleQueryDto, actor: AuthenticatedUser) {
    const filters: Prisma.WebsiteProductivityRuleWhereInput[] = [
      this.readScopeWhere(actor, query.scope),
      { deletedAt: null },
    ];
    if (query.category) filters.push({ category: query.category });
    if (query.enabled !== undefined) filters.push({ enabled: query.enabled });
    if (query.search) {
      filters.push({
        OR: [
          { hostname: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { normalizedHostname: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { notes: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
        ],
      });
    }
    const where: Prisma.WebsiteProductivityRuleWhereInput = { AND: filters };
    const [records, total] = await this.prisma.$transaction([
      this.prisma.websiteProductivityRule.findMany({ where, ...paginationArgs(query), orderBy: [{ companyId: 'asc' }, { hostname: 'asc' }] }),
      this.prisma.websiteProductivityRule.count({ where }),
    ]);
    return paginatedResult(records.map((record) => this.mapWebsite(record)), total, query);
  }

  async getWebsite(id: string, actor: AuthenticatedUser) {
    const record = await this.prisma.websiteProductivityRule.findFirst({ where: { id, deletedAt: null, AND: [this.readScopeWhere(actor)] } });
    if (!record) throw new NotFoundException('Website productivity rule not found');
    return this.mapWebsite(record);
  }

  async updateWebsite(id: string, dto: UpdateWebsiteProductivityRuleDto, actor: AuthenticatedUser) {
    const existing = await this.websiteForWrite(id, actor);
    const normalizedHostname = dto.hostname !== undefined ? this.classifier.normalizeHostname(dto.hostname) : undefined;
    const data: Prisma.WebsiteProductivityRuleUpdateInput = {
      ...(normalizedHostname !== undefined ? { hostname: normalizedHostname, normalizedHostname } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.notes !== undefined ? { notes: this.optionalText(dto.notes) } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
    };
    try {
      const rule = await this.prisma.websiteProductivityRule.update({ where: { id }, data });
      await this.audit(actor, existing.companyId, 'PRODUCTIVITY_WEBSITE_RULE_UPDATED', 'WebsiteProductivityRule', id, { category: rule.category });
      return this.mapWebsite(rule);
    } catch (error) {
      this.throwConflict(error, 'Website productivity rule already exists for this scope');
    }
  }

  async deleteWebsite(id: string, actor: AuthenticatedUser) {
    const existing = await this.websiteForWrite(id, actor);
    const rule = await this.prisma.websiteProductivityRule.update({ where: { id }, data: { deletedAt: new Date(), enabled: false } });
    await this.audit(actor, existing.companyId, 'PRODUCTIVITY_WEBSITE_RULE_DELETED', 'WebsiteProductivityRule', id, { normalizedHostname: existing.normalizedHostname });
    return this.mapWebsite(rule);
  }

  async classifyApplication(dto: ClassifyApplicationDto, actor: AuthenticatedUser): Promise<ClassificationResult> {
    const companyId = this.classificationCompanyId(actor, dto.companyId);
    return this.classifier.classifyApplication(dto.applicationName, companyId);
  }

  async classifyWebsite(dto: ClassifyWebsiteDto, actor: AuthenticatedUser): Promise<ClassificationResult> {
    const companyId = this.classificationCompanyId(actor, dto.companyId);
    return this.classifier.classifyWebsite(dto.hostname, companyId);
  }

  async analytics(query: ProductivityAnalyticsQueryDto, actor: AuthenticatedUser) {
    const range = this.dateRange(query);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? query.limit ?? 20));
    const employeeWhere = await this.analyticsEmployeeWhere(query, actor);
    const appWhere = this.analyticsApplicationWhere(query, range, employeeWhere);
    const websiteWhere = this.analyticsWebsiteWhere(query, range, employeeWhere);

    const [applications, websites] = await this.prisma.$transaction([
      this.prisma.applicationUsage.findMany({
        where: appWhere,
        include: this.analyticsUsageInclude(),
        orderBy: { startedAt: 'asc' },
      }),
      this.prisma.websiteUsage.findMany({
        where: websiteWhere,
        include: this.analyticsUsageInclude(),
        orderBy: { startedAt: 'asc' },
      }),
    ]);

    const appNames = applications.map((usage) => this.safeNormalizeApplication(usage.applicationName));
    const hostnames = websites.map((usage) => this.safeNormalizeHostname(usage.domain));
    const companyIds = [...applications.map((usage) => usage.companyId), ...websites.map((usage) => usage.companyId)];
    const [applicationRules, websiteRules] = await Promise.all([
      this.classifier.applicationRuleMap(appNames, companyIds),
      this.classifier.websiteRuleMap(hostnames, companyIds),
    ]);

    const summary = this.emptyDurations();
    const employeeMap = new Map<string, EmployeeProductivityAggregate>();
    const departmentMap = new Map<string, DepartmentProductivityAggregate>();
    const appMap = new Map<string, NamedDurationAggregate>();
    const websiteMap = new Map<string, WebsiteDurationAggregate>();
    const timeline: ReturnType<typeof this.timelineSegment>[] = [];

    for (const usage of applications) {
      const normalizedName = this.safeNormalizeApplication(usage.applicationName);
      const classification = this.classifier.classificationFromMap(applicationRules, normalizedName, usage.companyId);
      const durationSeconds = this.safeSeconds(usage.durationSeconds);
      summary[classification.category] += durationSeconds;
      const employeeAggregate = this.employeeAggregate(employeeMap, usage.employee);
      employeeAggregate.durations[classification.category] += durationSeconds;
      if (classification.category === ProductivityCategory.PRODUCTIVE) {
        this.addMapDuration(employeeAggregate.productiveApps, usage.applicationName, durationSeconds);
      }
      this.addApplicationAggregate(appMap, normalizedName, usage.applicationName, classification.category, durationSeconds, usage.employeeId);
      this.addDepartmentDuration(departmentMap, usage.employee, classification.category, durationSeconds);
      timeline.push(this.timelineSegment(usage.employeeId, classification.category, 'APPLICATION', usage.startedAt, usage.endedAt, durationSeconds, usage.applicationName, {
        applicationName: usage.applicationName,
        windowTitle: usage.windowTitle,
      }));
    }

    for (const usage of websites) {
      const normalizedHostname = this.safeNormalizeHostname(usage.domain);
      const classification = this.classifier.classificationFromMap(websiteRules, normalizedHostname, usage.companyId);
      const durationSeconds = this.safeSeconds(usage.durationSeconds);
      summary[classification.category] += durationSeconds;
      const employeeAggregate = this.employeeAggregate(employeeMap, usage.employee);
      employeeAggregate.durations[classification.category] += durationSeconds;
      if (classification.category === ProductivityCategory.PRODUCTIVE) {
        this.addMapDuration(employeeAggregate.productiveWebsites, usage.domain, durationSeconds);
      }
      this.addWebsiteAggregate(websiteMap, normalizedHostname, usage.domain, classification.category, durationSeconds, usage.employeeId);
      this.addDepartmentDuration(departmentMap, usage.employee, classification.category, durationSeconds);
      timeline.push(this.timelineSegment(usage.employeeId, classification.category, 'WEBSITE', usage.startedAt, usage.endedAt, durationSeconds, usage.domain, {
        hostname: usage.domain,
        browserName: usage.browserName,
        pageTitle: usage.pageTitle,
      }));
    }

    const employeeRows = [...employeeMap.values()]
      .map((entry) => ({
        employeeId: entry.employeeId,
        employeeCode: entry.employeeCode,
        employee: this.mapEmployee(entry.employee),
        department: this.mapOrgUnit(entry.employee.department),
        branch: this.mapOrgUnit(entry.employee.branch),
        productiveSeconds: entry.durations.PRODUCTIVE,
        neutralSeconds: entry.durations.NEUTRAL,
        unproductiveSeconds: entry.durations.UNPRODUCTIVE,
        unclassifiedSeconds: entry.durations.UNCLASSIFIED,
        productivityPercentage: this.productivityPercentage(entry.durations),
        topProductiveApp: this.topName(entry.productiveApps),
        topProductiveWebsite: this.topName(entry.productiveWebsites),
      }))
      .sort((a, b) => b.productiveSeconds - a.productiveSeconds || a.employee.name.localeCompare(b.employee.name));

    const departments = [...departmentMap.values()]
      .map((entry) => ({
        department: this.mapOrgUnit(entry.department),
        employeeCount: entry.employeeIds.size,
        productivityPercentage: this.productivityPercentage({
          PRODUCTIVE: entry.productiveSeconds,
          NEUTRAL: entry.neutralSeconds,
          UNPRODUCTIVE: entry.unproductiveSeconds,
          UNCLASSIFIED: 0,
        }),
        productiveSeconds: entry.productiveSeconds,
        unproductiveSeconds: entry.unproductiveSeconds,
      }))
      .sort((a, b) => b.productiveSeconds - a.productiveSeconds);

    const total = employeeRows.length;
    const pagedEmployees = employeeRows.slice((page - 1) * pageSize, page * pageSize);

    return {
      summary: {
        totalProductiveSeconds: summary.PRODUCTIVE,
        totalNeutralSeconds: summary.NEUTRAL,
        totalUnproductiveSeconds: summary.UNPRODUCTIVE,
        totalUnclassifiedSeconds: summary.UNCLASSIFIED,
        productivityPercentage: this.productivityPercentage(summary),
        averageProductivityPercentage: this.averageProductivity(employeeRows.map((row) => row.productivityPercentage)),
      },
      employees: pagedEmployees,
      topProductiveApps: this.topApplications(appMap, ProductivityCategory.PRODUCTIVE),
      topNeutralApps: this.topApplications(appMap, ProductivityCategory.NEUTRAL),
      topUnproductiveApps: this.topApplications(appMap, ProductivityCategory.UNPRODUCTIVE),
      topProductiveWebsites: this.topWebsites(websiteMap, ProductivityCategory.PRODUCTIVE),
      topNeutralWebsites: this.topWebsites(websiteMap, ProductivityCategory.NEUTRAL),
      topUnproductiveWebsites: this.topWebsites(websiteMap, ProductivityCategory.UNPRODUCTIVE),
      departments,
      timeline: timeline.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },
    };
  }

  async trends(query: ProductivityTrendsQueryDto, actor: AuthenticatedUser) {
    const range = this.dateRange(query);
    const groupBy = query.groupBy ?? 'DAY';
    const employeeWhere = await this.analyticsEmployeeWhere(query, actor);
    const [applications, websites] = await this.prisma.$transaction([
      this.prisma.applicationUsage.findMany({ where: this.analyticsApplicationWhere(query, range, employeeWhere), include: this.analyticsUsageInclude(), orderBy: { startedAt: 'asc' } }),
      this.prisma.websiteUsage.findMany({ where: this.analyticsWebsiteWhere(query, range, employeeWhere), include: this.analyticsUsageInclude(), orderBy: { startedAt: 'asc' } }),
    ]);

    const classified = await this.classifiedUsage(applications, websites);
    const totalDurations = this.emptyDurations();
    const trendMap = new Map<string, TrendAggregate>();
    const employeeMap = new Map<string, EmployeeProductivityAggregate>();
    const departmentMap = new Map<string, DepartmentProductivityAggregate>();
    const employeeBucketMap = new Map<string, TrendEntityAggregate>();
    const departmentBucketMap = new Map<string, TrendEntityAggregate>();
    const departmentTrendMap = new Map<string, { department: AnalyticsEmployee['department']; aggregate: TrendAggregate }>();
    const employeeTrendMap = new Map<string, { employee: AnalyticsEmployee; aggregate: TrendAggregate }>();

    const consume = (item: ClassifiedApplicationUsage | ClassifiedWebsiteUsage) => {
      totalDurations[item.category] += item.durationSeconds;
      const bucket = this.trendBucket(item.startedAt, groupBy);
      this.addTrendDuration(trendMap, bucket, item.category, item.durationSeconds);
      const employeeAggregate = this.employeeAggregate(employeeMap, item.employee);
      employeeAggregate.durations[item.category] += item.durationSeconds;
      this.addDepartmentDuration(departmentMap, item.employee, item.category, item.durationSeconds);

      const employeeTrendKey = `${item.employee.id}:${bucket.key}`;
      const employeeTrend = employeeTrendMap.get(employeeTrendKey) ?? { employee: item.employee, aggregate: this.createTrendAggregate(bucket) };
      employeeTrend.aggregate.durations[item.category] += item.durationSeconds;
      employeeTrendMap.set(employeeTrendKey, employeeTrend);

      const departmentId = item.employee.departmentId ?? 'UNASSIGNED';
      const departmentTrendKey = `${departmentId}:${bucket.key}`;
      const departmentTrend = departmentTrendMap.get(departmentTrendKey) ?? { department: item.employee.department, aggregate: this.createTrendAggregate(bucket) };
      departmentTrend.aggregate.durations[item.category] += item.durationSeconds;
      departmentTrendMap.set(departmentTrendKey, departmentTrend);
    };

    for (const item of classified.applications) consume(item);
    for (const item of classified.websites) consume(item);

    for (const row of employeeTrendMap.values()) {
      const entry = this.trendEntity(employeeBucketMap, row.employee.id);
      this.recordEntityTrend(entry, this.productivityPercentage(row.aggregate.durations), row.aggregate.start);
    }
    for (const row of departmentTrendMap.values()) {
      const key = row.department?.id ?? 'UNASSIGNED';
      const entry = this.trendEntity(departmentBucketMap, key);
      this.recordEntityTrend(entry, this.productivityPercentage(row.aggregate.durations), row.aggregate.start);
    }

    const employeeRows = [...employeeMap.values()].map((entry) => this.trendEmployeeRow(entry, employeeBucketMap.get(entry.employeeId))).sort((a, b) => b.productivityPercentage - a.productivityPercentage || a.employee.name.localeCompare(b.employee.name));
    const departmentRows = [...departmentMap.values()].map((entry) => this.trendDepartmentRow(entry, departmentBucketMap.get(entry.department?.id ?? 'UNASSIGNED'))).sort((a, b) => b.productivityPercentage - a.productivityPercentage || (a.department?.name ?? 'Unassigned').localeCompare(b.department?.name ?? 'Unassigned'));
    const selectedEmployee = query.employeeId ? employeeRows.find((row) => row.employeeId === query.employeeId) : null;
    const selectedDepartment = query.departmentId ? departmentRows.find((row) => row.department?.id === query.departmentId) : null;

    const classifiedSeconds = totalDurations.PRODUCTIVE + totalDurations.NEUTRAL + totalDurations.UNPRODUCTIVE;
    const totalSeconds = classifiedSeconds + totalDurations.UNCLASSIFIED;

    return {
      summary: this.trendSummary(totalDurations),
      trendPoints: [...trendMap.values()].sort((a, b) => a.start.getTime() - b.start.getTime()).map((point) => this.mapTrendPoint(point)),
      departmentTrend: [...departmentTrendMap.values()].sort((a, b) => a.aggregate.start.getTime() - b.aggregate.start.getTime()).map((row) => ({ ...this.mapTrendPoint(row.aggregate), department: this.mapOrgUnit(row.department) })),
      employeeTrend: [...employeeTrendMap.values()].sort((a, b) => a.aggregate.start.getTime() - b.aggregate.start.getTime()).map((row) => ({
        ...this.mapTrendPoint(row.aggregate),
        employeeId: row.employee.id,
        employeeCode: row.employee.employeeCode,
        employee: this.mapEmployee(row.employee),
        department: this.mapOrgUnit(row.employee.department),
        branch: this.mapOrgUnit(row.employee.branch),
      })),
      topProductiveEmployees: employeeRows.slice(0, 10),
      bottomProductivityEmployees: [...employeeRows].reverse().slice(0, 10),
      topProductiveDepartments: departmentRows.slice(0, 10),
      bottomProductivityDepartments: [...departmentRows].reverse().slice(0, 10),
      mostImprovedEmployees: [...employeeRows].sort((a, b) => b.changePercentage - a.changePercentage).slice(0, 10),
      largestProductivityDrop: [...employeeRows].sort((a, b) => a.changePercentage - b.changePercentage).slice(0, 10),
      benchmarks: {
        companyAverageProductivity: this.productivityPercentage(totalDurations),
        companyAverageCoverage: this.coveragePercentage(classifiedSeconds, totalSeconds),
        selectedDepartmentProductivity: selectedDepartment?.productivityPercentage ?? null,
        selectedDepartmentCoverage: selectedDepartment?.coveragePercentage ?? null,
        selectedEmployeeProductivity: selectedEmployee?.productivityPercentage ?? null,
        selectedEmployeeCoverage: selectedEmployee?.coveragePercentage ?? null,
      },
      groupBy,
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },
    };
  }
  async employeeDetails(employeeId: string, query: ProductivityEmployeeDetailsQueryDto, actor: AuthenticatedUser) {
    const range = this.dateRange(query);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? query.limit ?? 20));
    const source = query.source ?? 'ALL';
    const employee = await this.prisma.employee.findFirst({
      where: { AND: [await this.employeeVisibilityWhere(actor), { id: employeeId, deletedAt: null }] },
      include: { user: true, department: true, branch: true },
    });
    if (!employee) throw new NotFoundException('Employee productivity details not found');

    const appWhere = this.analyticsApplicationWhere({ ...query, employeeId } as ProductivityAnalyticsQueryDto, range, { id: employeeId });
    const websiteWhere = this.analyticsWebsiteWhere({ ...query, employeeId } as ProductivityAnalyticsQueryDto, range, { id: employeeId });
    const [applications, websites] = await Promise.all([
      source === 'WEBSITE' ? Promise.resolve([] as AnalyticsApplicationUsage[]) : this.prisma.applicationUsage.findMany({ where: appWhere, include: this.analyticsUsageInclude(), orderBy: { startedAt: 'asc' } }),
      source === 'APPLICATION' ? Promise.resolve([] as AnalyticsWebsiteUsage[]) : this.prisma.websiteUsage.findMany({ where: websiteWhere, include: this.analyticsUsageInclude(), orderBy: { startedAt: 'asc' } }),
    ]);

    const classified = await this.classifiedUsage(applications, websites);
    const filteredApps = classified.applications.filter((item) => this.matchesCategory(item.category, query.category));
    const filteredWebsites = classified.websites.filter((item) => this.matchesCategory(item.category, query.category));
    const summary = this.emptyDurations();
    const appMap = new Map<string, EmployeeUsageAggregate>();
    const websiteMap = new Map<string, EmployeeWebsiteUsageAggregate>();
    const timeline = [
      ...filteredApps.map((item) => {
        summary[item.category] += item.durationSeconds;
        this.addEmployeeApplicationUsage(appMap, item);
        return {
          startedAt: item.startedAt.toISOString(),
          endedAt: item.endedAt.toISOString(),
          durationSeconds: item.durationSeconds,
          source: 'APPLICATION' as UsageSource,
          displayName: item.displayName,
          category: item.category,
        };
      }),
      ...filteredWebsites.map((item) => {
        summary[item.category] += item.durationSeconds;
        this.addEmployeeWebsiteUsage(websiteMap, item);
        return {
          startedAt: item.startedAt.toISOString(),
          endedAt: item.endedAt.toISOString(),
          durationSeconds: item.durationSeconds,
          source: 'WEBSITE' as UsageSource,
          displayName: item.displayName,
          category: item.category,
        };
      }),
    ].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

    const total = timeline.length;
    const classifiedSeconds = summary.PRODUCTIVE + summary.NEUTRAL + summary.UNPRODUCTIVE;
    const totalSeconds = classifiedSeconds + summary.UNCLASSIFIED;

    return {
      employee: this.mapEmployee(employee),
      department: this.mapOrgUnit(employee.department),
      branch: this.mapOrgUnit(employee.branch),
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },
      summary: {
        productiveSeconds: summary.PRODUCTIVE,
        neutralSeconds: summary.NEUTRAL,
        unproductiveSeconds: summary.UNPRODUCTIVE,
        unclassifiedSeconds: summary.UNCLASSIFIED,
        classifiedSeconds,
        totalSeconds,
        productivityPercentage: this.productivityPercentage(summary),
        classificationCoveragePercentage: this.coveragePercentage(classifiedSeconds, totalSeconds),
      },
      applications: this.employeeApplications(appMap),
      websites: this.employeeWebsites(websiteMap),
      timeline: timeline.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async coverage(query: ProductivityCoverageQueryDto, actor: AuthenticatedUser) {
    const range = this.dateRange(query);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? query.limit ?? 20));
    const employeeWhere = await this.analyticsEmployeeWhere(query, actor);
    const [applications, websites] = await this.prisma.$transaction([
      this.prisma.applicationUsage.findMany({ where: this.analyticsApplicationWhere(query, range, employeeWhere), include: this.analyticsUsageInclude(), orderBy: { startedAt: 'asc' } }),
      this.prisma.websiteUsage.findMany({ where: this.analyticsWebsiteWhere(query, range, employeeWhere), include: this.analyticsUsageInclude(), orderBy: { startedAt: 'asc' } }),
    ]);

    const classified = await this.classifiedUsage(applications, websites);
    const summary = { classifiedSeconds: 0, unclassifiedSeconds: 0 };
    const unclassifiedApps = new Map<string, CoverageApplicationAggregate>();
    const unclassifiedWebsites = new Map<string, CoverageWebsiteAggregate>();
    const employeeMap = new Map<string, CoverageEmployeeAggregate>();

    for (const item of classified.applications) {
      const employeeAggregate = this.coverageEmployee(employeeMap, item.employee);
      if (item.category === ProductivityCategory.UNCLASSIFIED) {
        summary.unclassifiedSeconds += item.durationSeconds;
        employeeAggregate.unclassifiedSeconds += item.durationSeconds;
        this.addCoverageApplication(unclassifiedApps, item);
      } else {
        summary.classifiedSeconds += item.durationSeconds;
        employeeAggregate.classifiedSeconds += item.durationSeconds;
      }
    }

    for (const item of classified.websites) {
      const employeeAggregate = this.coverageEmployee(employeeMap, item.employee);
      if (item.category === ProductivityCategory.UNCLASSIFIED) {
        summary.unclassifiedSeconds += item.durationSeconds;
        employeeAggregate.unclassifiedSeconds += item.durationSeconds;
        this.addCoverageWebsite(unclassifiedWebsites, item);
      } else {
        summary.classifiedSeconds += item.durationSeconds;
        employeeAggregate.classifiedSeconds += item.durationSeconds;
      }
    }

    const employeeCoverage = [...employeeMap.values()]
      .map((entry) => ({
        employeeId: entry.employee.id,
        employeeCode: entry.employee.employeeCode,
        employee: this.mapEmployee(entry.employee),
        department: this.mapOrgUnit(entry.employee.department),
        branch: this.mapOrgUnit(entry.employee.branch),
        classifiedSeconds: entry.classifiedSeconds,
        unclassifiedSeconds: entry.unclassifiedSeconds,
        coveragePercentage: this.coveragePercentage(entry.classifiedSeconds, entry.classifiedSeconds + entry.unclassifiedSeconds),
      }))
      .sort((a, b) => b.unclassifiedSeconds - a.unclassifiedSeconds || a.employee.name.localeCompare(b.employee.name));

    const totalTrackedSeconds = summary.classifiedSeconds + summary.unclassifiedSeconds;
    const employeesAffected = employeeCoverage.filter((row) => row.unclassifiedSeconds > 0).length;
    return {
      summary: {
        totalTrackedSeconds,
        classifiedSeconds: summary.classifiedSeconds,
        unclassifiedSeconds: summary.unclassifiedSeconds,
        classificationCoveragePercentage: this.coveragePercentage(summary.classifiedSeconds, totalTrackedSeconds),
        unclassifiedApplicationCount: unclassifiedApps.size,
        unclassifiedWebsiteCount: unclassifiedWebsites.size,
        employeesAffected,
      },
      topUnclassifiedApplications: this.topUnclassifiedApplications(unclassifiedApps),
      topUnclassifiedWebsites: this.topUnclassifiedWebsites(unclassifiedWebsites),
      employeeCoverage: employeeCoverage.slice((page - 1) * pageSize, page * pageSize),
      pagination: { page, pageSize, total: employeeCoverage.length, totalPages: Math.ceil(employeeCoverage.length / pageSize) },
      range: { from: range.gte.toISOString(), to: range.lte.toISOString() },
    };
  }

  async exportAnalyticsCsv(query: ProductivityAnalyticsQueryDto, actor: AuthenticatedUser) {
    const data = await this.analytics({ ...query, page: 1, pageSize: 100 } as ProductivityAnalyticsQueryDto, actor);
    const rows = data.employees.map((row) => [
      row.employeeCode,
      row.employee.name,
      row.department?.name ?? '',
      row.branch?.name ?? '',
      row.productiveSeconds,
      row.neutralSeconds,
      row.unproductiveSeconds,
      row.unclassifiedSeconds,
      row.productivityPercentage,
      this.coveragePercentage(row.productiveSeconds + row.neutralSeconds + row.unproductiveSeconds, row.productiveSeconds + row.neutralSeconds + row.unproductiveSeconds + row.unclassifiedSeconds),
    ]);
    return this.csv('productivity-analytics.csv', ['Employee Code', 'Employee Name', 'Department', 'Branch', 'Productive Time', 'Neutral Time', 'Unproductive Time', 'Unclassified Time', 'Productivity %', 'Coverage %'], rows);
  }

  async exportCoverageCsv(query: ProductivityCoverageQueryDto, actor: AuthenticatedUser) {
    const data = await this.coverage({ ...query, page: 1, pageSize: 100 } as ProductivityCoverageQueryDto, actor);
    const rows = data.employeeCoverage.map((row) => [row.employeeCode, row.employee.name, row.department?.name ?? '', row.branch?.name ?? '', row.classifiedSeconds, row.unclassifiedSeconds, row.coveragePercentage]);
    return this.csv('productivity-coverage.csv', ['Employee Code', 'Employee Name', 'Department', 'Branch', 'Classified Time', 'Unclassified Time', 'Coverage %'], rows);
  }

  async exportEmployeeCsv(employeeId: string, query: ProductivityEmployeeDetailsQueryDto, actor: AuthenticatedUser) {
    const data = await this.employeeDetails(employeeId, { ...query, page: 1, pageSize: 100 } as ProductivityEmployeeDetailsQueryDto, actor);
    const rows = data.timeline.map((row) => [row.startedAt.slice(0, 10), row.startedAt, row.endedAt, row.durationSeconds, row.source, row.displayName, row.category]);
    return this.csv('productivity-employee-usage.csv', ['Date', 'Start Time', 'End Time', 'Duration', 'Source', 'Application or Hostname', 'Category'], rows);
  }
  private analyticsApplicationWhere(
    query: ProductivityAnalyticsQueryDto,
    range: { gte: Date; lte: Date },
    employeeWhere: Prisma.EmployeeWhereInput,
  ): Prisma.ApplicationUsageWhereInput {
    const filters: Prisma.ApplicationUsageWhereInput[] = [{ employee: { is: employeeWhere } }, { startedAt: range }];
    if (query.search) {
      filters.push({
        OR: [
          { applicationName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { windowTitle: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { employee: { is: this.employeeSearchWhere(query.search) } },
        ],
      });
    }
    return { AND: filters };
  }

  private analyticsWebsiteWhere(
    query: ProductivityAnalyticsQueryDto,
    range: { gte: Date; lte: Date },
    employeeWhere: Prisma.EmployeeWhereInput,
  ): Prisma.WebsiteUsageWhereInput {
    const filters: Prisma.WebsiteUsageWhereInput[] = [{ employee: { is: employeeWhere } }, { startedAt: range }];
    if (query.search) {
      filters.push({
        OR: [
          { domain: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { browserName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { pageTitle: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          { employee: { is: this.employeeSearchWhere(query.search) } },
        ],
      });
    }
    return { AND: filters };
  }

  private async analyticsEmployeeWhere(query: ProductivityAnalyticsQueryDto, actor: AuthenticatedUser): Promise<Prisma.EmployeeWhereInput> {
    this.assertAnalyticsCompanyFilter(query, actor);
    const filters: Prisma.EmployeeWhereInput[] = [await this.employeeVisibilityWhere(actor), { deletedAt: null }];
    if (query.employeeId) filters.push({ id: query.employeeId });
    if (query.departmentId) filters.push({ departmentId: query.departmentId });
    if (query.branchId) filters.push({ branchId: query.branchId });
    if (query.companyId) filters.push({ companyId: query.companyId });
    return { AND: filters };
  }

  private employeeSearchWhere(search: string): Prisma.EmployeeWhereInput {
    return {
      OR: [
        { employeeCode: { contains: search, mode: Prisma.QueryMode.insensitive } },
        { user: { is: { firstName: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
        { user: { is: { lastName: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
        { user: { is: { email: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
      ],
    };
  }

  private analyticsUsageInclude() {
    return { employee: { include: { user: true, department: true, branch: true } } } as const;
  }

  private employeeAggregate(map: Map<string, EmployeeProductivityAggregate>, employee: AnalyticsEmployee): EmployeeProductivityAggregate {
    const existing = map.get(employee.id);
    if (existing) return existing;
    const created: EmployeeProductivityAggregate = {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employee,
      durations: this.emptyDurations(),
      productiveApps: new Map(),
      productiveWebsites: new Map(),
    };
    map.set(employee.id, created);
    return created;
  }

  private trendBucket(value: Date, groupBy: 'DAY' | 'WEEK' | 'MONTH') {
    const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    if (groupBy === 'WEEK') {
      const day = start.getUTCDay() || 7;
      start.setUTCDate(start.getUTCDate() - day + 1);
    }
    if (groupBy === 'MONTH') start.setUTCDate(1);
    const end = new Date(start);
    if (groupBy === 'DAY') end.setUTCDate(end.getUTCDate() + 1);
    if (groupBy === 'WEEK') end.setUTCDate(end.getUTCDate() + 7);
    if (groupBy === 'MONTH') end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
    const key = groupBy === 'MONTH' ? start.toISOString().slice(0, 7) : start.toISOString().slice(0, 10);
    return { key, start, end };
  }

  private createTrendAggregate(bucket: { key: string; start: Date; end: Date }): TrendAggregate {
    return { bucket: bucket.key, start: bucket.start, end: bucket.end, durations: this.emptyDurations() };
  }

  private addTrendDuration(map: Map<string, TrendAggregate>, bucket: { key: string; start: Date; end: Date }, category: ProductivityCategory, seconds: number): void {
    const aggregate = map.get(bucket.key) ?? this.createTrendAggregate(bucket);
    aggregate.durations[category] += seconds;
    map.set(bucket.key, aggregate);
  }

  private trendSummary(durations: CategorySeconds) {
    const classifiedSeconds = durations.PRODUCTIVE + durations.NEUTRAL + durations.UNPRODUCTIVE;
    const totalSeconds = classifiedSeconds + durations.UNCLASSIFIED;
    return {
      productivityPercentage: this.productivityPercentage(durations),
      coveragePercentage: this.coveragePercentage(classifiedSeconds, totalSeconds),
      productiveSeconds: durations.PRODUCTIVE,
      neutralSeconds: durations.NEUTRAL,
      unproductiveSeconds: durations.UNPRODUCTIVE,
      unclassifiedSeconds: durations.UNCLASSIFIED,
      totalSeconds,
    };
  }

  private mapTrendPoint(point: TrendAggregate) {
    return {
      bucket: point.bucket,
      start: point.start.toISOString(),
      end: point.end.toISOString(),
      ...this.trendSummary(point.durations),
    };
  }

  private trendEntity(map: Map<string, TrendEntityAggregate>, key: string): TrendEntityAggregate {
    const existing = map.get(key);
    if (existing) return existing;
    const created = { durations: this.emptyDurations(), firstProductivity: null, lastProductivity: null };
    map.set(key, created);
    return created;
  }

  private recordEntityTrend(entry: TrendEntityAggregate, productivity: number, bucketStart: Date): void {
    if (entry.firstProductivity === null || bucketStart.getTime() <= (entry as TrendEntityAggregate & { firstAt?: number }).firstAt!) {
      entry.firstProductivity = productivity;
      (entry as TrendEntityAggregate & { firstAt?: number }).firstAt = bucketStart.getTime();
    }
    if (entry.lastProductivity === null || bucketStart.getTime() >= (entry as TrendEntityAggregate & { lastAt?: number }).lastAt!) {
      entry.lastProductivity = productivity;
      (entry as TrendEntityAggregate & { lastAt?: number }).lastAt = bucketStart.getTime();
    }
  }

  private trendEmployeeRow(entry: EmployeeProductivityAggregate, trend?: TrendEntityAggregate) {
    const classifiedSeconds = entry.durations.PRODUCTIVE + entry.durations.NEUTRAL + entry.durations.UNPRODUCTIVE;
    const totalSeconds = classifiedSeconds + entry.durations.UNCLASSIFIED;
    const first = trend?.firstProductivity ?? 0;
    const last = trend?.lastProductivity ?? first;
    return {
      employeeId: entry.employeeId,
      employeeCode: entry.employeeCode,
      employee: this.mapEmployee(entry.employee),
      department: this.mapOrgUnit(entry.employee.department),
      branch: this.mapOrgUnit(entry.employee.branch),
      productiveSeconds: entry.durations.PRODUCTIVE,
      neutralSeconds: entry.durations.NEUTRAL,
      unproductiveSeconds: entry.durations.UNPRODUCTIVE,
      unclassifiedSeconds: entry.durations.UNCLASSIFIED,
      productivityPercentage: this.productivityPercentage(entry.durations),
      coveragePercentage: this.coveragePercentage(classifiedSeconds, totalSeconds),
      topProductiveApp: this.topName(entry.productiveApps),
      topProductiveWebsite: this.topName(entry.productiveWebsites),
      changePercentage: this.roundPercent(last - first),
    };
  }

  private trendDepartmentRow(entry: DepartmentProductivityAggregate, trend?: TrendEntityAggregate) {
    const durations = {
      PRODUCTIVE: entry.productiveSeconds,
      NEUTRAL: entry.neutralSeconds,
      UNPRODUCTIVE: entry.unproductiveSeconds,
      UNCLASSIFIED: entry.unclassifiedSeconds,
    };
    const first = trend?.firstProductivity ?? 0;
    const last = trend?.lastProductivity ?? first;
    return {
      department: this.mapOrgUnit(entry.department),
      employeeCount: entry.employeeIds.size,
      productivityPercentage: this.productivityPercentage(durations),
      coveragePercentage: this.coveragePercentage(entry.productiveSeconds + entry.neutralSeconds + entry.unproductiveSeconds, entry.productiveSeconds + entry.neutralSeconds + entry.unproductiveSeconds + entry.unclassifiedSeconds),
      productiveSeconds: entry.productiveSeconds,
      unproductiveSeconds: entry.unproductiveSeconds,
      changePercentage: this.roundPercent(last - first),
    };
  }
  private async classifiedUsage(applications: AnalyticsApplicationUsage[], websites: AnalyticsWebsiteUsage[]) {
    const appNames = applications.map((usage) => this.safeNormalizeApplication(usage.applicationName));
    const hostnames = websites.map((usage) => this.safeNormalizeHostname(usage.domain));
    const companyIds = [...applications.map((usage) => usage.companyId), ...websites.map((usage) => usage.companyId)];
    const [applicationRules, websiteRules] = await Promise.all([
      this.classifier.applicationRuleMap(appNames, companyIds),
      this.classifier.websiteRuleMap(hostnames, companyIds),
    ]);
    return {
      applications: applications.map((usage) => {
        const normalizedName = this.safeNormalizeApplication(usage.applicationName);
        const classification = this.classifier.classificationFromMap(applicationRules, normalizedName, usage.companyId);
        return {
          employee: usage.employee,
          employeeId: usage.employeeId,
          companyId: usage.companyId,
          displayName: usage.applicationName,
          normalizedName,
          category: classification.category,
          durationSeconds: this.safeSeconds(usage.durationSeconds),
          startedAt: usage.startedAt,
          endedAt: usage.endedAt,
        };
      }),
      websites: websites.map((usage) => {
        const normalizedHostname = this.safeNormalizeHostname(usage.domain);
        const classification = this.classifier.classificationFromMap(websiteRules, normalizedHostname, usage.companyId);
        return {
          employee: usage.employee,
          employeeId: usage.employeeId,
          companyId: usage.companyId,
          displayName: usage.domain,
          normalizedHostname,
          category: classification.category,
          durationSeconds: this.safeSeconds(usage.durationSeconds),
          startedAt: usage.startedAt,
          endedAt: usage.endedAt,
        };
      }),
    };
  }

  private matchesCategory(category: ProductivityCategory, requested?: ProductivityCategory): boolean {
    return !requested || category === requested;
  }

  private addEmployeeApplicationUsage(map: Map<string, EmployeeUsageAggregate>, item: ClassifiedApplicationUsage): void {
    const existing = map.get(`${item.category}:${item.normalizedName}`) ?? {
      name: item.displayName,
      normalizedName: item.normalizedName,
      category: item.category,
      durationSeconds: 0,
      usageCount: 0,
      firstSeenAt: item.startedAt,
      lastSeenAt: item.endedAt,
    };
    existing.name = this.preferredName(existing.name, item.displayName);
    existing.durationSeconds += item.durationSeconds;
    existing.usageCount += 1;
    if (item.startedAt < existing.firstSeenAt) existing.firstSeenAt = item.startedAt;
    if (item.endedAt > existing.lastSeenAt) existing.lastSeenAt = item.endedAt;
    map.set(`${item.category}:${item.normalizedName}`, existing);
  }

  private addEmployeeWebsiteUsage(map: Map<string, EmployeeWebsiteUsageAggregate>, item: ClassifiedWebsiteUsage): void {
    const existing = map.get(`${item.category}:${item.normalizedHostname}`) ?? {
      hostname: item.displayName,
      normalizedHostname: item.normalizedHostname,
      category: item.category,
      durationSeconds: 0,
      usageCount: 0,
      firstSeenAt: item.startedAt,
      lastSeenAt: item.endedAt,
    };
    existing.hostname = this.preferredName(existing.hostname, item.displayName);
    existing.durationSeconds += item.durationSeconds;
    existing.usageCount += 1;
    if (item.startedAt < existing.firstSeenAt) existing.firstSeenAt = item.startedAt;
    if (item.endedAt > existing.lastSeenAt) existing.lastSeenAt = item.endedAt;
    map.set(`${item.category}:${item.normalizedHostname}`, existing);
  }

  private employeeApplications(map: Map<string, EmployeeUsageAggregate>) {
    return [...map.values()].sort((a, b) => b.durationSeconds - a.durationSeconds || a.name.localeCompare(b.name)).map((item) => ({
      name: item.name,
      normalizedName: item.normalizedName,
      category: item.category,
      durationSeconds: item.durationSeconds,
      usageCount: item.usageCount,
      firstSeenAt: item.firstSeenAt.toISOString(),
      lastSeenAt: item.lastSeenAt.toISOString(),
    }));
  }

  private employeeWebsites(map: Map<string, EmployeeWebsiteUsageAggregate>) {
    return [...map.values()].sort((a, b) => b.durationSeconds - a.durationSeconds || a.hostname.localeCompare(b.hostname)).map((item) => ({
      hostname: item.hostname,
      normalizedHostname: item.normalizedHostname,
      category: item.category,
      durationSeconds: item.durationSeconds,
      usageCount: item.usageCount,
      firstSeenAt: item.firstSeenAt.toISOString(),
      lastSeenAt: item.lastSeenAt.toISOString(),
    }));
  }

  private coverageEmployee(map: Map<string, CoverageEmployeeAggregate>, employee: AnalyticsEmployee): CoverageEmployeeAggregate {
    const existing = map.get(employee.id);
    if (existing) return existing;
    const created = { employee, classifiedSeconds: 0, unclassifiedSeconds: 0 };
    map.set(employee.id, created);
    return created;
  }

  private addCoverageApplication(map: Map<string, CoverageApplicationAggregate>, item: ClassifiedApplicationUsage): void {
    const existing = map.get(item.normalizedName) ?? { name: item.displayName, normalizedName: item.normalizedName, durationSeconds: 0, employeeIds: new Set<string>(), usageCount: 0, lastSeenAt: item.endedAt };
    existing.name = this.preferredName(existing.name, item.displayName);
    existing.durationSeconds += item.durationSeconds;
    existing.employeeIds.add(item.employeeId);
    existing.usageCount += 1;
    if (item.endedAt > existing.lastSeenAt) existing.lastSeenAt = item.endedAt;
    map.set(item.normalizedName, existing);
  }

  private addCoverageWebsite(map: Map<string, CoverageWebsiteAggregate>, item: ClassifiedWebsiteUsage): void {
    if (item.normalizedHostname === 'unknown') return;
    const existing = map.get(item.normalizedHostname) ?? { hostname: item.displayName, normalizedHostname: item.normalizedHostname, durationSeconds: 0, employeeIds: new Set<string>(), usageCount: 0, lastSeenAt: item.endedAt };
    existing.hostname = this.preferredName(existing.hostname, item.displayName);
    existing.durationSeconds += item.durationSeconds;
    existing.employeeIds.add(item.employeeId);
    existing.usageCount += 1;
    if (item.endedAt > existing.lastSeenAt) existing.lastSeenAt = item.endedAt;
    map.set(item.normalizedHostname, existing);
  }

  private topUnclassifiedApplications(map: Map<string, CoverageApplicationAggregate>) {
    return [...map.values()].sort((a, b) => b.durationSeconds - a.durationSeconds || a.name.localeCompare(b.name)).slice(0, 10).map((item) => ({
      name: item.name,
      normalizedName: item.normalizedName,
      durationSeconds: item.durationSeconds,
      employeeCount: item.employeeIds.size,
      usageCount: item.usageCount,
      lastSeenAt: item.lastSeenAt.toISOString(),
    }));
  }

  private topUnclassifiedWebsites(map: Map<string, CoverageWebsiteAggregate>) {
    return [...map.values()].sort((a, b) => b.durationSeconds - a.durationSeconds || a.hostname.localeCompare(b.hostname)).slice(0, 10).map((item) => ({
      hostname: item.hostname,
      normalizedHostname: item.normalizedHostname,
      durationSeconds: item.durationSeconds,
      employeeCount: item.employeeIds.size,
      usageCount: item.usageCount,
      lastSeenAt: item.lastSeenAt.toISOString(),
    }));
  }

  private coveragePercentage(classifiedSeconds: number, totalSeconds: number): number {
    if (totalSeconds <= 0) return 0;
    return this.roundPercent((classifiedSeconds / totalSeconds) * 100);
  }

  private csv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
    const content = [headers, ...rows].map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\r\n');
    return { filename, content: `\uFEFF${content}\r\n` };
  }

  private csvCell(value: string | number | null | undefined): string {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }
  private addDepartmentDuration(map: Map<string, DepartmentProductivityAggregate>, employee: AnalyticsEmployee, category: ProductivityCategory, durationSeconds: number): void {
    const key = employee.departmentId ?? 'UNASSIGNED';
    const existing = map.get(key) ?? {
      department: employee.department,
      employeeIds: new Set<string>(),
      productiveSeconds: 0,
      neutralSeconds: 0,
      unproductiveSeconds: 0,
      unclassifiedSeconds: 0,
    };
    existing.employeeIds.add(employee.id);
    if (category === ProductivityCategory.PRODUCTIVE) existing.productiveSeconds += durationSeconds;
    if (category === ProductivityCategory.NEUTRAL) existing.neutralSeconds += durationSeconds;
    if (category === ProductivityCategory.UNPRODUCTIVE) existing.unproductiveSeconds += durationSeconds;
    if (category === ProductivityCategory.UNCLASSIFIED) existing.unclassifiedSeconds += durationSeconds;
    map.set(key, existing);
  }

  private addApplicationAggregate(map: Map<string, NamedDurationAggregate>, normalizedName: string, displayName: string, category: ProductivityCategory, durationSeconds: number, employeeId: string): void {
    const key = `${category}:${normalizedName}`;
    const existing = map.get(key) ?? { name: displayName, normalizedName, category, durationSeconds: 0, employeeIds: new Set<string>() };
    existing.name = this.preferredName(existing.name, displayName);
    existing.durationSeconds += durationSeconds;
    existing.employeeIds.add(employeeId);
    map.set(key, existing);
  }

  private addWebsiteAggregate(map: Map<string, WebsiteDurationAggregate>, normalizedHostname: string, hostname: string, category: ProductivityCategory, durationSeconds: number, employeeId: string): void {
    const key = `${category}:${normalizedHostname}`;
    const existing = map.get(key) ?? { hostname, normalizedHostname, category, durationSeconds: 0, employeeIds: new Set<string>() };
    existing.hostname = this.preferredName(existing.hostname, hostname);
    existing.durationSeconds += durationSeconds;
    existing.employeeIds.add(employeeId);
    map.set(key, existing);
  }

  private topApplications(map: Map<string, NamedDurationAggregate>, category: ProductivityCategory) {
    return [...map.values()]
      .filter((item) => item.category === category)
      .sort((a, b) => b.durationSeconds - a.durationSeconds || a.name.localeCompare(b.name))
      .slice(0, 10)
      .map((item) => ({
        name: item.name,
        normalizedName: item.normalizedName,
        category: item.category,
        durationSeconds: item.durationSeconds,
        employeeCount: item.employeeIds.size,
      }));
  }

  private topWebsites(map: Map<string, WebsiteDurationAggregate>, category: ProductivityCategory) {
    return [...map.values()]
      .filter((item) => item.category === category)
      .sort((a, b) => b.durationSeconds - a.durationSeconds || a.hostname.localeCompare(b.hostname))
      .slice(0, 10)
      .map((item) => ({
        hostname: item.hostname,
        normalizedHostname: item.normalizedHostname,
        category: item.category,
        durationSeconds: item.durationSeconds,
        employeeCount: item.employeeIds.size,
      }));
  }

  private timelineSegment(
    employeeId: string,
    category: ProductivityCategory,
    source: UsageSource,
    start: Date,
    end: Date,
    durationSeconds: number,
    title: string,
    metadata: Record<string, string | null>,
  ) {
    return {
      employeeId,
      category,
      source,
      start: start.toISOString(),
      end: end.toISOString(),
      durationSeconds,
      title,
      metadata,
    };
  }

  private addMapDuration(map: Map<string, number>, name: string, durationSeconds: number): void {
    map.set(name, (map.get(name) ?? 0) + durationSeconds);
  }

  private topName(map: Map<string, number>): string | null {
    const [top] = [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return top?.[0] ?? null;
  }

  private productivityPercentage(durations: CategorySeconds): number {
    const denominator = durations.PRODUCTIVE + durations.NEUTRAL + durations.UNPRODUCTIVE;
    if (denominator <= 0) return 0;
    return this.roundPercent((durations.PRODUCTIVE / denominator) * 100);
  }

  private averageProductivity(values: number[]): number {
    if (values.length === 0) return 0;
    return this.roundPercent(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  private roundPercent(value: number): number {
    return Math.min(100, Math.max(0, Number(value.toFixed(2))));
  }

  private emptyDurations(): CategorySeconds {
    return {
      PRODUCTIVE: 0,
      NEUTRAL: 0,
      UNPRODUCTIVE: 0,
      UNCLASSIFIED: 0,
    };
  }

  private safeSeconds(value: number | null | undefined): number {
    return Math.max(0, Math.round(value ?? 0));
  }

  private safeNormalizeApplication(value: string): string {
    try {
      return this.classifier.normalizeApplicationName(value);
    } catch {
      return 'unknown';
    }
  }

  private safeNormalizeHostname(value: string): string {
    try {
      return this.classifier.normalizeHostname(value);
    } catch {
      return 'unknown';
    }
  }

  private preferredName(current: string, candidate: string): string {
    const cleanCandidate = candidate.trim();
    if (!cleanCandidate) return current;
    if (current.trim().toLowerCase() === 'unknown') return cleanCandidate;
    return current;
  }

  private mapEmployee(employee: AnalyticsEmployee) {
    return {
      id: employee.id,
      employeeCode: employee.employeeCode,
      name: `${employee.user.firstName ?? ''} ${employee.user.lastName ?? ''}`.trim() || employee.user.email,
      email: employee.user.email,
    };
  }

  private mapOrgUnit(unit: AnalyticsEmployee['department'] | AnalyticsEmployee['branch']) {
    if (!unit) return null;
    return { id: unit.id, name: unit.name, code: unit.code };
  }

  private async employeeVisibilityWhere(actor: AuthenticatedUser): Promise<Prisma.EmployeeWhereInput> {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return {};
    if (actor.roles.includes(RoleName.COMPANY_ADMIN) || actor.roles.includes(RoleName.HR)) {
      if (!actor.companyId) throw new ForbiddenException('Tenant is required');
      return { companyId: actor.companyId };
    }
    const own = await this.prisma.employee.findFirst({ where: { userId: actor.id, deletedAt: null }, select: { id: true } });
    if (!own) return { id: '__missing_employee__' };
    if (actor.roles.includes(RoleName.MANAGER)) return { OR: [{ id: own.id }, { reportingManagerId: own.id }] };
    return { id: own.id };
  }

  private assertAnalyticsCompanyFilter(query: ProductivityAnalyticsQueryDto, actor: AuthenticatedUser): void {
    if (!query.companyId || actor.roles.includes(RoleName.SUPER_ADMIN)) return;
    if (!actor.companyId || query.companyId !== actor.companyId) {
      throw new ForbiddenException('Cannot view another company productivity analytics');
    }
  }

  private dateRange(query: { dateFrom?: string; dateTo?: string }): { gte: Date; lte: Date } {
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = query.dateFrom ? new Date(this.normalizeDateRangeBoundary(query.dateFrom, 'start')) : defaultFrom;
    const to = query.dateTo ? new Date(this.normalizeDateRangeBoundary(query.dateTo, 'end')) : now;
    if (from > to) throw new BadRequestException('dateFrom must not be after dateTo');
    return { gte: from, lte: to };
  }

  private normalizeDateRangeBoundary(value: string, boundary: 'start' | 'end'): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return boundary === 'start' ? `${value}T00:00:00.000Z` : `${value}T23:59:59.999Z`;
  }

  private async applicationForWrite(id: string, actor: AuthenticatedUser) {
    const rule = await this.prisma.applicationProductivityRule.findFirst({ where: { id, deletedAt: null } });
    if (!rule) throw new NotFoundException('Application productivity rule not found');
    this.assertCanWriteRule(rule.companyId, actor);
    return rule;
  }

  private async websiteForWrite(id: string, actor: AuthenticatedUser) {
    const rule = await this.prisma.websiteProductivityRule.findFirst({ where: { id, deletedAt: null } });
    if (!rule) throw new NotFoundException('Website productivity rule not found');
    this.assertCanWriteRule(rule.companyId, actor);
    return rule;
  }

  private resolveWriteScope(actor: AuthenticatedUser, requestedCompanyId?: string) {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) {
      return { companyId: requestedCompanyId ?? null, scope: requestedCompanyId ?? 'GLOBAL' };
    }
    if (!actor.roles.includes(RoleName.COMPANY_ADMIN) && !actor.roles.includes(RoleName.HR)) {
      throw new ForbiddenException('Productivity classification management is not allowed');
    }
    if (!actor.companyId) throw new ForbiddenException('Tenant is required');
    if (requestedCompanyId && requestedCompanyId !== actor.companyId) {
      throw new ForbiddenException('Cannot manage another company productivity rules');
    }
    return { companyId: actor.companyId, scope: actor.companyId };
  }

  private readScopeWhere(actor: AuthenticatedUser, scope?: 'GLOBAL' | 'COMPANY') {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) {
      if (scope === 'GLOBAL') return { companyId: null };
      if (scope === 'COMPANY') return { companyId: { not: null } };
      return {};
    }
    if (!actor.companyId) throw new ForbiddenException('Tenant is required');
    if (scope === 'GLOBAL') return { companyId: null };
    if (scope === 'COMPANY') return { companyId: actor.companyId };
    return { OR: [{ companyId: null }, { companyId: actor.companyId }] };
  }

  private assertCanWriteRule(companyId: string | null, actor: AuthenticatedUser): void {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return;
    if (!actor.roles.includes(RoleName.COMPANY_ADMIN) && !actor.roles.includes(RoleName.HR)) {
      throw new ForbiddenException('Productivity classification management is not allowed');
    }
    if (!actor.companyId || companyId !== actor.companyId) {
      throw new ForbiddenException('Cannot manage this productivity rule');
    }
  }

  private classificationCompanyId(actor: AuthenticatedUser, requestedCompanyId?: string): string | null {
    if (actor.roles.includes(RoleName.SUPER_ADMIN)) return requestedCompanyId ?? null;
    return actor.companyId ?? null;
  }

  private mapApplication(rule: ApplicationProductivityRule) {
    return {
      id: rule.id,
      companyId: rule.companyId,
      scopeType: rule.companyId ? 'COMPANY' as const : 'GLOBAL' as const,
      applicationName: rule.applicationName,
      normalizedName: rule.normalizedName,
      category: rule.category,
      notes: rule.notes,
      enabled: rule.enabled,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  private mapWebsite(rule: WebsiteProductivityRule) {
    return {
      id: rule.id,
      companyId: rule.companyId,
      scopeType: rule.companyId ? 'COMPANY' as const : 'GLOBAL' as const,
      hostname: rule.hostname,
      normalizedHostname: rule.normalizedHostname,
      category: rule.category,
      notes: rule.notes,
      enabled: rule.enabled,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  private optionalText(value?: string): string | null | undefined {
    if (value === undefined) return undefined;
    return value.trim() || null;
  }

  private async audit(actor: AuthenticatedUser, companyId: string | null, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: {
        companyId,
        actorUserId: actor.id,
        action,
        entityType,
        entityId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private throwConflict(error: unknown, message: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(message);
    }
    throw error;
  }
}
