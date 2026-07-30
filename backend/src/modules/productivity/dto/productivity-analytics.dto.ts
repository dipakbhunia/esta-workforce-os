import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductivityCategory } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { MonitoringEmployeeDto, MonitoringOrgUnitDto } from '../../monitoring/dto/monitoring-read-response.dto';

export class ProductivityAnalyticsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID()
  @IsOptional()
  companyId?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100, description: 'Alias for limit used by analytics tables.' })
  @Transform(({ value }) => (value === undefined || value === null || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number;
}

export class ProductivityAnalyticsSummaryDto {
  @ApiProperty({ example: 14400 })
  totalProductiveSeconds!: number;

  @ApiProperty({ example: 3600 })
  totalNeutralSeconds!: number;

  @ApiProperty({ example: 1800 })
  totalUnproductiveSeconds!: number;

  @ApiProperty({ example: 900 })
  totalUnclassifiedSeconds!: number;

  @ApiProperty({ example: 72.73 })
  productivityPercentage!: number;

  @ApiProperty({ example: 68.25 })
  averageProductivityPercentage!: number;
}

export class ProductivityAnalyticsEmployeeDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  branch!: MonitoringOrgUnitDto | null;

  @ApiProperty({ example: 14400 })
  productiveSeconds!: number;

  @ApiProperty({ example: 3600 })
  neutralSeconds!: number;

  @ApiProperty({ example: 1800 })
  unproductiveSeconds!: number;

  @ApiProperty({ example: 900 })
  unclassifiedSeconds!: number;

  @ApiProperty({ example: 72.73 })
  productivityPercentage!: number;

  @ApiPropertyOptional({ nullable: true, example: 'Visual Studio Code' })
  topProductiveApp!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'github.com' })
  topProductiveWebsite!: string | null;
}

export class ProductivityAnalyticsUsageItemDto {
  @ApiProperty({ example: 'Visual Studio Code' })
  name!: string;

  @ApiProperty({ example: 'visual studio code' })
  normalizedName!: string;

  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;

  @ApiProperty({ example: 7200 })
  durationSeconds!: number;

  @ApiProperty({ example: 3 })
  employeeCount!: number;
}

export class ProductivityAnalyticsWebsiteItemDto {
  @ApiProperty({ example: 'github.com' })
  hostname!: string;

  @ApiProperty({ example: 'github.com' })
  normalizedHostname!: string;

  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;

  @ApiProperty({ example: 7200 })
  durationSeconds!: number;

  @ApiProperty({ example: 3 })
  employeeCount!: number;
}

export class ProductivityAnalyticsDepartmentDto {
  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiProperty({ example: 12 })
  employeeCount!: number;

  @ApiProperty({ example: 72.73 })
  productivityPercentage!: number;

  @ApiProperty({ example: 28800 })
  productiveSeconds!: number;

  @ApiProperty({ example: 3600 })
  unproductiveSeconds!: number;
}

export class ProductivityAnalyticsTimelineSegmentDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;

  @ApiProperty({ enum: ['APPLICATION', 'WEBSITE'] })
  source!: 'APPLICATION' | 'WEBSITE';

  @ApiProperty({ format: 'date-time' })
  start!: string;

  @ApiProperty({ format: 'date-time' })
  end!: string;

  @ApiProperty({ example: 600 })
  durationSeconds!: number;

  @ApiProperty({ example: 'Visual Studio Code' })
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  metadata!: Record<string, string | null> | null;
}

export class ProductivityAnalyticsPaginationDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export class ProductivityAnalyticsRangeDto {
  @ApiProperty({ format: 'date-time' })
  from!: string;

  @ApiProperty({ format: 'date-time' })
  to!: string;
}

export class ProductivityAnalyticsResponseDto {
  @ApiProperty({ type: ProductivityAnalyticsSummaryDto })
  summary!: ProductivityAnalyticsSummaryDto;

  @ApiProperty({ type: [ProductivityAnalyticsEmployeeDto] })
  employees!: ProductivityAnalyticsEmployeeDto[];

  @ApiProperty({ type: [ProductivityAnalyticsUsageItemDto] })
  topProductiveApps!: ProductivityAnalyticsUsageItemDto[];

  @ApiProperty({ type: [ProductivityAnalyticsUsageItemDto] })
  topNeutralApps!: ProductivityAnalyticsUsageItemDto[];

  @ApiProperty({ type: [ProductivityAnalyticsUsageItemDto] })
  topUnproductiveApps!: ProductivityAnalyticsUsageItemDto[];

  @ApiProperty({ type: [ProductivityAnalyticsWebsiteItemDto] })
  topProductiveWebsites!: ProductivityAnalyticsWebsiteItemDto[];

  @ApiProperty({ type: [ProductivityAnalyticsWebsiteItemDto] })
  topNeutralWebsites!: ProductivityAnalyticsWebsiteItemDto[];

  @ApiProperty({ type: [ProductivityAnalyticsWebsiteItemDto] })
  topUnproductiveWebsites!: ProductivityAnalyticsWebsiteItemDto[];

  @ApiProperty({ type: [ProductivityAnalyticsDepartmentDto] })
  departments!: ProductivityAnalyticsDepartmentDto[];

  @ApiProperty({ type: [ProductivityAnalyticsTimelineSegmentDto] })
  timeline!: ProductivityAnalyticsTimelineSegmentDto[];

  @ApiProperty({ type: ProductivityAnalyticsPaginationDto })
  pagination!: ProductivityAnalyticsPaginationDto;

  @ApiProperty({ type: ProductivityAnalyticsRangeDto })
  range!: ProductivityAnalyticsRangeDto;
}

export enum ProductivityUsageSourceDto {
  APPLICATION = 'APPLICATION',
  WEBSITE = 'WEBSITE',
  ALL = 'ALL',
}

export class ProductivityEmployeeDetailsQueryDto extends ProductivityAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ProductivityCategory })
  @IsEnum(ProductivityCategory)
  @IsOptional()
  category?: ProductivityCategory;

  @ApiPropertyOptional({ enum: ProductivityUsageSourceDto, default: ProductivityUsageSourceDto.ALL })
  @IsEnum(ProductivityUsageSourceDto)
  @IsOptional()
  source?: ProductivityUsageSourceDto;
}

export class ProductivityCoverageQueryDto extends ProductivityAnalyticsQueryDto {}

export class ProductivityCoverageSummaryDto {
  @ApiProperty({ example: 32400 })
  totalTrackedSeconds!: number;

  @ApiProperty({ example: 28800 })
  classifiedSeconds!: number;

  @ApiProperty({ example: 3600 })
  unclassifiedSeconds!: number;

  @ApiProperty({ example: 88.89 })
  classificationCoveragePercentage!: number;

  @ApiProperty({ example: 4 })
  unclassifiedApplicationCount!: number;

  @ApiProperty({ example: 2 })
  unclassifiedWebsiteCount!: number;

  @ApiProperty({ example: 7 })
  employeesAffected!: number;
}

export class ProductivityCoverageApplicationDto {
  @ApiProperty({ example: 'Unknown Application' })
  name!: string;

  @ApiProperty({ example: 'unknown application' })
  normalizedName!: string;

  @ApiProperty({ example: 1800 })
  durationSeconds!: number;

  @ApiProperty({ example: 3 })
  employeeCount!: number;

  @ApiProperty({ example: 12 })
  usageCount!: number;

  @ApiProperty({ format: 'date-time' })
  lastSeenAt!: string;
}

export class ProductivityCoverageWebsiteDto {
  @ApiProperty({ example: 'example.com' })
  hostname!: string;

  @ApiProperty({ example: 'example.com' })
  normalizedHostname!: string;

  @ApiProperty({ example: 1800 })
  durationSeconds!: number;

  @ApiProperty({ example: 3 })
  employeeCount!: number;

  @ApiProperty({ example: 12 })
  usageCount!: number;

  @ApiProperty({ format: 'date-time' })
  lastSeenAt!: string;
}

export class ProductivityEmployeeCoverageDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  branch!: MonitoringOrgUnitDto | null;

  @ApiProperty({ example: 28800 })
  classifiedSeconds!: number;

  @ApiProperty({ example: 3600 })
  unclassifiedSeconds!: number;

  @ApiProperty({ example: 88.89 })
  coveragePercentage!: number;
}

export class ProductivityCoverageResponseDto {
  @ApiProperty({ type: ProductivityCoverageSummaryDto })
  summary!: ProductivityCoverageSummaryDto;

  @ApiProperty({ type: [ProductivityCoverageApplicationDto] })
  topUnclassifiedApplications!: ProductivityCoverageApplicationDto[];

  @ApiProperty({ type: [ProductivityCoverageWebsiteDto] })
  topUnclassifiedWebsites!: ProductivityCoverageWebsiteDto[];

  @ApiProperty({ type: [ProductivityEmployeeCoverageDto] })
  employeeCoverage!: ProductivityEmployeeCoverageDto[];

  @ApiProperty({ type: ProductivityAnalyticsPaginationDto })
  pagination!: ProductivityAnalyticsPaginationDto;

  @ApiProperty({ type: ProductivityAnalyticsRangeDto })
  range!: ProductivityAnalyticsRangeDto;
}

export class ProductivityEmployeeUsageDto {
  @ApiProperty({ example: 'Visual Studio Code' })
  name!: string;

  @ApiProperty({ example: 'visual studio code' })
  normalizedName!: string;

  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;

  @ApiProperty({ example: 7200 })
  durationSeconds!: number;

  @ApiProperty({ example: 8 })
  usageCount!: number;

  @ApiProperty({ format: 'date-time' })
  firstSeenAt!: string;

  @ApiProperty({ format: 'date-time' })
  lastSeenAt!: string;
}

export class ProductivityEmployeeWebsiteUsageDto {
  @ApiProperty({ example: 'github.com' })
  hostname!: string;

  @ApiProperty({ example: 'github.com' })
  normalizedHostname!: string;

  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;

  @ApiProperty({ example: 7200 })
  durationSeconds!: number;

  @ApiProperty({ example: 8 })
  usageCount!: number;

  @ApiProperty({ format: 'date-time' })
  firstSeenAt!: string;

  @ApiProperty({ format: 'date-time' })
  lastSeenAt!: string;
}

export class ProductivityEmployeeTimelineDto {
  @ApiProperty({ format: 'date-time' })
  startedAt!: string;

  @ApiProperty({ format: 'date-time' })
  endedAt!: string;

  @ApiProperty({ example: 600 })
  durationSeconds!: number;

  @ApiProperty({ enum: ['APPLICATION', 'WEBSITE'] })
  source!: 'APPLICATION' | 'WEBSITE';

  @ApiProperty({ example: 'Visual Studio Code' })
  displayName!: string;

  @ApiProperty({ enum: ProductivityCategory })
  category!: ProductivityCategory;
}

export class ProductivityEmployeeDetailsSummaryDto {
  @ApiProperty({ example: 14400 })
  productiveSeconds!: number;

  @ApiProperty({ example: 3600 })
  neutralSeconds!: number;

  @ApiProperty({ example: 1800 })
  unproductiveSeconds!: number;

  @ApiProperty({ example: 900 })
  unclassifiedSeconds!: number;

  @ApiProperty({ example: 19800 })
  classifiedSeconds!: number;

  @ApiProperty({ example: 20700 })
  totalSeconds!: number;

  @ApiProperty({ example: 72.73 })
  productivityPercentage!: number;

  @ApiProperty({ example: 95.65 })
  classificationCoveragePercentage!: number;
}

export class ProductivityEmployeeDetailsResponseDto {
  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  branch!: MonitoringOrgUnitDto | null;

  @ApiProperty({ type: ProductivityAnalyticsRangeDto })
  range!: ProductivityAnalyticsRangeDto;

  @ApiProperty({ type: ProductivityEmployeeDetailsSummaryDto })
  summary!: ProductivityEmployeeDetailsSummaryDto;

  @ApiProperty({ type: [ProductivityEmployeeUsageDto] })
  applications!: ProductivityEmployeeUsageDto[];

  @ApiProperty({ type: [ProductivityEmployeeWebsiteUsageDto] })
  websites!: ProductivityEmployeeWebsiteUsageDto[];

  @ApiProperty({ type: [ProductivityEmployeeTimelineDto] })
  timeline!: ProductivityEmployeeTimelineDto[];

  @ApiProperty({ type: ProductivityAnalyticsPaginationDto })
  pagination!: ProductivityAnalyticsPaginationDto;
}

export enum ProductivityTrendGroupByDto {
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export class ProductivityTrendsQueryDto extends ProductivityAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: ProductivityTrendGroupByDto, default: ProductivityTrendGroupByDto.DAY })
  @IsEnum(ProductivityTrendGroupByDto)
  @IsOptional()
  groupBy?: ProductivityTrendGroupByDto;
}

export class ProductivityTrendSummaryDto {
  @ApiProperty({ example: 72.73 })
  productivityPercentage!: number;

  @ApiProperty({ example: 89.45 })
  coveragePercentage!: number;

  @ApiProperty({ example: 14400 })
  productiveSeconds!: number;

  @ApiProperty({ example: 3600 })
  neutralSeconds!: number;

  @ApiProperty({ example: 1800 })
  unproductiveSeconds!: number;

  @ApiProperty({ example: 900 })
  unclassifiedSeconds!: number;

  @ApiProperty({ example: 20700 })
  totalSeconds!: number;
}

export class ProductivityTrendPointDto extends ProductivityTrendSummaryDto {
  @ApiProperty({ example: '2026-07-01' })
  bucket!: string;

  @ApiProperty({ format: 'date-time' })
  start!: string;

  @ApiProperty({ format: 'date-time' })
  end!: string;
}

export class ProductivityDepartmentTrendDto extends ProductivityTrendPointDto {
  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;
}

export class ProductivityEmployeeTrendDto extends ProductivityTrendPointDto {
  @ApiProperty({ format: 'uuid' })
  employeeId!: string;

  @ApiProperty({ example: 'EMP-001' })
  employeeCode!: string;

  @ApiProperty({ type: MonitoringEmployeeDto })
  employee!: MonitoringEmployeeDto;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  department!: MonitoringOrgUnitDto | null;

  @ApiPropertyOptional({ type: MonitoringOrgUnitDto, nullable: true })
  branch!: MonitoringOrgUnitDto | null;
}

export class ProductivityRankingEmployeeDto extends ProductivityAnalyticsEmployeeDto {
  @ApiProperty({ example: 95.65 })
  coveragePercentage!: number;

  @ApiProperty({ example: 6.5 })
  changePercentage!: number;
}

export class ProductivityRankingDepartmentDto extends ProductivityAnalyticsDepartmentDto {
  @ApiProperty({ example: 95.65 })
  coveragePercentage!: number;

  @ApiProperty({ example: -4.2 })
  changePercentage!: number;
}

export class ProductivityBenchmarkDto {
  @ApiProperty({ example: 72.73 })
  companyAverageProductivity!: number;

  @ApiProperty({ example: 89.45 })
  companyAverageCoverage!: number;

  @ApiPropertyOptional({ example: 68.12, nullable: true })
  selectedDepartmentProductivity!: number | null;

  @ApiPropertyOptional({ example: 88.12, nullable: true })
  selectedDepartmentCoverage!: number | null;

  @ApiPropertyOptional({ example: 75.5, nullable: true })
  selectedEmployeeProductivity!: number | null;

  @ApiPropertyOptional({ example: 91.2, nullable: true })
  selectedEmployeeCoverage!: number | null;
}

export class ProductivityTrendsResponseDto {
  @ApiProperty({ type: ProductivityTrendSummaryDto })
  summary!: ProductivityTrendSummaryDto;

  @ApiProperty({ type: [ProductivityTrendPointDto] })
  trendPoints!: ProductivityTrendPointDto[];

  @ApiProperty({ type: [ProductivityDepartmentTrendDto] })
  departmentTrend!: ProductivityDepartmentTrendDto[];

  @ApiProperty({ type: [ProductivityEmployeeTrendDto] })
  employeeTrend!: ProductivityEmployeeTrendDto[];

  @ApiProperty({ type: [ProductivityRankingEmployeeDto] })
  topProductiveEmployees!: ProductivityRankingEmployeeDto[];

  @ApiProperty({ type: [ProductivityRankingEmployeeDto] })
  bottomProductivityEmployees!: ProductivityRankingEmployeeDto[];

  @ApiProperty({ type: [ProductivityRankingDepartmentDto] })
  topProductiveDepartments!: ProductivityRankingDepartmentDto[];

  @ApiProperty({ type: [ProductivityRankingDepartmentDto] })
  bottomProductivityDepartments!: ProductivityRankingDepartmentDto[];

  @ApiProperty({ type: [ProductivityRankingEmployeeDto] })
  mostImprovedEmployees!: ProductivityRankingEmployeeDto[];

  @ApiProperty({ type: [ProductivityRankingEmployeeDto] })
  largestProductivityDrop!: ProductivityRankingEmployeeDto[];

  @ApiProperty({ type: ProductivityBenchmarkDto })
  benchmarks!: ProductivityBenchmarkDto;

  @ApiProperty({ enum: ProductivityTrendGroupByDto })
  groupBy!: ProductivityTrendGroupByDto;

  @ApiProperty({ type: ProductivityAnalyticsRangeDto })
  range!: ProductivityAnalyticsRangeDto;
}
