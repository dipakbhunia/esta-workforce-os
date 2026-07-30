import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MonitoringAlertSeverity, MonitoringAlertStatus, MonitoringAlertType } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

export class MonitoringOperationsQueryDto {
  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() dateFrom?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsDateString() @IsOptional() dateTo?: string;
  @ApiPropertyOptional({ enum: ['DAY', 'WEEK', 'MONTH'], default: 'DAY' }) @IsIn(['DAY', 'WEEK', 'MONTH']) @IsOptional() groupBy?: 'DAY' | 'WEEK' | 'MONTH' = 'DAY';
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() companyId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() branchId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() departmentId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsUUID() @IsOptional() employeeId?: string;
  @ApiPropertyOptional({ enum: MonitoringAlertType }) @IsEnum(MonitoringAlertType) @IsOptional() alertType?: MonitoringAlertType;
  @ApiPropertyOptional({ enum: MonitoringAlertSeverity }) @IsEnum(MonitoringAlertSeverity) @IsOptional() severity?: MonitoringAlertSeverity;
  @ApiPropertyOptional({ enum: MonitoringAlertStatus }) @IsEnum(MonitoringAlertStatus) @IsOptional() status?: MonitoringAlertStatus;
}

export class MonitoringOperationsReportQueryDto extends MonitoringOperationsQueryDto {
  @ApiPropertyOptional({ enum: ['CSV', 'PDF'], default: 'CSV' }) @IsIn(['CSV', 'PDF']) @IsOptional() format?: 'CSV' | 'PDF' = 'CSV';
}

export class OperationsKpiDto {
  @ApiProperty() openAlerts!: number;
  @ApiProperty() criticalAlerts!: number;
  @ApiProperty() acknowledgedAlerts!: number;
  @ApiProperty() resolvedToday!: number;
  @ApiProperty() unreadNotifications!: number;
  @ApiProperty() notificationSuccessPercentage!: number;
  @ApiProperty() emailDeliverySuccessPercentage!: number;
  @ApiProperty() averageMttaMinutes!: number | null;
  @ApiProperty() averageMttrMinutes!: number | null;
  @ApiProperty() monitoringCoveragePercentage!: number;
  @ApiProperty() productivityCoveragePercentage!: number;
}

export class OperationsTrendPointDto {
  @ApiProperty() bucket!: string;
  @ApiProperty() openAlerts!: number;
  @ApiProperty() resolvedAlerts!: number;
  @ApiProperty() criticalAlerts!: number;
  @ApiProperty() warningAlerts!: number;
  @ApiProperty() infoAlerts!: number;
}

export class OperationsSlaMetricDto {
  @ApiProperty() averageMinutes!: number | null;
  @ApiProperty() medianMinutes!: number | null;
  @ApiProperty() minMinutes!: number | null;
  @ApiProperty() maxMinutes!: number | null;
  @ApiProperty() samples!: number;
  @ApiProperty({ type: [Object] }) distribution!: Array<{ label: string; count: number }>;
}

export class OperationsRankingDto {
  @ApiProperty() id!: string;
  @ApiProperty() label!: string;
  @ApiProperty() count!: number;
  @ApiPropertyOptional() secondary?: string | null;
}

export class OperationsMonitoringHealthDto {
  @ApiProperty() devicesOnline!: number;
  @ApiProperty() devicesOffline!: number;
  @ApiProperty() devicesRevoked!: number;
  @ApiProperty() heartbeatHealthy!: number;
  @ApiProperty() screenshotHealthy!: number;
  @ApiProperty() monitoringEnabledPercentage!: number;
  @ApiProperty() policyCoveragePercentage!: number;
}

export class OperationsNotificationAnalyticsDto {
  @ApiProperty() inAppSent!: number;
  @ApiProperty() emailSent!: number;
  @ApiProperty() emailFailed!: number;
  @ApiProperty() pendingRetry!: number;
  @ApiProperty() retrySuccessPercentage!: number;
  @ApiProperty() averageDeliverySeconds!: number | null;
  @ApiProperty() deliveryFailurePercentage!: number;
}

export class OperationsExecutiveSummaryDto {
  @ApiProperty() score!: number;
  @ApiProperty() rating!: 'Excellent' | 'Good' | 'Needs Attention' | 'Critical';
  @ApiProperty() formula!: string;
}

export class MonitoringOperationsDashboardResponseDto {
  @ApiProperty({ type: OperationsKpiDto }) kpis!: OperationsKpiDto;
  @ApiProperty({ type: [OperationsTrendPointDto] }) trend!: OperationsTrendPointDto[];
  @ApiProperty() heatmaps!: Record<string, Array<{ label: string; count: number }>>;
  @ApiProperty() rankings!: Record<string, OperationsRankingDto[]>;
  @ApiProperty() sla!: { mtta: OperationsSlaMetricDto; mttr: OperationsSlaMetricDto };
  @ApiProperty({ type: OperationsMonitoringHealthDto }) monitoringHealth!: OperationsMonitoringHealthDto;
  @ApiProperty({ type: OperationsNotificationAnalyticsDto }) notificationAnalytics!: OperationsNotificationAnalyticsDto;
  @ApiProperty({ type: OperationsExecutiveSummaryDto }) executiveSummary!: OperationsExecutiveSummaryDto;
  @ApiProperty() generatedAt!: Date;
}
