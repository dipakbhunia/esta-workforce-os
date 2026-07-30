import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { MonitoringAlertSeverity, NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';

export class NotificationQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() read?: boolean;
  @ApiPropertyOptional({ enum: MonitoringAlertSeverity }) @IsOptional() @IsEnum(MonitoringAlertSeverity) severity?: MonitoringAlertSeverity;
  @ApiPropertyOptional({ enum: NotificationType }) @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
  @ApiPropertyOptional() @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class NotificationDeliveryQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) page?: number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(100) pageSize?: number = 20;
  @ApiPropertyOptional({ enum: NotificationStatus }) @IsOptional() @IsEnum(NotificationStatus) status?: NotificationStatus;
  @ApiPropertyOptional({ enum: NotificationChannel }) @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() recipient?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTo?: string;
}

export class NotificationPreferenceUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() inAppEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() criticalAlerts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() warningAlerts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() infoAlerts?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() alertOpened?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() alertResolved?: boolean;
  @ApiPropertyOptional({ example: '22:00' }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) quietHoursStart?: string | null;
  @ApiPropertyOptional({ example: '07:00' }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) quietHoursEnd?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string | null;
}

export class NotificationEmployeeSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() employeeCode!: string;
  @ApiProperty() name!: string;
  @ApiProperty() email!: string;
}

export class NotificationDeviceSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() platform!: string;
}

export class NotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty() title!: string;
  @ApiProperty() message!: string;
  @ApiPropertyOptional({ enum: MonitoringAlertSeverity }) severity?: MonitoringAlertSeverity | null;
  @ApiPropertyOptional() readAt?: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() alertId?: string | null;
  @ApiPropertyOptional() alertStatus?: string | null;
  @ApiPropertyOptional({ type: NotificationEmployeeSummaryDto }) employee?: NotificationEmployeeSummaryDto | null;
  @ApiPropertyOptional({ type: NotificationDeviceSummaryDto }) device?: NotificationDeviceSummaryDto | null;
  @ApiPropertyOptional() detailsPath?: string | null;
}

export class NotificationSummaryDto {
  @ApiProperty() unread!: number;
  @ApiProperty() criticalUnread!: number;
  @ApiProperty() totalFiltered!: number;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] }) data!: NotificationResponseDto[];
  @ApiProperty() meta!: { page: number; limit: number; total: number; totalPages: number };
  @ApiProperty({ type: NotificationSummaryDto }) summary!: NotificationSummaryDto;
}

export class NotificationUnreadCountResponseDto {
  @ApiProperty() unread!: number;
  @ApiProperty() criticalUnread!: number;
}

export class NotificationPreferenceResponseDto {
  @ApiProperty() inAppEnabled!: boolean;
  @ApiProperty() emailEnabled!: boolean;
  @ApiProperty() criticalAlerts!: boolean;
  @ApiProperty() warningAlerts!: boolean;
  @ApiProperty() infoAlerts!: boolean;
  @ApiProperty() alertOpened!: boolean;
  @ApiProperty() alertResolved!: boolean;
  @ApiPropertyOptional() quietHoursStart?: string | null;
  @ApiPropertyOptional() quietHoursEnd?: string | null;
  @ApiPropertyOptional() timezone?: string | null;
}

export class NotificationDeliveryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() notificationId!: string;
  @ApiProperty({ enum: NotificationChannel }) channel!: NotificationChannel;
  @ApiProperty() recipient!: string;
  @ApiProperty({ enum: NotificationStatus }) status!: NotificationStatus;
  @ApiProperty() attemptCount!: number;
  @ApiPropertyOptional() lastAttemptAt?: Date | null;
  @ApiPropertyOptional() nextRetryAt?: Date | null;
  @ApiPropertyOptional() sentAt?: Date | null;
  @ApiPropertyOptional() failedAt?: Date | null;
  @ApiPropertyOptional() errorCode?: string | null;
  @ApiPropertyOptional() safeErrorMessage?: string | null;
  @ApiPropertyOptional() providerMessageId?: string | null;
  @ApiProperty() createdAt!: Date;
}

export class NotificationDeliveryListResponseDto {
  @ApiProperty({ type: [NotificationDeliveryResponseDto] }) data!: NotificationDeliveryResponseDto[];
  @ApiProperty() meta!: { page: number; limit: number; total: number; totalPages: number };
}
