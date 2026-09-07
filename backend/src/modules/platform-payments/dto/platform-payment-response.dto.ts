import { ApiProperty } from '@nestjs/swagger';
import {
  PaymentProviderMode,
  PaymentProviderOrderStatus,
  PaymentProviderType,
  PaymentPurpose,
  PaymentStatus,
  SubscriptionStatus,
} from '@prisma/client';

export enum PlatformPaymentActivationStatus {
  NOT_READY = 'NOT_READY',
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED',
  UNRESOLVED = 'UNRESOLVED',
}

export class PlatformPaymentCompanyDto { id!: string; name!: string; }
export class PlatformPaymentPlanDto { id!: string; code!: string; name!: string; }
export class PlatformPaymentSubscriptionDto {
  id!: string;
  @ApiProperty({ enum: SubscriptionStatus }) status!: SubscriptionStatus;
  plan!: PlatformPaymentPlanDto;
}
export class PlatformPaymentProviderOrderDto {
  id!: string;
  sequence!: number;
  providerOrderId!: string;
  @ApiProperty({ enum: PaymentProviderOrderStatus }) status!: PaymentProviderOrderStatus;
  providerStatus!: string;
}
export class PlatformPaymentActivationDto {
  @ApiProperty({ enum: PlatformPaymentActivationStatus }) status!: PlatformPaymentActivationStatus;
}
export class PlatformPaymentFailureDto { code!: string | null; message!: string | null; failedAt!: string; }

export class PlatformPaymentResponseDto {
  id!: string;
  company!: PlatformPaymentCompanyDto;
  subscription!: PlatformPaymentSubscriptionDto;
  @ApiProperty({ enum: PaymentPurpose }) purpose!: PaymentPurpose;
  amountMinor!: string;
  currency!: string;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty({ enum: PaymentProviderType }) provider!: PaymentProviderType;
  @ApiProperty({ enum: PaymentProviderMode }) mode!: PaymentProviderMode;
  providerStatus!: string | null;
  providerOrder!: PlatformPaymentProviderOrderDto | null;
  activation!: PlatformPaymentActivationDto;
  failure!: PlatformPaymentFailureDto | null;
  authorizedAt!: string | null;
  capturedAt!: string | null;
  failedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}
