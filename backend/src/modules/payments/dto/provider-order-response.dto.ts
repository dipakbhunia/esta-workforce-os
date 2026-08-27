import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProviderMode, PaymentProviderOrderStatus, PaymentProviderType } from '@prisma/client';

export class ProviderOrderResponseDto {
  @ApiProperty({ format: 'uuid' }) paymentId!: string;
  @ApiProperty() providerOrderId!: string;
  @ApiProperty() receipt!: string;
  @ApiProperty({ enum: PaymentProviderType }) provider!: PaymentProviderType;
  @ApiProperty({ enum: PaymentProviderMode }) providerMode!: PaymentProviderMode;
  @ApiProperty({ enum: PaymentProviderOrderStatus }) status!: PaymentProviderOrderStatus;
  @ApiProperty() providerStatus!: string;
  @ApiProperty({ description: 'Integer minor units serialized as a decimal string' }) amountMinor!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ description: 'Public checkout key for the exact credential version bound to this order' }) keyId!: string;
  @ApiPropertyOptional({ nullable: true }) providerCreatedAt!: Date | null;
}
