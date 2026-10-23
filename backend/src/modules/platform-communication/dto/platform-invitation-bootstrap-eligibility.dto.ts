import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const PLATFORM_INVITATION_ELIGIBILITY_REASONS = [
  'ELIGIBLE', 'GATE_DISABLED', 'GENERAL_DELIVERY_ENABLED', 'TARGET_INELIGIBLE',
  'INVITATION_MISSING', 'INVITATION_AMBIGUOUS', 'INVITATION_EXPIRED',
  'DELIVERY_INELIGIBLE', 'RECIPIENT_MISMATCH', 'SMTP_CONFIGURATION_UNAVAILABLE',
  'SMTP_CONFIGURATION_AMBIGUOUS', 'DATABASE_AUTHORITY_ESTABLISHED',
  'DISPATCH_UNRESOLVED', 'RATE_LIMITED',
] as const;

export type PlatformInvitationEligibilityReason = typeof PLATFORM_INVITATION_ELIGIBILITY_REASONS[number];

export class PlatformInvitationEligibilityTargetDto {
  @ApiProperty() userId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() email!: string;
  @ApiProperty() status!: string;
}

export class PlatformInvitationEligibilityDeliveryDto {
  @ApiProperty() deliveryId!: string;
  @ApiProperty() notificationId!: string;
  @ApiProperty() status!: string;
  @ApiProperty() attemptCount!: number;
  @ApiProperty() isClaimed!: boolean;
  @ApiProperty() invitationExpiresAt!: Date;
}

export class PlatformInvitationEligibilitySmtpDto {
  @ApiProperty() configurationId!: string;
  @ApiProperty() version!: number;
  @ApiProperty() revision!: number;
  @ApiProperty() lifecycle!: string;
}

export class PlatformInvitationBootstrapEligibilityResponseDto {
  @ApiProperty() available!: boolean;
  @ApiProperty({ enum: PLATFORM_INVITATION_ELIGIBILITY_REASONS }) reasonCode!: PlatformInvitationEligibilityReason;
  @ApiProperty() gateEnabled!: boolean;
  @ApiPropertyOptional({ type: PlatformInvitationEligibilityTargetDto }) target!: PlatformInvitationEligibilityTargetDto | null;
  @ApiPropertyOptional({ type: PlatformInvitationEligibilityDeliveryDto }) delivery!: PlatformInvitationEligibilityDeliveryDto | null;
  @ApiPropertyOptional({ type: PlatformInvitationEligibilitySmtpDto }) smtp!: PlatformInvitationEligibilitySmtpDto | null;
}
