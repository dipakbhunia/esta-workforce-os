import { ApiProperty } from '@nestjs/swagger';
import { PaymentStatus, SubscriptionStatus } from '@prisma/client';

export class CheckoutConfirmationResponseDto {
  @ApiProperty({ format: 'uuid' }) paymentId!: string;
  @ApiProperty() providerOrderId!: string;
  @ApiProperty() providerPaymentId!: string;
  @ApiProperty({ enum: ['VERIFIED'] }) verificationStatus!: 'VERIFIED';
  @ApiProperty() verifiedAt!: Date;
  @ApiProperty({ enum: PaymentStatus }) paymentStatus!: PaymentStatus;
  @ApiProperty({ enum: SubscriptionStatus }) subscriptionStatus!: SubscriptionStatus;
}
