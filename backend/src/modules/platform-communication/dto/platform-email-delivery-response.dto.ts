import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationChannel, NotificationStatus, NotificationType } from '@prisma/client';

export class PlatformEmailCapabilityResponseDto {
  @ApiProperty() enabled!: boolean;
  @ApiProperty() configured!: boolean;
  @ApiProperty() fromEmailConfigured!: boolean;
}

export class PlatformEmailDeliveryResponseDto {
  @ApiProperty() deliveryId!: string;
  @ApiProperty() notificationId!: string;
  @ApiPropertyOptional() companyId!: string | null;
  @ApiProperty() recipientUserId!: string;
  @ApiProperty({ enum: NotificationType }) eventType!: NotificationType;
  @ApiProperty({ enum: NotificationChannel }) channel!: NotificationChannel;
  @ApiProperty({ enum: NotificationStatus }) status!: NotificationStatus;
  @ApiProperty() recipient!: string;
  @ApiProperty() attemptCount!: number;
  @ApiProperty() isClaimed!: boolean;
  @ApiPropertyOptional() claimExpiresAt!: Date | null;
  @ApiPropertyOptional() lastAttemptAt!: Date | null;
  @ApiPropertyOptional() nextRetryAt!: Date | null;
  @ApiPropertyOptional() sentAt!: Date | null;
  @ApiPropertyOptional() failedAt!: Date | null;
  @ApiPropertyOptional() providerMessageId!: string | null;
  @ApiPropertyOptional() errorCode!: string | null;
  @ApiPropertyOptional() safeErrorMessage!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PlatformEmailDeliveryListResponseDto {
  @ApiProperty({ type: [PlatformEmailDeliveryResponseDto] }) data!: PlatformEmailDeliveryResponseDto[];
  @ApiProperty() meta!: { page: number; limit: number; total: number; totalPages: number };
}
